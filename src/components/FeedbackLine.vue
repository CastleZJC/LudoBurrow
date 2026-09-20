<script setup lang="ts">
// 反馈文本行公共组件（一句话操作反馈，统一次色 14px 口径）
// 原三处样式不一：SettingsPanel（主色）/ SchemeManager 批量反馈 / SchemeEditor AI 与自动最优反馈
</script>

<template>
  <p class="feedback-line"><slot /></p>
</template>

<style scoped>
.feedback-line {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}
</style>
