<script setup lang="ts">
// 二次确认按钮公共组件：首击进入确认态换文案，超时自动复原，二击执行
// 原两处同构状态机统一：SchemeManager 删除确认 / SchemeEditor F-18 保存确认
// autoArm=true 无条件两段式；false 时每次点击都 emit confirm(wasConfirmed)，由调用方校验后决定 arm()
import { onBeforeUnmount, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    confirmLabel: string
    variant?: 'primary' | 'secondary' | 'danger'
    role?: string
    confirmRole?: string
    autoArm?: boolean
    confirmMs?: number
  }>(),
  { variant: 'secondary', role: undefined, confirmRole: undefined, autoArm: true, confirmMs: 3000 },
)

const emit = defineEmits<{ confirm: [wasConfirmed: boolean] }>()

const confirming = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

/** 进入确认态（confirmMs 后自动复原） */
function arm(): void {
  confirming.value = true
  clearTimer()
  timer = setTimeout(() => (confirming.value = false), props.confirmMs)
}

/** 退出确认态并取消自动复原计时 */
function reset(): void {
  confirming.value = false
  clearTimer()
}

function onClick(): void {
  if (confirming.value) {
    reset()
    emit('confirm', true)
    return
  }
  if (props.autoArm) {
    arm()
    return
  }
  emit('confirm', false)
}

onBeforeUnmount(clearTimer)

defineExpose({ arm, reset })
</script>

<template>
  <button
    type="button"
    :class="[variant === 'primary' ? 'primary-btn' : 'secondary-btn', { 'is-danger': variant === 'danger' }]"
    :data-role="confirming ? (confirmRole ?? role) : role"
    @click="onClick"
  >
    {{ confirming ? confirmLabel : label }}
  </button>
</template>

<style scoped>
.is-danger:hover {
  border-color: #c0392b;
  color: #c0392b;
}
</style>
