<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getGame } from '@/core/game-registry'
import { getLevelRecords, getUnlockedCount, isUnlocked, progressSlotKey, TOTAL_LEVELS } from '@/core/level-manager'
import type { LevelRecord } from '@/core/types'
import { usePlatformStore } from '@/stores/platform'
import PageHeader from '@/components/PageHeader.vue'
import { schemesForTopic } from '@/games/jigsaw/schemes'
import type { JigsawTopicId } from '@/games/jigsaw/schemes'
import { warmBuiltinOptima } from '@/games/jigsaw/optimize'

const props = defineProps<{ gameId: string }>()
const { t } = useI18n()
const platform = usePlatformStore()

const game = getGame(props.gameId)
/** 多轨游戏（键盘四模式 / 拼图专题）的进度轨列表；单轨为 null */
const tracks = game?.tracks && game.tracks.length > 0 ? game.tracks : null

/** 当前选中进度轨（多轨游戏页签；默认首轨） */
const selectedTrack = ref<string | null>(tracks ? tracks[0]!.id : null)

/** 进度槽键：多轨走 gameId:track，单轨走 gameId */
const slotKey = computed(() => progressSlotKey(props.gameId, selectedTrack.value ?? undefined))

/** 轨内总关数：动态关卡游戏（拼图按方案数）经模块读取，缺省固定 50 */
const total = computed(() => game?.levelCount?.(selectedTrack.value ?? undefined) ?? TOTAL_LEVELS)

/** 拼图专题轨第 n 关的成绩键 = 方案 id（方案删除重排不错位）；其他 = 关卡号 */
function recordKey(n: number): string {
  if (props.gameId === 'jigsaw' && selectedTrack.value) {
    return schemesForTopic(selectedTrack.value as JigsawTopicId)[n - 1]?.id ?? ''
  }
  return String(n)
}

function readUnlocked(): number {
  return getUnlockedCount(slotKey.value, total.value)
}
function readRecords(): Record<string, LevelRecord> {
  return getLevelRecords(slotKey.value)
}

const unlockedCount = ref(readUnlocked())
const records = ref<Record<string, LevelRecord>>(readRecords())
const gameNameKey = computed(() => game?.name ?? '')
const selectedTrackLabel = computed(() => {
  const tr = tracks?.find((x) => x.id === selectedTrack.value)
  return tr ? t(tr.labelKey) : ''
})

/** 页头标题：游戏名 · 轨名（多轨）/「选择关卡」（单轨） */
const headerTitle = computed(
  () => `${t(gameNameKey.value)} · ${tracks ? selectedTrackLabel.value : t('level.title')}`,
)

function refresh(): void {
  unlockedCount.value = readUnlocked()
  records.value = readRecords()
}

// ---- 内置图库切块规格预热（验收返工「每图自动选最优切块」）----
// 启动已后台预热（main.ts），此处幂等补一次：进关时 createTopicLevel 读到的是内容优选规格。
// 分析中不锁关卡格（异常环境恒回落兜底网格，锁死反而进不了关）。
const analyzing = ref(false)

onMounted(() => {
  if (props.gameId !== 'jigsaw') return
  analyzing.value = true
  void warmBuiltinOptima().finally(() => {
    analyzing.value = false
    refresh()
  })
})

/** 切换进度轨（多轨游戏页签）：重读该轨独立解锁/星级与动态关数 */
function selectTrack(id: string): void {
  selectedTrack.value = id
  refresh()
}

/** 从游戏返回时刷新进度（父组件可调用） */
defineExpose({ refresh })

const levelNumbers = computed(() =>
  Array.from({ length: total.value }, (_, i) => i + 1),
)

function unlocked(n: number): boolean {
  return isUnlocked(slotKey.value, n, total.value)
}

function enterLevel(n: number): void {
  if (!unlocked(n) || !game) return
  platform.openLevel(game.createLevel(n, selectedTrack.value ?? undefined))
}
</script>

<template>
  <div class="level-select" data-view="select">
    <PageHeader :title="headerTitle" @back="platform.goMenu()">
      <template #actions>
        <button
          v-if="gameId === 'jigsaw'"
          class="secondary-btn"
          data-nav="schemes"
          @click="platform.openSchemes()"
        >
          {{ t('schemes.title') }}
        </button>
      </template>
    </PageHeader>

    <div v-if="tracks" class="track-tabs" data-role="track-tabs">
      <button
        v-for="tr in tracks"
        :key="tr.id"
        class="track-tab"
        :class="{ 'is-active': tr.id === selectedTrack }"
        :data-track="tr.id"
        @click="selectTrack(tr.id)"
      >
        {{ t(tr.labelKey) }}
      </button>
    </div>

    <p class="progress-line">{{ t('level.progress', { unlocked: unlockedCount, total: total }) }}</p>

    <p v-if="analyzing" class="progress-line" data-role="analyzing">{{ t('level.analyzing') }}</p>

    <p v-if="total === 0" class="progress-line" data-role="empty-topic">{{ t('level.emptyTopic') }}</p>

    <button
      v-if="total === 0 && gameId === 'jigsaw'"
      class="primary-btn empty-import-btn"
      data-role="empty-import"
      @click="platform.openSchemes(true)"
    >
      {{ t('level.emptyImport') }}
    </button>

    <div v-if="total > 0" class="level-grid">
      <button
        v-for="n in levelNumbers"
        :key="n"
        class="level-cell"
        :class="{ 'is-locked': !unlocked(n) }"
        :data-level="n"
        :disabled="!unlocked(n)"
        @click="enterLevel(n)"
      >
        <span class="level-n">{{ n }}</span>
        <span
          v-if="unlocked(n) && records[recordKey(n)]"
          class="level-stars"
          :data-stars="records[recordKey(n)].stars"
        >
          {{ '★'.repeat(records[recordKey(n)].stars) }}
        </span>
        <span v-if="unlocked(n) && records[recordKey(n)]" class="level-best" :data-best-ms="records[recordKey(n)].bestMs">
          {{ t('level.best') }} {{ (records[recordKey(n)].bestMs / 1000).toFixed(1) }}s
        </span>
        <span v-if="!unlocked(n)" class="level-lock">🔒</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.level-select {
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.progress-line {
  margin: 0;
  color: var(--color-text-secondary);
}
.track-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.track-tab {
  padding: 8px 18px;
  border-radius: var(--radius-md);
  border: 2px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
}
.track-tab:hover {
  border-color: var(--color-primary);
}
.track-tab.is-active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}
.level-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 10px;
  max-width: 960px;
}
.empty-import-btn {
  align-self: flex-start;
  margin-top: -8px;
}
.level-cell {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  border: 2px solid var(--color-border);
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 18px;
  font-weight: 600;
}
.level-cell:hover:not(:disabled) {
  border-color: var(--color-primary);
}
.level-cell.is-locked {
  opacity: 0.45;
  cursor: not-allowed;
}
.level-stars {
  font-size: 12px;
  color: var(--color-accent);
  line-height: 1;
}
.level-best {
  font-size: 10px;
  color: var(--color-text-secondary);
  line-height: 1.2;
}
.level-lock {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 12px;
}
</style>
