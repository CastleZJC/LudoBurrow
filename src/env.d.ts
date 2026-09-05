/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

/** 测试工具：手动驱动排队的 rAF 回调（tests/setup.ts 注入） */
interface Window {
  __flushRaf(time?: number): void
}
