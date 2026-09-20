// 迷宫实例交互单测（开发计划 4.6：移动状态机 / 碰撞 / 进度上报 / 过关结算 / 生命周期）
// Canvas 2D 走 setup.ts 全局 mock（记录调用可断言渲染路径）；迷宫经 deps 注入手搓
// 已知结构（2×2 L 形），皮肤注入 stub → 完全绕开资源加载，断言聚焦行为而非像素。

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'
import type { GameHooks, GameInstance, LevelProgress, LevelResult } from '@/core/types'
import type { MazeData } from '@/engines/maze-generator'
import { levelSeed } from '@/engines/rng'
import { getSettings } from '@/core/settings'
import { mountMaze } from '@/games/maze/instance'
import type { MazeLevelConfig } from '@/games/maze/level'
import { cellCenter, computeView } from '@/games/maze/view'
import { THEME_PALETTES, paletteSkin, type TileSkin } from '@/games/maze/theme'
import { i18n } from '@/i18n'

/** 手搓 2×2 L 形迷宫：(0,0)→(1,0)→(1,1)，solutionLength=2；(0,0) 上/左为外墙可撞 */
function tinyMaze(): MazeData {
  const size = 2
  const tiles = 5
  const walls = new Uint8Array(tiles * tiles).fill(1)
  const carve = (tx: number, ty: number): void => {
    walls[ty * tiles + tx] = 0
  }
  for (let cy = 0; cy < size; cy++) {
    for (let cx = 0; cx < size; cx++) carve(2 * cx + 1, 2 * cy + 1)
  }
  carve(2, 1) // (0,0)-(1,0) 打通
  carve(3, 2) // (1,0)-(1,1) 打通
  return { size, tiles, walls, start: { x: 0, y: 0 }, goal: { x: 1, y: 1 }, solutionLength: 2, deadEnds: 2 }
}

/** 与 tinyMaze 规格一致的关卡配置（HUD 显示 cfg.size → 保持 2 与迷宫一致） */
const TINY_LEVEL: MazeLevelConfig = {
  gameId: 'maze',
  n: 1,
  seed: levelSeed('maze', 1),
  size: 2,
  branching: 0,
  theme: 'castle',
}

function key(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }))
}

const t = (k: string): string => i18n.global.t(k)

/** 计数皮肤：瓦片/角色绘制次数可断言（挂载即 rebuildBoard 缓存一轮 + paint 首帧） */
function countingSkin(): TileSkin & { tileCalls: number; heroCalls: number } {
  return {
    tileCalls: 0,
    heroCalls: 0,
    drawTile() {
      this.tileCalls += 1
    },
    drawHero() {
      this.heroCalls += 1
    },
  }
}

interface Harness {
  container: HTMLElement
  canvas: HTMLCanvasElement
  progress: LevelProgress[]
  results: LevelResult[]
}

/**
 * 局部同步 RAF stub：setup.ts 的全局 mock 在 happy-dom 下未生效（裸调用解析到原生异步 RAF），
 * 需驱动重画的用例用它把回调入队后手动同步执行（flush 后 rafId 归零，destroy 无需 cancel）。
 */
function stubSyncRaf(): { flush: () => void; restore: () => void } {
  const queue: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.push(cb)
    return queue.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  return {
    flush: () => {
      for (const cb of queue.splice(0)) cb(0)
    },
    restore: () => vi.unstubAllGlobals(),
  }
}

function mountReady(skin?: TileSkin): { inst: GameInstance; h: Harness } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const progress: LevelProgress[] = []
  const results: LevelResult[] = []
  const hooks: GameHooks = {
    onProgress: (p) => progress.push(p),
    onComplete: (r) => results.push(r),
    onAbandon: () => {},
  }
  const inst = mountMaze(container, TINY_LEVEL, hooks, { maze: tinyMaze(), skin: skin ?? paletteSkin('castle') })
  inst.start()
  const canvas = container.querySelector('canvas.mz-canvas') as HTMLCanvasElement
  return { inst, h: { container, canvas, progress, results } }
}

describe('mountMaze（挂载与初始化）', () => {
  it('挂载即渲染 HUD 五要素 + 画布，初始计数与文案齐全', () => {
    const { inst, h } = mountReady()
    for (const k of ['size', 'theme', 'steps', 'mistakes']) {
      expect(h.container.querySelector(`[data-mz="${k}"]`)).toBeTruthy()
    }
    expect(h.container.querySelector('.mz-hint')).toBeTruthy()
    expect(h.container.querySelector('[data-mz="error"]')).toBeNull()
    expect(h.container.querySelector('[data-mz="size"]')!.textContent).toBe('2×2')
    expect(h.container.querySelector('[data-mz-theme="castle"]')!.textContent).toBe(t('maze.themeCastle'))
    expect(h.container.querySelector('[data-mz-theme="castle"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(h.container.querySelector('[data-mz-theme="garden"]')!.getAttribute('aria-pressed')).toBe('false')
    expect(h.container.querySelector('[data-mz="steps"]')!.textContent).toBe(`${t('common.steps')} 0`)
    expect(h.container.querySelector('[data-mz="mistakes"]')!.textContent).toBe(`${t('common.mistakes')} 0`)
    expect(h.container.querySelector('.mz-hint')!.textContent).toBe(t('maze.hint'))
    inst.destroy()
  })

  it('花园主题关卡：初始按钮态随 cfg.theme（garden 按下）', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const gardenLevel: MazeLevelConfig = { ...TINY_LEVEL, theme: 'garden' }
    const inst = mountMaze(
      container,
      gardenLevel,
      { onProgress() {}, onComplete() {}, onAbandon() {} },
      { maze: tinyMaze(), skin: paletteSkin('garden') },
    )
    expect(container.querySelector('[data-mz-theme="garden"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[data-mz-theme="castle"]')!.getAttribute('aria-pressed')).toBe('false')
    inst.destroy()
    container.remove()
  })

  it('渲染走 TileSkin：瓦片全图一次缓存（tiles²）+ 角色首帧', () => {
    const skin = countingSkin()
    const { inst } = mountReady(skin)
    expect(skin.tileCalls).toBe(25) // 5×5 tilemap 整图
    expect(skin.heroCalls).toBeGreaterThanOrEqual(1)
    inst.destroy()
  })

  it('色板皮肤绘制路径：主画布有背景填充与缓存贴图调用', () => {
    const { inst, h } = mountReady()
    const calls = (h.canvas.getContext('2d') as unknown as { __calls: { op: string }[] }).__calls
    expect(calls.some((c) => c.op === 'fillRect')).toBe(true)
    expect(calls.some((c) => c.op === 'drawImage')).toBe(true)
    inst.destroy()
  })
})

describe('HUD 主题切换（验收返工 F-20：单一进度 + 记住上次）', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('点击另一主题：按钮态翻转 + 背景重画 + 设置持久化（记住上次）', () => {
    const raf = stubSyncRaf()
    const { inst, h } = mountReady()
    expect(getSettings().mazeTheme).toBeUndefined() // 初始未写入
    ;(h.container.querySelector('[data-mz-theme="garden"]') as HTMLButtonElement).click()
    raf.flush()
    raf.restore()
    expect(h.container.querySelector('[data-mz-theme="garden"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(h.container.querySelector('[data-mz-theme="castle"]')!.getAttribute('aria-pressed')).toBe('false')
    const calls = (h.canvas.getContext('2d') as unknown as { __calls: { op: string; args: unknown[] }[] }).__calls
    expect(calls.some((c) => c.op === 'set:fillStyle' && c.args[0] === THEME_PALETTES.garden.bg)).toBe(true)
    expect(getSettings().mazeTheme).toBe('garden')
    inst.destroy()
  })

  it('重复点击当前主题：幂等（不重复写档）', () => {
    const { inst, h } = mountReady()
    ;(h.container.querySelector('[data-mz-theme="castle"]') as HTMLButtonElement).click()
    expect(getSettings().mazeTheme).toBeUndefined()
    inst.destroy()
  })

  it('切换后通关：meta.theme 记录结算时主题', () => {
    const { inst, h } = mountReady()
    ;(h.container.querySelector('[data-mz-theme="garden"]') as HTMLButtonElement).click()
    key('ArrowRight')
    key('ArrowDown')
    expect(h.results[0]!.meta).toMatchObject({ theme: 'garden' })
    inst.destroy()
  })

  it('deps.skin 注入时切换不更换皮肤（测试注入语义保留，仅背景刷新）', () => {
    const raf = stubSyncRaf()
    const skin = countingSkin()
    const { inst, h } = mountReady(skin)
    const before = skin.tileCalls
    ;(h.container.querySelector('[data-mz-theme="garden"]') as HTMLButtonElement).click()
    raf.flush()
    raf.restore()
    expect(skin.tileCalls).toBe(before) // 不重建棋盘缓存
    expect(getSettings().mazeTheme).toBe('garden')
    inst.destroy()
  })
})

describe('移动与碰撞（§12.5）', () => {
  it('idle 未 start 时方向键不响应', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const progress: LevelProgress[] = []
    const inst = mountMaze(
      container,
      TINY_LEVEL,
      { onProgress: (p) => progress.push(p), onComplete() {}, onAbandon() {} },
      { maze: tinyMaze(), skin: paletteSkin('castle') },
    )
    key('ArrowRight')
    expect(progress).toHaveLength(0)
    inst.destroy()
    container.remove()
  })

  it('方向键前进一格：HUD 步数刷新 + onProgress 进度语义（done=剩余步倒扣）', () => {
    const { inst, h } = mountReady()
    key('ArrowRight') // (0,0)→(1,0)：剩余 1 步 → done=1
    expect(h.progress).toHaveLength(1)
    expect(h.progress[0]!).toMatchObject({ gameId: 'maze', n: 1, done: 1, total: 2 })
    expect(h.container.querySelector('[data-mz="steps"]')!.textContent).toBe(`${t('common.steps')} 1`)
    inst.destroy()
  })

  it('撞墙：失误计数递增 + 不上报进度 + 位置不动可继续前进', () => {
    const { inst, h } = mountReady()
    key('ArrowUp') // (0,0) 上方外墙
    expect(h.progress).toHaveLength(0)
    expect(h.container.querySelector('[data-mz="mistakes"]')!.textContent).toBe(`${t('common.mistakes')} 1`)
    key('ArrowRight') // 撞墙不影响位置
    expect(h.progress.at(-1)).toMatchObject({ done: 1, total: 2 })
    expect(h.container.querySelector('[data-mz="mistakes"]')!.textContent).toBe(`${t('common.mistakes')} 1`)
    inst.destroy()
  })

  it('WASD 与方向键等效（KeyD 右 / KeyS 下，同构通关）', () => {
    const { inst, h } = mountReady()
    key('KeyD')
    key('KeyS')
    expect(h.results).toHaveLength(1)
    inst.destroy()
  })

  it('非移动键忽略：Space 不产生任何状态变化', () => {
    const { inst, h } = mountReady()
    key('Space')
    expect(h.progress).toHaveLength(0)
    expect(h.results).toHaveLength(0)
    expect(h.container.querySelector('[data-mz="steps"]')!.textContent).toBe(`${t('common.steps')} 0`)
    inst.destroy()
  })
})

describe('过关结算（§12.5）', () => {
  it('最短路径抵达出口 → onComplete 3 星 + meta 口径 + 满进度', () => {
    const { inst, h } = mountReady()
    key('ArrowRight')
    key('ArrowDown') // (1,0)→(1,1) = goal
    expect(h.results).toHaveLength(1)
    expect(h.results[0]!).toMatchObject({
      gameId: 'maze',
      n: 1,
      elapsedMs: 0, // 平台 timer 权威覆写约定
      mistakes: 0,
      stars: 3,
      meta: { steps: 2, size: 2, theme: 'castle', solutionLength: 2 },
    })
    expect(h.progress.at(-1)).toMatchObject({ done: 2, total: 2 })
    inst.destroy()
  })

  it('撞墙失误计入结算 mistakes（星级按步数口径不受撞墙影响）', () => {
    const { inst, h } = mountReady()
    key('ArrowUp') // 撞墙 ×1
    key('ArrowRight')
    key('ArrowDown')
    expect(h.results[0]!).toMatchObject({ mistakes: 1, stars: 3, meta: { steps: 2 } })
    inst.destroy()
  })

  it('结算后 done 态：后续按键不再产生进度或重复结算', () => {
    const { inst, h } = mountReady()
    key('ArrowRight')
    key('ArrowDown')
    const progressCount = h.progress.length
    key('ArrowLeft')
    expect(h.results).toHaveLength(1)
    expect(h.progress).toHaveLength(progressCount)
    inst.destroy()
  })
})

describe('鼠标控制（相对方向单步：点击小人某侧走一步）', () => {
  /** happy-dom clientWidth=0 → rebuildBoard 回落 480×360 → 视图度量确定可复算 */
  const TINY_VIEW = computeView(480, 360, 5)

  /** 相对 (cx,cy) 小人中心偏移 (dx,dy) 像素处点击画布（getBoundingClientRect 恒 0 → clientX 即画布坐标） */
  function clickDir(h: Harness, cx: number, cy: number, dx: number, dy: number): void {
    const c = cellCenter(cx, cy, TINY_VIEW)
    h.canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: c.x + dx, clientY: c.y + dy, bubbles: true }))
  }

  it('点小人右侧 → 右移一步，步数/进度与键盘同口径', () => {
    const { inst, h } = mountReady()
    clickDir(h, 0, 0, 100, 0)
    expect(h.progress).toHaveLength(1)
    expect(h.progress[0]!).toMatchObject({ gameId: 'maze', n: 1, done: 1, total: 2 })
    expect(h.container.querySelector('[data-mz="steps"]')!.textContent).toBe(`${t('common.steps')} 1`)
    inst.destroy()
  })

  it('点小人自身（死区）→ 不动不失误不上报', () => {
    const { inst, h } = mountReady()
    clickDir(h, 0, 0, 10, 10) // 两轴位移均 < 半瓦片 36px
    expect(h.progress).toHaveLength(0)
    expect(h.container.querySelector('[data-mz="mistakes"]')!.textContent).toBe(`${t('common.mistakes')} 0`)
    expect(h.container.querySelector('[data-mz="steps"]')!.textContent).toBe(`${t('common.steps')} 0`)
    inst.destroy()
  })

  it('点墙方向 → 失误+1 位置不动（bumps 口径同键盘）', () => {
    const { inst, h } = mountReady()
    clickDir(h, 0, 0, 0, -100) // (0,0) 上方外墙
    expect(h.container.querySelector('[data-mz="mistakes"]')!.textContent).toBe(`${t('common.mistakes')} 1`)
    expect(h.progress).toHaveLength(0)
    inst.destroy()
  })

  it('点击沿解路至出口 → onComplete（星级/步数与键盘路径一致）', () => {
    const { inst, h } = mountReady()
    clickDir(h, 0, 0, 100, 0)
    clickDir(h, 1, 0, 0, 100)
    expect(h.results).toHaveLength(1)
    expect(h.results[0]!).toMatchObject({ mistakes: 0, stars: 3, meta: { steps: 2 } })
    inst.destroy()
  })

  it('pause 阶段点击不响应；resume 后恢复', () => {
    const { inst, h } = mountReady()
    inst.pause()
    clickDir(h, 0, 0, 100, 0)
    expect(h.progress).toHaveLength(0)
    inst.resume()
    clickDir(h, 0, 0, 100, 0)
    expect(h.progress.at(-1)).toMatchObject({ done: 1 })
    inst.destroy()
  })
})

describe('生命周期', () => {
  it('pause 期间按键不响应；resume 恢复', () => {
    const { inst, h } = mountReady()
    inst.pause()
    key('ArrowRight')
    expect(h.progress).toHaveLength(0)
    inst.resume()
    key('ArrowRight')
    expect(h.progress.at(-1)).toMatchObject({ done: 1 })
    inst.destroy()
  })

  it('destroy 解绑全局监听并清空挂载 DOM；重复 destroy 幂等', () => {
    const { inst, h } = mountReady()
    inst.destroy()
    inst.destroy()
    key('ArrowRight')
    expect(h.progress).toHaveLength(0)
    expect(h.container.children.length).toBe(0)
  })

  it('resize 事件重建棋盘后状态无损', () => {
    const { inst, h } = mountReady()
    window.dispatchEvent(new Event('resize'))
    __flushRaf(0)
    key('ArrowRight')
    expect(h.progress.at(-1)).toMatchObject({ done: 1, total: 2 })
    inst.destroy()
  })
})

describe('异常分支', () => {
  const proto = HTMLCanvasElement.prototype as unknown as { getContext: (...args: unknown[]) => unknown }
  const originalGetContext = proto.getContext

  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null })
  })
  afterAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: originalGetContext })
  })

  it('画布上下文不可用 → 错误条而非崩溃（stub 实例全方法可调）', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const inst = mountMaze(
      container,
      TINY_LEVEL,
      { onProgress() {}, onComplete() {}, onAbandon() {} },
      { maze: tinyMaze(), skin: paletteSkin('castle') },
    )
    expect(container.querySelector('[data-mz="error"]')!.textContent).toBe(t('maze.loadError'))
    expect(() => {
      inst.start()
      inst.pause()
      inst.resume()
      inst.destroy()
    }).not.toThrow()
    container.remove()
  })
})
