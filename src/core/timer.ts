// 计时器：正计时 + 可选上限（竞赛/防沉迷两语义）（技术架构 §13.1）
// 纯逻辑实现：时钟源可注入（单测确定性），不触碰 DOM；驱动由平台 UI 的 rAF 循环负责。

export type TimerLimitMode = 'competition' | 'antiAddiction'

export interface TimerLimit {
  mode: TimerLimitMode
  /** 每关上限 ms */
  limitMs: number
}

export interface TimerOptions {
  /** 注入时钟源（默认 performance.now；测试用受控时钟） */
  now?: () => number
  limit?: TimerLimit
}

export type TimerState = 'idle' | 'running' | 'paused' | 'stopped'

export interface Timer {
  start(): void
  pause(): void
  resume(): void
  /** 终止并返回最终累计用时 ms */
  stop(): number
  /** 当前累计用时 ms（不含未暂停的进行段则按当前时刻计算） */
  getElapsedMs(): number
  /** 上限检查：'ok' 未达上限；'reached' 已达（竞赛→立即结算，防沉迷→提醒休息） */
  checkLimit(): 'ok' | 'reached' | 'none'
  getState(): TimerState
}

/** 创建正计时器（支持暂停恢复累计；上限检测不含暂停段） */
export function createTimer(options: TimerOptions = {}): Timer {
  const now = options.now ?? (() => performance.now())
  let state: TimerState = 'idle'
  let accumulatedMs = 0
  let segmentStart: number | null = null

  const currentSegmentMs = (): number => (segmentStart === null ? 0 : now() - segmentStart)

  return {
    start() {
      if (state !== 'idle') throw new Error(`timer: start 非法状态 ${state}`)
      state = 'running'
      segmentStart = now()
    },
    pause() {
      if (state !== 'running') throw new Error(`timer: pause 非法状态 ${state}`)
      accumulatedMs += currentSegmentMs()
      segmentStart = null
      state = 'paused'
    },
    resume() {
      if (state !== 'paused') throw new Error(`timer: resume 非法状态 ${state}`)
      state = 'running'
      segmentStart = now()
    },
    stop() {
      if (state === 'stopped') return accumulatedMs
      if (state === 'running') accumulatedMs += currentSegmentMs()
      segmentStart = null
      state = 'stopped'
      return accumulatedMs
    },
    getElapsedMs() {
      if (state === 'stopped') return accumulatedMs
      return accumulatedMs + currentSegmentMs()
    },
    checkLimit() {
      // 仅 running 状态检测：暂停/停止期间不计时也不触发上限
      if (!options.limit || state !== 'running') return 'none'
      return this.getElapsedMs() >= options.limit.limitMs ? 'reached' : 'ok'
    },
    getState() {
      return state
    },
  }
}

/** ms → mm:ss 显示格式（计时显示用） */
export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const mm = Math.floor(totalSec / 60)
  const ss = totalSec % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}
