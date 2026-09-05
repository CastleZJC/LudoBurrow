<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getGame } from '@/core/game-registry'
import { getLevelRecords, getUnlockedCount, isUnlocked, TOTAL_LEVELS } from '@/core/level-manager'
import type { LevelRecord } from '@/core/types'
import { usePlatformStore } from '@/stores/platform'
import {
  activeScheme,
  getSchemeLevelRecords,
  getSchemeUnlockedCount,
  isSchemeLevelUnlocked,
  schemeLevel,
} from '@/games/jigsaw/schemes'

const props = defineProps<{ gameId: string }>()
const { t } = useI18n()
const platform = usePlatformStore()

/** 拼图方案模式（挂载时快照；切换方案经视图切换重挂载取新值，§11.8 切方案=切存档槽） */
const scheme = props.gameId === 'jigsaw' ? activeScheme() : null

const unlockedCount = ref(
  scheme ? getSchemeUnlockedCount(scheme.id) : getUnlockedCount(props.gameId),
)
const records = ref<Record<string, LevelRecord>>(
  scheme ? getSchemeLevelRecords(scheme.id) : getLevelRecords(props.gameId),
)
const gameNameKey = computed(() => getGame(props.gameId)?.name ?? '')

function refresh(): void {
  if (scheme) {
    unlockedCount.value = getSchemeUnlockedCount(scheme.id)
    records.value = getSchemeLevelRecords(scheme.id)
  } else {
    unlockedCount.value = getUnlockedCount(props.gameId)
    records.value = getLevelRecords(props.gameId)
  }
}

/** 从游戏返回时刷新进度（父组件可调用） */
defineExpose({ refresh })

const levelNumbers = computed(() =>
  Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1),
)

function unlocked(n: number): boolean {
  return scheme ? isSchemeLevelUnlocked(scheme.id, n) : isUnlocked(props.gameId, n)
}

function enterLevel(n: number): void {
  if (!unlocked(n)) return
  const game = getGame(props.gameId)
  if (!game) return
  platform.openLevel(scheme ? schemeLevel(scheme, n) : game.createLevel(n))
}
</script>

<template>
  <div class="level-select" data-view="select">
    <header class="select-header">
      <button class="secondary-btn" data-nav="back" @click="platform.goMenu()">
        {{ t('common.back') }}
      </button>
      <h2 class="select-title">
        {{ t(gameNameKey) }} · {{ scheme ? scheme.name : t('level.title') }}
      </h2>
      <button
        v-if="gameId === 'jigsaw'"
        class="secondary-btn"
        data-nav="schemes"
        @click="platform.openSchemes()"
      >
        {{ t('schemes.title') }}
      </button>
    </header>

    <p class="progress-line">{{ t('level.progress', { unlocked: unlockedCount, total: TOTAL_LEVELS }) }}</p>

    <div class="level-grid">
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
          v-if="unlocked(n) && records[String(n)]"
          class="level-stars"
          :data-stars="records[String(n)].stars"
        >
          {{ '★'.repeat(records[String(n)].stars) }}
        </span>
        <span v-if="unlocked(n) && records[String(n)]" class="level-best" :data-best-ms="records[String(n)].bestMs">
          {{ t('level.best') }} {{ (records[String(n)].bestMs / 1000).toFixed(1) }}s
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
.select-header {
  display: flex;
  align-items: center;
  gap: 16px;
}
.select-title {
  margin: 0;
  font-size: 24px;
}
.progress-line {
  margin: 0;
  color: var(--color-text-secondary);
}
.level-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 10px;
  max-width: 960px;
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
