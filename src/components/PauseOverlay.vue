<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ModalOverlay from '@/components/ModalOverlay.vue'

defineEmits<{ resume: []; retry: []; exit: [] }>()
const { t } = useI18n()
</script>

<template>
  <ModalOverlay :z="20" data-role="pause">
    <h3>{{ t('pause.title') }}</h3>
    <div class="pause-actions">
      <button class="primary-btn" data-nav="resume" @click="$emit('resume')">{{ t('pause.resume') }}</button>
      <button class="secondary-btn" data-nav="retry" @click="$emit('retry')">{{ t('common.retry') }}</button>
      <button class="secondary-btn" data-nav="exit" @click="$emit('exit')">{{ t('common.exitLevel') }}</button>
    </div>
  </ModalOverlay>
</template>

<style scoped>
h3 {
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
