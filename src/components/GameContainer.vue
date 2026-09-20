<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getGame } from '@/core/game-registry'
import { recordResult, getLevelRecord, progressSlotKey, TOTAL_LEVELS } from '@/core/level-manager'
import { createTimer, formatElapsed, type Timer } from '@/core/timer'
import type { BaseLevelConfig, GameInstance, GameHooks, LevelProgress, LevelResult } from '@/core/types'
import { usePlatformStore } from '@/stores/platform'
import { schemeLevelNumber, createTopicLevel, topicLevelCount } from '@/games/jigsaw/schemes'
import type { JigsawLevelConfig } from '@/games/jigsaw/level'
import PauseOverlay from './PauseOverlay.vue'
import SettlePanel from './SettlePanel.vue'
import ModalOverlay from '@/components/ModalOverlay.vue'

const props = defineProps<{ level: BaseLevelConfig }>()
const { t } = useI18n()
const platform = usePlatformStore()

/** 拼图方案关卡标记（内置 bs-* / 用户 js-*；成绩按方案 id 记在专题轨，方案删除重排不错位） */
const schemeId = (props.level as JigsawLevelConfig).schemeId

/** 多轨游戏进度槽键（键盘四模式 / 拼图专题）；单轨 = gameId */
const slotKey = progressSlotKey(props.level.gameId, props.level.track)

/** 本关成绩记录键：拼图方案关 = 方案 id，其他 = 关卡号 */
const recordKey = schemeId ?? String(props.level.n)

/** 轨内总关数：动态关卡游戏（拼图按方案数）经模块读取，缺省固定 50 */
const total = computed(() => getGame(props.level.gameId)?.levelCount?.(props.level.track) ?? TOTAL_LEVELS)

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
const timeLimit = computed(() => platform.timeLimit)

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
  const prev = getLevelRecord(slotKey, recordKey)
  const record = isFail
    ? prev
    : recordResult(slotKey, result, { total: total.value, recordKey })
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

/**
 * 重建第 n 关配置：拼图方案关按方案 id 重新定位（方案被删返回 null → 回选关页兜底）；
 * 其他走模块 createLevel（动态轨越界时同样回选关页）。
 */
function rebuildLevel(n: number): BaseLevelConfig | null {
  const game = getGame(props.level.gameId)
  if (!game) return null
  if (schemeId) {
    const loc = schemeLevelNumber(schemeId)
    return loc ? createTopicLevel(loc.n, loc.topic) : null
  }
  try {
    return game.createLevel(n, props.level.track)
  } catch {
    return null
  }
}

function retryLevel(): void {
  teardown()
  const config = rebuildLevel(props.level.n)
  if (!config) return platform.exitToSelect()
  platform.openLevel(config)
}

function nextLevel(): void {
  teardown()
  // 拼图方案关：按方案当前定位取下一关（方案被删则回选关页）；最后一关后回选关页
  if (schemeId) {
    const loc = schemeLevelNumber(schemeId)
    if (!loc || loc.n >= topicLevelCount(loc.topic)) return platform.exitToSelect()
    return platform.openLevel(createTopicLevel(loc.n + 1, loc.topic))
  }
  if (props.level.n >= total.value) return platform.exitToSelect()
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

    <ModalOverlay v-if="restLockMinutes > 0" :card="false" :z="30" class="rest-lock" data-role="rest-lock">
      <p>{{ t('timeLimit.reachedAntiAddiction') }}</p>
      <p class="rest-countdown">{{ t('timeLimit.lockRemaining', { minutes: restLockMinutes }) }}</p>
    </ModalOverlay>

    <SettlePanel
      v-if="platform.settleInfo"
      :info="platform.settleInfo"
      :game-id="level.gameId"
      :level-n="level.n"
      :total="total"
      :slot-key="slotKey"
      :record-key="recordKey"
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
  color: #fff;
  font-size: 22px;
}
.rest-countdown {
  font-variant-numeric: tabular-nums;
}
</style>
