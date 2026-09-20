<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SettleInfo } from '@/stores/platform'
import { getLevelRecord, TOTAL_LEVELS } from '@/core/level-manager'
import { formatElapsed } from '@/core/timer'
import ModalOverlay from '@/components/ModalOverlay.vue'

const props = defineProps<{
  info: SettleInfo
  gameId: string
  levelN: number
  /** 轨内总关数（动态关卡游戏传实际值；缺省固定 50） */
  total?: number
  /** 进度槽键（多轨游戏传 gameId:track；缺省 gameId） */
  slotKey?: string
  /** 成绩记录键（拼图方案关传方案 id；缺省关卡号） */
  recordKey?: string
}>()
defineEmits<{ next: []; retry: []; exit: [] }>()
const { t } = useI18n()

const bestRecord = computed(() =>
  getLevelRecord(props.slotKey ?? props.gameId, props.recordKey ?? String(props.levelN)),
)
const isLastLevel = computed(() => props.levelN >= (props.total ?? TOTAL_LEVELS))
// 成绩行标签按游戏口径区分（LevelResult.mistakes 语义各游戏自定）；未知游戏缺省「失误」
const scoreLabelKey = computed(() => {
  if (props.gameId === 'jigsaw') return 'settle.helps'
  if (props.gameId === 'maze') return 'common.steps'
  return 'common.mistakes'
})
</script>

<template>
  <ModalOverlay :z="40" data-role="settle">
    <h3 :class="info.isFail ? 'is-fail' : 'is-success'">
      {{ info.isFail ? t('settle.fail') : t('settle.success') }}
    </h3>

    <div class="stars" data-role="stars">{{ '★'.repeat(info.result.stars) }}{{ '☆'.repeat(3 - info.result.stars) }}</div>

    <dl class="settle-stats">
      <div class="stat-row"><dt>{{ t('common.time') }}</dt><dd data-stat="elapsed">{{ formatElapsed(info.result.elapsedMs) }}</dd></div>
      <div class="stat-row"><dt>{{ t(scoreLabelKey) }}</dt><dd data-stat="mistakes">{{ info.result.mistakes }}</dd></div>
      <div v-if="bestRecord" class="stat-row">
        <dt>{{ t('settle.best') }}</dt>
        <dd data-stat="best">{{ formatElapsed(bestRecord.bestMs) }}</dd>
      </div>
    </dl>

    <p v-if="info.isNewBest" class="new-best">{{ t('settle.newBest') }}</p>

    <div class="settle-actions">
      <button class="secondary-btn" data-nav="retry" @click="$emit('retry')">{{ t('common.retry') }}</button>
      <button v-if="!info.isFail && !isLastLevel" class="primary-btn" data-nav="next" @click="$emit('next')">
        {{ t('common.next') }}
      </button>
      <button class="secondary-btn" data-nav="exit" @click="$emit('exit')">{{ t('common.exitLevel') }}</button>
    </div>
  </ModalOverlay>
</template>

<style scoped>
h3 {
  margin: 0;
  font-size: 28px;
}
.is-success { color: var(--color-primary); }
.is-fail { color: var(--color-danger, #c0392b); }
.stars {
  font-size: 40px;
  color: var(--color-accent);
  letter-spacing: 4px;
}
.settle-stats {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 220px;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  gap: 24px;
}
.stat-row dt { color: var(--color-text-secondary); }
.stat-row dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
.new-best {
  color: var(--color-accent);
  font-weight: 700;
  margin: 0;
}
.settle-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}
</style>
