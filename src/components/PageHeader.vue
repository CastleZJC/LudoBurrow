<script setup lang="ts">
// 页头公共组件（返回 + 标题 + 右侧动作区）
// 原三处同构页头统一：LevelSelect / SettingsPanel / SchemeManager（动作区统一靠右）
import { useI18n } from 'vue-i18n'

defineProps<{ title: string }>()
const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
</script>

<template>
  <header class="page-header">
    <button class="secondary-btn" data-nav="back" @click="emit('back')">{{ t('common.back') }}</button>
    <h2 class="page-title">{{ title }}</h2>
    <div class="page-actions"><slot name="actions" /></div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
}
.page-title {
  margin: 0;
  font-size: 24px;
  flex: 1;
}
.page-actions {
  display: flex;
  gap: 10px;
}
</style>
