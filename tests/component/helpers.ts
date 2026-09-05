// 组件/store 测试公用挂载工具：注入 pinia + i18n（与 main.ts 装配一致）
import { mount, type ComponentMountingOptions } from '@vue/test-utils'
import { createPinia, getActivePinia, setActivePinia, type Pinia } from 'pinia'
import type { Component } from 'vue'
import { i18n } from '@/i18n'

export interface MountWithAppOptions extends ComponentMountingOptions<unknown> {
  pinia?: Pinia
}

/** 挂载组件并注入平台插件（pinia + i18n）；缺省复用当前 active pinia（无则新建并激活） */
export function mountWithApp(component: Component, options: MountWithAppOptions = {}) {
  const { pinia, ...rest } = options
  const active = pinia ?? (getActivePinia() as Pinia | null) ?? createPinia()
  setActivePinia(active)
  return mount(component, {
    global: {
      plugins: [active, i18n],
    },
    ...rest,
  })
}
