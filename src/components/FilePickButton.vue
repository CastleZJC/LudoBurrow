<script setup lang="ts">
// 文件选择按钮公共组件（label 伪装按钮 + 隐藏 file input）
// 原两套写法统一：label 包 hidden input ×3（App/SettingsPanel/SchemeEditor）与 hidden input + ref.click() ×1（SchemeManager）
// data-role/data-field 等非 class attrs 透传到内部 input（测试与调用方均以 input 元素为锚点）；
// class/style 显式归并到根 label（平台约定：class 永远落在组件根）
import { computed, ref, useAttrs } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{ accept?: string; multiple?: boolean; variant?: 'primary' | 'secondary'; disabled?: boolean }>(),
  { accept: undefined, multiple: false, variant: 'secondary', disabled: false },
)

const emit = defineEmits<{ files: [File[]] }>()

const attrs = useAttrs()
/** 透传给内部 input 的 attrs（class/style 已由根 label 显式消费，剔除防重复落点） */
const passthroughAttrs = computed(() => {
  const rest: Record<string, unknown> = { ...attrs }
  delete rest.class
  delete rest.style
  return rest
})

const inputRef = ref<HTMLInputElement | null>(null)

function onChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = '' // 清空选择，允许重复选取同一文件/同一批
  emit('files', files)
}

/** 程序化打开文件选择器（如选关空态直达批量导入） */
function open(): void {
  if (!props.disabled) inputRef.value?.click()
}

defineExpose({ open })
</script>

<template>
  <label
    class="file-btn"
    :class="[variant === 'primary' ? 'primary-btn' : 'secondary-btn', attrs.class]"
    :style="attrs.style"
  >
    <slot />
    <input
      ref="inputRef"
      type="file"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      v-bind="passthroughAttrs"
      @change="onChange"
    />
  </label>
</template>

<style scoped>
.file-btn {
  position: relative;
  overflow: hidden;
  cursor: pointer;
}
.file-btn input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
