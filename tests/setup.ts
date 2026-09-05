// 全局测试 setup：canvas mock / rAF mock / localStorage 清理（测试规范 §2.3）
import { beforeEach } from 'vitest'

// ---- Canvas 2D context mock：happy-dom 无 Canvas 实现，返回记录调用的假 ctx ----
type CtxCall = { op: string; args: unknown[] }

function createMockCtx2D(): CanvasRenderingContext2D {
  const calls: CtxCall[] = []
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === '__calls') return calls
      if (prop === 'canvas') return { width: 300, height: 150 }
      if (
        [
          'fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'textBaseline',
          'globalAlpha', 'lineCap', 'lineJoin', 'shadowBlur', 'shadowColor',
        ].includes(prop)
      ) {
        return undefined
      }
      return (...args: unknown[]) => {
        calls.push({ op: prop, args })
        if (prop === 'measureText') return { width: 10 }
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return { addColorStop: () => {} }
        }
        if (prop === 'getImageData') {
          return { data: new Uint8ClampedArray(4), width: 1, height: 1 }
        }
        return undefined
      }
    },
    set(target, prop: string, value) {
      target[prop] = value
      calls.push({ op: `set:${prop}`, args: [value] })
      return true
    },
  }
  return new Proxy({}, handler) as unknown as CanvasRenderingContext2D
}

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value(_type: string, _opts?: unknown): CanvasRenderingContext2D | null {
    if (!(this instanceof HTMLCanvasElement)) return null
    if (!('__mockCtx' in this)) {
      ;(this as unknown as Record<string, unknown>).__mockCtx = createMockCtx2D()
    }
    return (this as unknown as Record<string, unknown>).__mockCtx as CanvasRenderingContext2D
  },
})

// ---- toDataURL mock（离屏缩放等路径；happy-dom 无真实 Canvas 实现，无条件替换） ----
Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  configurable: true,
  value: () => 'data:image/png;base64,mock',
})

// ---- rAF mock：可控同步回调 ----
let rafId = 0
const rafQueue = new Map<number, FrameRequestCallback>()
if (!('requestAnimationFrame' in globalThis) || (import.meta as { env?: { VITEST?: boolean } }).env?.VITEST) {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = ++rafId
    rafQueue.set(id, cb)
    return id
  }
  globalThis.cancelAnimationFrame = (id: number) => {
    rafQueue.delete(id)
  }
}

/** 测试工具：手动驱动所有排队的 rAF 回调（模拟一帧） */
declare global {
  // eslint-disable-next-line no-var -- 测试全局工具注入
  var __flushRaf: (time?: number) => void
}
globalThis.__flushRaf = (time = 0) => {
  const cbs = [...rafQueue.entries()]
  rafQueue.clear()
  for (const [, cb] of cbs) cb(time)
}

// ---- localStorage 每测试清理（测试隔离） ----
beforeEach(() => {
  localStorage.clear()
})
