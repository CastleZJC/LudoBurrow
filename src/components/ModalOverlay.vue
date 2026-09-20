<script setup lang="ts">
// 模态浮层公共组件（遮罩 + 居中卡片）
// 原四处同构浮层统一：App 损坏存档对话框（fixed）/ PauseOverlay / SettlePanel / GameContainer 休息锁定（card=false）
withDefaults(defineProps<{ fixed?: boolean; card?: boolean; z?: number }>(), { fixed: false, card: true, z: undefined })
</script>

<template>
  <div class="modal-overlay" :class="{ 'is-fixed': fixed }" :style="z !== undefined ? { zIndex: z } : undefined">
    <div v-if="card" class="modal-card"><slot /></div>
    <slot v-else />
  </div>
</template>

<style scoped>
.modal-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgb(0 0 0 / 50%);
}
.modal-overlay.is-fixed {
  position: fixed;
}
.modal-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: 32px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  box-shadow: var(--shadow-lg);
}
</style>
