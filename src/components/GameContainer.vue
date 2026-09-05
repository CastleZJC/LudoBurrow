<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getGame } from '@/core/game-registry'
import { recordResult, getLevelRecord, TOTAL_LEVELS } from '@/core/level-manager'
import { createTimer, formatElapsed, type Timer } from '@/core/timer'
import type { BaseLevelConfig, GameInstance, GameHooks, LevelProgress, LevelResult } from '@/core/types'
import { usePlatformStore } from '@/stores/platform'
import { getScheme, getSchemeLevelRecord, recordSchemeResult, schemeLevel } from '@/games/jigsaw/schemes'
import type { JigsawLevelConfig } from '@/games/jigsaw/level'
import PauseOverlay from './PauseOverlay.vue'
import SettlePanel from './SettlePanel.vue'

const props = defineProps<{ level: BaseLevelConfig }>()
const { t } = useI18n()
const platform = usePlatformStore()

/** 拼图方案关卡（挂载时快照；成绩写入方案独立进度槽，§11.8） */
const schemeId = (props.level as JigsawLevelConfig).schemeId

const mountHost = ref<HTMLElement | null>(null)
const elapsedText = ref('00:00')
const progressText = ref('')
const paused = ref(false)
/** 防沉迷锁定剩余分钟（>0 时锁定界面） */
const restLockMinutes = ref(0)

let instance: GameInstance | null = null
let timer: Timer | null = null
let rafId = 0
let settled = false

const gameNameKey = computed(() => getGame(props.level.gameId)?.name ?? '')
const timeLimit = computed(() => platform.settings.timeLimit)

function tickLoop(): void {
  if (!timer || settled || paused.value) return
  elapsedText.value = formatElapsed(timer.getElapsedMs())
  if (timer.checkLimit() === 'reached') {
    handleLimitReached()
    return
  }
  rafId = requestAnimationFrame(tickLoop)
}

function handleLimitReached(): void {
  if (!timer || settled) return
  const mode = timeLimit.value.mode
  if (mode === 'competition') {
    // 竞赛模式：到时立即结算，未完成为失败（F-07）
    instance?.pause()
    finishWithResult({
      gameId: props.level.gameId,
      n: props.level.n,
      elapsedMs: timer.stop(),
      mistakes: 0,
      stars: 1,
      meta: { timeUp: true },
    }, true)
  } else if (mode === 'antiAddiction') {
    // 防沉迷模式：到时提醒休息 + 锁定 lockMs（F-08）
    instance?.pause()
    paused.value = true
    restLockMinutes.value = Math.ceil(timeLimit.value.lockMs / 60_000)
    startRestLockCountdown()
  }
}

let lockTimerId: ReturnType<typeof setInterval> | null = null
function startRestLockCountdown(): void {
  const unlockAt = Date.now() + timeLimit.value.lockMs
  lockTimerId = setInterval(() => {
    const remain = Math.max(0, Math.ceil((unlockAt - Date.now()) / 60_000))
    restLockMinutes.value = remain
    if (remain <= 0 && lockTimerId) {
      clearInterval(lockTimerId)
      lockTimerId = null
      // 休息结束：恢复游戏
      paused.value = false
      timer?.resume()
      instance?.resume()
      rafId = requestAnimationFrame(tickLoop)
    }
  }, 1000)
}

const hooks: GameHooks = {
  onProgress(payload: LevelProgress) {
    progressText.value = `${payload.done}/${payload.total}`
  },
  onComplete(result: LevelResult) {
    // elapsedMs 由平台计时权威覆写（计时是平台职责，游戏实例不持有时钟）
    finishWithResult({ ...result, elapsedMs: timer ? timer.stop() : result.elapsedMs }, false)
  },
  onAbandon() {
    instance?.destroy()
    instance = null
    platform.exitToSelect()
  },
}

/** 星级钳位到 1-3（存档数字 → 判别联合的合法值） */
function clampStars(v: number): 1 | 2 | 3 {
  return v >= 3 ? 3 : v >= 2 ? 2 : 1
}

function finishWithResult(result: LevelResult, isFail: boolean): void {
  if (settled) return
  settled = true
  if (lockTimerId) clearInterval(lockTimerId)
  cancelAnimationFrame(rafId)
  instance?.pause()
  const prev = schemeId
    ? getSchemeLevelRecord(schemeId, result.n)
    : getLevelRecord(result.gameId, result.n)
  const record = isFail
    ? prev
    : schemeId
      ? recordSchemeResult(schemeId, result)
      : recordResult(result.gameId, result)
  const isNewBest = !isFail && (
    !prev || result.elapsedMs < prev.bestMs || result.stars > prev.stars
  )
  // 展示星级取历史最高（过关后可能与本次持平或更高）
  const displayStars = record ? record.stars : result.stars
  platform.setSettle({ result: { ...result, stars: clampStars(displayStars) }, isNewBest, isFail })
}

function togglePause(): void {
  if (settled || restLockMinutes.value > 0) return
  paused.value = !paused.value
  if (paused.value) {
    timer?.pause()
    instance?.pause()
  } else {
    timer?.resume()
    instance?.resume()
    rafId = requestAnimationFrame(tickLoop)
  }
}

/** 重建第 n 关配置（方案模式走 schemeLevel；方案已被删则回选关页兜底） */
function rebuildLevel(n: number): BaseLevelConfig | null {
  const game = getGame(props.level.gameId)
  if (!game) return null
  if (schemeId) {
    const scheme = getScheme(schemeId)
    return scheme ? schemeLevel(scheme, n) : null
  }
  return game.createLevel(n)
}

function retryLevel(): void {
  teardown()
  const config = rebuildLevel(props.level.n)
  if (!config) return platform.exitToSelect()
  platform.openLevel(config)
}

function nextLevel(): void {
  teardown()
  // 最后一关完成后回选关页（方案模式同为 50 关）
  if (props.level.n >= TOTAL_LEVELS) return platform.exitToSelect()
  const config = rebuildLevel(props.level.n + 1)
  if (!config) return platform.exitToSelect()
  platform.openLevel(config)
}

function exitLevel(): void {
  teardown()
  platform.exitToSelect()
}

function teardown(): void {
  settled = false
  paused.value = false
  restLockMinutes.value = 0
  if (lockTimerId) clearInterval(lockTimerId)
  lockTimerId = null
  cancelAnimationFrame(rafId)
  timer?.stop()
  timer = null
  instance?.destroy()
  instance = null
}

onMounted(() => {
  const game = getGame(props.level.gameId)
  if (!game || !mountHost.value) return platform.goMenu()
  const tl = timeLimit.value
  timer = createTimer(
    tl.mode === 'off'
      ? {}
      : { limit: { mode: tl.mode === 'competition' ? 'competition' : 'antiAddiction', limitMs: tl.limitMs } },
  )
  instance = game.mount(mountHost.value, props.level, hooks)
  instance.start()
  timer.start()
  rafId = requestAnimationFrame(tickLoop)
})

onBeforeUnmount(teardown)
</script>

<template>
  <div class="game-container" data-view="game">
    <header class="game-header">
      <h2 class="game-title">{{ t(gameNameKey) }} · {{ t('level.levelN', { n: level.n }) }}</h2>
      <div class="hud">
        <span class="hud-time" data-hud="time">{{ t('common.time') }} {{ elapsedText }}</span>
        <span v-if="progressText" class="hud-progress" data-hud="progress">{{ t('container.progress') }} {{ progressText }}</span>
        <button class="secondary-btn" data-nav="pause" @click="togglePause">{{ t('container.pause') }}</button>
      </div>
    </header>

    <div ref="mountHost" class="game-host" data-role="mount-host"></div>

    <PauseOverlay
      v-if="paused && restLockMinutes === 0"
      @resume="togglePause"
      @retry="retryLevel"
      @exit="exitLevel"
    />

    <div v-if="restLockMinutes > 0" class="rest-lock" data-role="rest-lock">
      <p>{{ t('timeLimit.reachedAntiAddiction') }}</p>
      <p class="rest-countdown">{{ t('timeLimit.lockRemaining', { minutes: restLockMinutes }) }}</p>
    </div>

    <SettlePanel
      v-if="platform.settleInfo"
      :info="platform.settleInfo"
      :game-id="level.gameId"
      :level-n="level.n"
      @next="nextLevel"
      @retry="retryLevel"
      @exit="exitLevel"
    />
  </div>
</template>

<style scoped>
.game-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.game-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  border-bottom: 1px solid var(--color-border);
}
.game-title {
  margin: 0;
  font-size: 20px;
}
.hud {
  display: flex;
  align-items: center;
  gap: 16px;
}
.hud-time {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.game-host {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}
.rest-lock {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 22px;
  z-index: 30;
}
.rest-countdown {
  font-variant-numeric: tabular-nums;
}
</style>
