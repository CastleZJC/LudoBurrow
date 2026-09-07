// 拼图实例交互单测（开发计划 3.10：拖拽吸附 / 三区校验 / 帮助 / 放弃演示 / 结算上报）
// Canvas 2D 以 no-op Proxy mock（happy-dom 无 2D 实现）；断言聚焦 hooks 与盘面行为而非像素。
// 图片走 deps 注入（合成纯色图 → 切割线像素等分可预测，槽位坐标与实现同源重建）。

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { createCutPlan } from '@/engines/jigsaw-cutter'
import type { ImageDataLike } from '@/engines/jigsaw-cutter'
import type { GameHooks, LevelProgress, LevelResult } from '@/core/types'
import { mountJigsaw } from '@/games/jigsaw/instance'
import { createTopicLevel } from '@/games/jigsaw/schemes'
import { boardContentRect, computeLayout, slotRect } from '@/games/jigsaw/layout'

// services 素材仓库 mock：仅 assetId 分支消费（内置/deps 注入路径不触碰）
const { loadImageMock } = vi.hoisted(() => ({ loadImageMock: vi.fn() }))
vi.mock('@/services', () => ({
  getEnvAdapter: () => ({
    auth: { getCurrentUser: () => null },
    assetRepo: {
      saveImage: async () => ({ id: 'unused' }),
      listImages: async () => [],
      loadImage: loadImageMock,
      deleteImage: async () => {},
    },
  }),
}))

// ---- Canvas 2D mock：所有方法 no-op，属性可写 ----
const proto = HTMLCanvasElement.prototype as unknown as { getContext?: unknown }
const originalGetContext = proto.getContext

// 渲染帧计数（A1 断言用：clearRect 每渲染帧恰好一次）
const renderFrames = { count: 0 }

function makeCtx(): CanvasRenderingContext2D {
  const store: Record<string, unknown> = {}
  return new Proxy(store as unknown as CanvasRenderingContext2D, {
    get(target, prop, receiver) {
      const store = target as unknown as Record<string, unknown>
      if (prop === 'canvas') return { width: 0, height: 0 }
      if (prop === 'clearRect') return () => { renderFrames.count += 1 }
      if (!(prop in store)) {
        Object.defineProperty(store, prop, {
          value: () => undefined,
          writable: true,
        })
      }
      return Reflect.get(store, prop, receiver)
    },
    set(target, prop, value) {
      ;(target as unknown as Record<string, unknown>)[prop as string] = value
      return true
    },
  })
}

beforeAll(() => {
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => CanvasRenderingContext2D }).getContext =
    () => makeCtx()
})

afterAll(() => {
  ;(HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = originalGetContext
})

/** 90×90 纯色图：梯度全 0 → 切割线像素等分（3×4 → 行 30px / 列 22.5px），槽位可预测 */
function flatImage(size = 90): ImageDataLike {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 96
    data[i + 1] = 128
    data[i + 2] = 160
    data[i + 3] = 255
  }
  return { width: size, height: size, data }
}

function makeDeps() {
  const img = flatImage()
  return {
    analysisImage: img,
    sourceImage: { width: 90, height: 90 } as unknown as CanvasImageSource & { width: number; height: number },
    // 顺序推出注入（验收四轮一：生产缺省为 seed 洗牌；交互用例按序放置依赖确定性推出序）
    deck: Array.from({ length: 12 }, (_, i) => i),
  }
}

interface Harness {
  container: HTMLElement
  canvas: HTMLCanvasElement
  hooks: GameHooks
  progress: LevelProgress[]
  results: LevelResult[]
  abandoned: number[]
  plan: ReturnType<typeof createCutPlan>
  slotCenter(row: number, col: number): { x: number; y: number }
  currentCenter(): { x: number; y: number }
  stagingCenter(): { x: number; y: number }
}

// 玩法机制 12 块小盘：内置切片调整后各主题首关均非 3×4，取 cartoon 首关显式覆盖行×列保持 3×4 拓扑
const LEVEL = { ...createTopicLevel(1, 'cartoon'), rows: 3, cols: 4 }

async function mountReady(): Promise<{ inst: ReturnType<typeof mountJigsaw>; h: Harness }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const progress: LevelProgress[] = []
  const results: LevelResult[] = []
  const abandoned: number[] = []
  const hooks: GameHooks = {
    onProgress: (p) => progress.push(p),
    onComplete: (r) => results.push(r),
    onAbandon: () => abandoned.push(1),
  }
  const inst = mountJigsaw(container, LEVEL, hooks, makeDeps())
  inst.start()
  await Promise.resolve() // async init 微任务冲刷（deps 注入路径无真 await）
  const canvas = container.querySelector('canvas.jg-canvas') as HTMLCanvasElement
  // 与实现同源重建方案（确定性：同图同参同种子）+ 同源布局，推算槽位屏幕坐标
  const plan = createCutPlan(flatImage(), { rows: LEVEL.rows ?? LEVEL.gridSize, cols: LEVEL.cols ?? LEVEL.gridSize }, LEVEL.seed)
  const rects = computeLayout(960, 600)
  const content = boardContentRect(rects.board, plan)
  const h: Harness = {
    container,
    canvas,
    hooks,
    progress,
    results,
    abandoned,
    plan,
    slotCenter(row, col) {
      const r = slotRect(content, plan, row, col)
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
    },
    currentCenter() {
      const c = rects.current
      return { x: c.x + c.w / 2, y: c.y + c.h / 2 }
    },
    stagingCenter() {
      const s = rects.staging
      return { x: s.x + s.w / 2, y: s.y + s.h / 2 }
    },
  }
  return { inst, h }
}

function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number): void {
  canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }))
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('mountJigsaw（挂载与初始化）', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('挂载即渲染 HUD 五要素 + 画布；初始化后自动推出首个当前块并上报进度', async () => {
    const { inst, h } = await mountReady()
    for (const key of ['grid', 'helps', 'progress', 'help', 'abandon']) {
      expect(h.container.querySelector(`[data-jg="${key}"]`)).toBeTruthy()
    }
    expect(h.container.querySelector('[data-jg="error"]')).toBeNull()
    expect(h.progress.at(-1)).toMatchObject({ gameId: 'jigsaw', n: 1, done: 0, total: 12 })
    inst.destroy()
  })

  it('资产未就绪（未知图库条目）→ 错误条而非崩溃', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const ghostLevel: typeof LEVEL = { ...LEVEL, imageId: 'ghost-99' }
    const inst = mountJigsaw(container, ghostLevel, { onProgress() {}, onComplete() {}, onAbandon() {} })
    inst.start()
    await Promise.resolve()
    await Promise.resolve()
    expect(container.querySelector('[data-jg="error"]')).toBeTruthy()
    inst.destroy()
    container.remove()
  })
})

describe('方案模式分支（§11.8 / M3.11）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    loadImageMock.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('rows≠cols 方案网格 → HUD 显示 4×6（语言无关直拼）', async () => {
    const config = { ...createTopicLevel(1, 'animals'), rows: 4, cols: 6 }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const inst = mountJigsaw(container, config, { onProgress() {}, onComplete() {}, onAbandon() {} }, makeDeps())
    inst.start()
    await Promise.resolve()
    const grid = container.querySelector('[data-jg="grid"]') as HTMLElement
    expect(grid.textContent).toBe('4×6')
    inst.destroy()
    container.remove()
  })

  it('assetId 自定义素材：分支真实进入素材仓库，加载失败 → 错误条承接', async () => {
    loadImageMock.mockRejectedValue(new Error('asset missing'))
    const config = { ...createTopicLevel(1, 'animals'), imageId: '', schemeId: 'js-x', assetId: 'asset-x' }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const inst = mountJigsaw(container, config, { onProgress() {}, onComplete() {}, onAbandon() {} })
    inst.start()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(loadImageMock).toHaveBeenCalledWith({ id: 'asset-x' })
    expect(container.querySelector('[data-jg="error"]')).toBeTruthy()
    inst.destroy()
    container.remove()
  })
})

describe('拖拽吸附与三区校验（§11.2）', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('当前块拖到正确槽 → 吸附落子 + 推下一块 + onProgress', async () => {
    const { inst, h } = await mountReady()
    const from = h.currentCenter()
    const to = h.slotCenter(0, 0) // 块 0 的正确位
    pointer(h.canvas, 'pointerdown', from.x, from.y)
    pointer(h.canvas, 'pointermove', to.x, to.y)
    pointer(h.canvas, 'pointerup', to.x, to.y)
    expect(h.progress.at(-1)).toMatchObject({ done: 1, total: 12 })
    expect(h.results).toHaveLength(0)
    inst.destroy()
  })

  it('拖到错误槽也稳稳卡进（网格级校准，猜错可重摆）→ 正确数不增', async () => {
    const { inst, h } = await mountReady()
    const from = h.currentCenter()
    const wrong = h.slotCenter(2, 2) // 块 0 放 (2,2) 错位
    pointer(h.canvas, 'pointerdown', from.x, from.y)
    pointer(h.canvas, 'pointerup', wrong.x, wrong.y)
    expect(h.progress.at(-1)).toMatchObject({ done: 0, total: 12 })
    // 盘面块可重摆：从错误槽拖回正确槽
    const right = h.slotCenter(0, 0)
    pointer(h.canvas, 'pointerdown', wrong.x, wrong.y)
    pointer(h.canvas, 'pointerup', right.x, right.y)
    expect(h.progress.at(-1)).toMatchObject({ done: 1, total: 12 })
    inst.destroy()
  })

  it('拖入暂存区 → 块进暂存 + 推下一块', async () => {
    const { inst, h } = await mountReady()
    const from = h.currentCenter()
    const staging = h.stagingCenter()
    pointer(h.canvas, 'pointerdown', from.x, from.y)
    pointer(h.canvas, 'pointerup', staging.x, staging.y)
    expect(h.progress.at(-1)).toMatchObject({ done: 0, total: 12 })
    inst.destroy()
  })

  it('全部块正确归位 → onComplete（elapsedMs 0 / mistakes=帮助数 / 3 星 / meta.helps）', async () => {
    const { inst, h } = await mountReady()
    for (let i = 0; i < 12; i++) {
      const from = h.currentCenter()
      const piece = h.plan.pieces[i]
      const to = h.slotCenter(piece.row, piece.col)
      pointer(h.canvas, 'pointerdown', from.x, from.y)
      pointer(h.canvas, 'pointerup', to.x, to.y)
    }
    expect(h.results).toHaveLength(1)
    expect(h.results[0]).toMatchObject({
      gameId: 'jigsaw',
      n: 1,
      elapsedMs: 0,
      mistakes: 0,
      stars: 3,
      meta: { helps: 0 },
    })
    // 进度先于完成：最后一条 progress 为满进度
    expect(h.progress.at(-1)).toMatchObject({ done: 12, total: 12 })
    inst.destroy()
  })

  it('三区全空但有错位 → 不结算（校验失败不误报完成）', async () => {
    const { inst, h } = await mountReady()
    // 前 10 块正确，末两块互换错位（块 10→(2,3)、块 11→(2,2)）：全部进盘面但互不对
    for (let i = 0; i < 10; i++) {
      const piece = h.plan.pieces[i]
      const from = h.currentCenter()
      const to = h.slotCenter(piece.row, piece.col)
      pointer(h.canvas, 'pointerdown', from.x, from.y)
      pointer(h.canvas, 'pointerup', to.x, to.y)
    }
    let from = h.currentCenter()
    pointer(h.canvas, 'pointerdown', from.x, from.y)
    pointer(h.canvas, 'pointerup', h.slotCenter(2, 3).x, h.slotCenter(2, 3).y) // 块 10 错位（正确位 (2,2)）
    from = h.currentCenter()
    pointer(h.canvas, 'pointerdown', from.x, from.y)
    pointer(h.canvas, 'pointerup', h.slotCenter(2, 2).x, h.slotCenter(2, 2).y) // 块 11 错位（正确位 (2,3)）
    expect(h.results).toHaveLength(0)
    expect(h.progress.at(-1)).toMatchObject({ done: 10, total: 12 })
    inst.destroy()
  })
})

describe('帮助按钮（§11.4）', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('当前块自动归位，帮助计数入 mistakes 口径（星级降为 1：12 块盘全帮助）', async () => {
    const { inst, h } = await mountReady()
    click(h.container.querySelector('[data-jg="help"]')!)
    expect(h.progress.at(-1)).toMatchObject({ done: 1, total: 12 })
    // 全部用帮助完成 → 12 次帮助
    for (let i = 0; i < 11; i++) {
      vi.advanceTimersByTime(300)
      click(h.container.querySelector('[data-jg="help"]')!)
    }
    vi.advanceTimersByTime(300)
    expect(h.results).toHaveLength(1)
    expect(h.results[0]).toMatchObject({ mistakes: 12, stars: 1, meta: { helps: 12 } })
    inst.destroy()
  })

  it('正确位被错块占用 → 占用块先移暂存（board 让位语义经界面路径触达）', async () => {
    const { inst, h } = await mountReady()
    // 块 0 错放 (1,1)（3×4 下为块 5 的正确位）
    const from = h.currentCenter()
    const wrong = h.slotCenter(1, 1)
    pointer(h.canvas, 'pointerdown', from.x, from.y)
    pointer(h.canvas, 'pointerup', wrong.x, wrong.y)
    expect(h.progress.at(-1)).toMatchObject({ done: 0 })
    // 连点帮助 5 次：第 1-4 次归位块 1-4（槽均空闲），第 5 次帮块 5（其槽 (1,1) 被块 0 占 → 块 0 让位暂存）
    const helpBtn = h.container.querySelector('[data-jg="help"]')!
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(300)
      click(helpBtn)
    }
    vi.advanceTimersByTime(300)
    // 块 0 已被挤入暂存（done = 块1-5 正确 = 5，块 0 在暂存）
    expect(h.progress.at(-1)).toMatchObject({ done: 5, total: 12 })
    inst.destroy()
  })

  it('帮助落位后自动续推下一块到当前区（对齐拖拽落子路径，反馈 6）', async () => {
    const { inst, h } = await mountReady()
    click(h.container.querySelector('[data-jg="help"]')!) // 块 0 归位 + 应自动续推块 1
    vi.advanceTimersByTime(1100) // 飞行播完（盘面状态即时生效，这里只等动画）
    // 当前区此刻应为块 1（deck=[0..8] 顺序推出）：从当前区拖到块 1 正确槽 → done 2
    const piece = h.plan.pieces[1]
    const from = h.currentCenter()
    pointer(h.canvas, 'pointerdown', from.x, from.y)
    pointer(h.canvas, 'pointerup', h.slotCenter(piece.row, piece.col).x, h.slotCenter(piece.row, piece.col).y)
    expect(h.progress.at(-1)).toMatchObject({ done: 2, total: 12 })
    inst.destroy()
  })
})

describe('放弃按钮（§11.3 四阶段演示）', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('演示完毕触发 onComplete 结算（恒 1 星 + meta.abandoned），不再 onAbandon 直退', async () => {
    const { inst, h } = await mountReady()
    // 布置混合盘面：块 0 错放 (2,2)、块 1 正确、一块进暂存
    let from = h.currentCenter()
    pointer(h.canvas, 'pointerdown', from.x, from.y)
    pointer(h.canvas, 'pointerup', h.slotCenter(2, 2).x, h.slotCenter(2, 2).y) // 块 0 错位
    from = h.currentCenter()
    pointer(h.canvas, 'pointerdown', from.x, from.y)
    pointer(h.canvas, 'pointerup', h.slotCenter(0, 1).x, h.slotCenter(0, 1).y) // 块 1 正确
    from = h.currentCenter()
    pointer(h.canvas, 'pointerdown', from.x, from.y)
    pointer(h.canvas, 'pointerup', h.stagingCenter().x, h.stagingCenter().y) // 块 2 暂存

    click(h.container.querySelector('[data-jg="abandon"]')!)
    expect(h.results).toHaveLength(0) // 演示未完不结算
    const helpBtn = h.container.querySelector('[data-jg="help"]') as HTMLButtonElement
    const abandonBtn = h.container.querySelector('[data-jg="abandon"]') as HTMLButtonElement
    expect(helpBtn.disabled).toBe(true)
    // 12 步演示：每步 DEMO_STEP_MS+40 = 1040ms
    vi.advanceTimersByTime(1040 * 12 + 100)
    // 复用正常完成结算链（GameContainer → SettlePanel：真实用时/重玩/下一关），不再 onAbandon 直退
    expect(h.abandoned).toHaveLength(0)
    expect(h.results).toHaveLength(1)
    expect(h.results[0]).toMatchObject({
      gameId: 'jigsaw',
      n: 1,
      elapsedMs: 0, // 平台计时器权威覆写为真实用时（含演示时间，用户决策）
      mistakes: 0,
      stars: 1, // 放弃恒 1 星（非独立完成）；mergeLevelRecord 取高不覆盖历史
      meta: { abandoned: true, helps: 0 },
    })
    expect(abandonBtn.disabled).toBe(true)
    // 结算后交互锁定：指针事件无效
    const before = h.progress.length
    pointer(h.canvas, 'pointerdown', h.currentCenter().x, h.currentCenter().y)
    pointer(h.canvas, 'pointerup', h.slotCenter(0, 0).x, h.slotCenter(0, 0).y)
    expect(h.progress.length).toBe(before)
    inst.destroy()
  })
})

describe('生命周期', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('pause 期间拖拽不响应；resume 恢复', async () => {
    const { inst, h } = await mountReady()
    inst.pause()
    const from = h.currentCenter()
    const to = h.slotCenter(0, 0)
    pointer(h.canvas, 'pointerdown', from.x, from.y)
    pointer(h.canvas, 'pointerup', to.x, to.y)
    expect(h.progress.length).toBe(1) // 仅初始化上报
    inst.resume()
    pointer(h.canvas, 'pointerdown', from.x, from.y)
    pointer(h.canvas, 'pointerup', to.x, to.y)
    expect(h.progress.at(-1)).toMatchObject({ done: 1 })
    inst.destroy()
  })

  it('destroy 后事件全部解绑（拖拽与按钮均无副作用）', async () => {
    const { inst, h } = await mountReady()
    const helpBtn = h.container.querySelector('[data-jg="help"]')!
    inst.destroy()
    const before = h.progress.length
    pointer(h.canvas, 'pointerdown', h.currentCenter().x, h.currentCenter().y)
    pointer(h.canvas, 'pointerup', h.slotCenter(0, 0).x, h.slotCenter(0, 0).y)
    click(helpBtn)
    expect(h.progress.length).toBe(before)
    expect(h.results).toHaveLength(0)
    expect(h.container.children.length).toBe(0) // root 已移除
  })
})

describe('渲染补帧（A1：帮助飞行到期后不再消失）', () => {
  beforeEach(() =>
    // 显式 fake performance + rAF：默认 toFake 集合不保证含二者，飞行到期判定依赖 ts 与 start 同钟
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] }),
  )
  afterEach(() => vi.useRealTimers())

  it('帮助飞行到期后自动补绘（到期帧 + 至少一次补绘帧）', async () => {
    const { inst, h } = await mountReady()
    click(h.container.querySelector('[data-jg="help"]')!) // 飞行 start=0，DEMO_STEP_MS=1000
    vi.advanceTimersByTime(999) // 飞行期内
    const during = renderFrames.count
    vi.advanceTimersByTime(600) // 越过到期点：到期帧 + 补绘帧
    expect(renderFrames.count - during).toBeGreaterThanOrEqual(2)
    inst.destroy()
  })
})
