<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineEmits<{ resume: []; retry: []; exit: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="pause-overlay" data-role="pause">
    <div class="pause-card">
      <h3>{{ t('pause.title') }}</h3>
      <div class="pause-actions">
        <button class="primary-btn" data-nav="resume" @click="$emit('resume')">{{ t('pause.resume') }}</button>
        <button class="secondary-btn" data-nav="retry" @click="$emit('retry')">{{ t('pause.retry') }}</button>
        <button class="secondary-btn" data-nav="exit" @click="$emit('exit')">{{ t('pause.exit') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pause-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 45%);
  z-index: 20;
}
.pause-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: 32px 48px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  box-shadow: var(--shadow-lg);
}
.pause-card h3 {
  margin: 0;
  font-size: 24px;
}
.pause-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 200px;
}
</style>
