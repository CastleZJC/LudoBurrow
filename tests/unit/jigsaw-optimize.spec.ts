// 切块规格自动优选单测（验收返工「每图自动选最优切块」：候选窗口 / 评分语义 / 按图择优 / 预热兜底）
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  COMPLEXITY_PIECES,
  candidateSpecs,
  complexityForPieces,
  scoreSpec,
  pickBestSpec,
  bestSpecFor,
  rememberSpec,
  resetSpecCache,
  cachedSpecCount,
  canAnalyze,
  warmBuiltinOptima,
} from '@/games/jigsaw/optimize'
import { GALLERY } from '@/games/jigsaw/gallery'
import type { ImageDataLike } from '@/engines/jigsaw-cutter'

// gallery mock：仅替换 loadAnalysisImage（warm 解码路径可空转验证）；GALLERY 等保持真实
const { loadAnalysisImageMock } = vi.hoisted(() => ({ loadAnalysisImageMock: vi.fn() }))
vi.mock('@/games/jigsaw/gallery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/games/jigsaw/gallery')>()
  return { ...actual, loadAnalysisImage: loadAnalysisImageMock }
})

// ---- 测试图工厂 ----

/** 纯色图（梯度全 0：建线回退像素等分，评分只看块形与均匀度） */
function flatImage(w: number, h: number, v = 128): ImageDataLike {
  const data = new Uint8ClampedArray(w * h * 4).fill(v)
  for (let i = 3; i < data.length; i += 4) data[i] = 255
  return { width: w, height: h, data }
}

/** 棋盘图（cell px 黑白交替：块内方差与邻块对比度双高 → 区分度满分素材） */
function checkerImage(w: number, h: number, cell = 8): ImageDataLike {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 255 : 0
      const i = (y * w + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { width: w, height: h, data }
}

describe('candidateSpecs（难度档候选窗口，确定性顺序）', () => {
  it('三档首个候选 = 占位阶梯规格（3×3 / 4×4 / 5×5）：内容无偏向时难度曲线不变', () => {
    expect(candidateSpecs(1)[0]).toEqual({ rows: 3, cols: 3 })
    expect(candidateSpecs(2)[0]).toEqual({ rows: 4, cols: 4 })
    expect(candidateSpecs(3)[0]).toEqual({ rows: 5, cols: 5 })
  })

  it('候选全部落在难度档块数窗口内、单边 ∈ [2,6]、无重复', () => {
    for (const complexity of [1, 2, 3] as const) {
      const window = COMPLEXITY_PIECES[complexity]
      const specs = candidateSpecs(complexity)
      expect(specs.length).toBeGreaterThan(0)
      for (const s of specs) {
        expect(s.rows * s.cols).toBeGreaterThanOrEqual(window.min)
        expect(s.rows * s.cols).toBeLessThanOrEqual(window.max)
        expect(s.rows).toBeGreaterThanOrEqual(2)
        expect(s.rows).toBeLessThanOrEqual(6)
        expect(s.cols).toBeGreaterThanOrEqual(2)
        expect(s.cols).toBeLessThanOrEqual(6)
      }
      const keys = new Set(specs.map((s) => `${s.rows}x${s.cols}`))
      expect(keys.size).toBe(specs.length)
    }
  })

  it('c2 窗口候选共 11 个，排序按「块数贴近目标 16」非降（同分 tie-break 依据）', () => {
    const specs = candidateSpecs(2)
    expect(specs).toHaveLength(11)
    const deviations = specs.map((s) => Math.abs(s.rows * s.cols - 16))
    for (let i = 1; i < deviations.length; i++) {
      expect(deviations[i]!).toBeGreaterThanOrEqual(deviations[i - 1]!)
    }
  })

  it('complexityForPieces：块数反查难度档（窗口边界 12/20 归低档）', () => {
    expect(complexityForPieces(9)).toBe(1)
    expect(complexityForPieces(12)).toBe(1)
    expect(complexityForPieces(13)).toBe(2)
    expect(complexityForPieces(16)).toBe(2)
    expect(complexityForPieces(20)).toBe(2)
    expect(complexityForPieces(21)).toBe(3)
    expect(complexityForPieces(25)).toBe(3)
    expect(complexityForPieces(30)).toBe(3)
  })
})

describe('scoreSpec（评分语义：区分度 / 均匀度 / 块形）', () => {
  it('纯色方图：区分度三项全 0、面积均匀 1、块形正方形惩罚 0 → 综合分 = 均匀度权重项', () => {
    const s = scoreSpec(flatImage(64, 64), { rows: 4, cols: 4 })
    expect(s.min).toBe(0)
    expect(s.mean).toBe(0)
    expect(s.weakRatio).toBe(1)
    expect(s.uniformity).toBe(1)
    expect(s.aspectPenalty).toBe(0)
    expect(s.score).toBeCloseTo(20, 6)
  })

  it('棋盘图：块内方差与邻块对比双高 → 平均/最低区分度高且无弱块', () => {
    const s = scoreSpec(checkerImage(64, 64), { rows: 4, cols: 4 })
    expect(s.mean).toBeGreaterThan(60)
    expect(s.min).toBeGreaterThan(60)
    expect(s.weakRatio).toBe(0)
  })

  it('块形惩罚：竖图 32×64 的 4×4 块偏条形罚满（=1），4×2 块正方形零惩罚', () => {
    const tall = flatImage(32, 64)
    expect(scoreSpec(tall, { rows: 4, cols: 4 }).aspectPenalty).toBeCloseTo(1, 10)
    expect(scoreSpec(tall, { rows: 4, cols: 2 }).aspectPenalty).toBe(0)
  })

  it('确定性：同图同规格两次评分完全一致', () => {
    const img = checkerImage(64, 64)
    expect(scoreSpec(img, { rows: 4, cols: 5 })).toEqual(scoreSpec(img, { rows: 4, cols: 5 }))
  })
})

describe('pickBestSpec（每图按内容择优）', () => {
  it('纯色方图 c2 → 4×4（区分度无差异时由块形与均匀度决定：回到占位阶梯）', () => {
    expect(pickBestSpec(flatImage(64, 64), 2).spec).toEqual({ rows: 4, cols: 4 })
  })

  it('纯色方图 c1 → 3×3（同上，c1 档内唯一正方形候选）', () => {
    expect(pickBestSpec(flatImage(64, 64), 1).spec).toEqual({ rows: 3, cols: 3 })
  })

  it('竖长图：选 rows=2×cols 的正方形块规格（32×64 → c1 档 4×2 / c2 档 6×3）', () => {
    expect(pickBestSpec(flatImage(32, 64), 1).spec).toEqual({ rows: 4, cols: 2 })
    expect(pickBestSpec(flatImage(32, 64), 2).spec).toEqual({ rows: 6, cols: 3 })
  })

  it('横长图对称：64×32 → c2 档 3×6', () => {
    expect(pickBestSpec(flatImage(64, 32), 2).spec).toEqual({ rows: 3, cols: 6 })
  })

  it('内容驱动：丰富图综合分显著高于纯色图，且最优仍在候选集内、ranked 完整', () => {
    const flat = pickBestSpec(flatImage(64, 64), 2)
    const rich = pickBestSpec(checkerImage(64, 64), 2)
    expect(rich.score.score).toBeGreaterThan(flat.score.score)
    const candidates = candidateSpecs(2)
    expect(
      candidates.some((c) => c.rows === rich.spec.rows && c.cols === rich.spec.cols),
    ).toBe(true)
    expect(rich.ranked).toHaveLength(candidates.length)
    expect(rich.score.score).toBe(Math.max(...rich.ranked.map((s) => s.score)))
  })
})

describe('规格缓存（进程内，预热与读取）', () => {
  beforeEach(() => resetSpecCache())

  it('rememberSpec/bestSpecFor：写入可读，且防御性拷贝（外部改写不影响缓存）', () => {
    expect(bestSpecFor('animals-01')).toBeUndefined()
    const spec = { rows: 5, cols: 4 }
    rememberSpec('animals-01', spec)
    spec.rows = 9
    expect(bestSpecFor('animals-01')).toEqual({ rows: 5, cols: 4 })
    expect(cachedSpecCount()).toBe(1)
  })

  it('resetSpecCache 清空', () => {
    rememberSpec('space-01', { rows: 3, cols: 4 })
    resetSpecCache()
    expect(bestSpecFor('space-01')).toBeUndefined()
    expect(cachedSpecCount()).toBe(0)
  })
})

describe('canAnalyze（Canvas 像素回读能力自检）', () => {
  it('无真实像素回读（本测试环境 ctx mock 的 getImageData 尺寸不符）→ false', () => {
    // 生产浏览器返回 true；happy-dom + setup mock 恒 1×1/4 字节 → 被尺寸校验探测出
    expect(canAnalyze()).toBe(false)
  })
})

describe('warmBuiltinOptima（内置图库预热）', () => {
  beforeEach(() => {
    resetSpecCache()
    loadAnalysisImageMock.mockReset()
  })

  it('无 Canvas 像素能力：立即返回全 failed，不触发任何解码（异常环境零悬挂）', async () => {
    const { ok, failed } = await warmBuiltinOptima()
    expect(ok).toEqual([])
    expect(failed).toHaveLength(GALLERY.length)
    expect(loadAnalysisImageMock).not.toHaveBeenCalled()
  })

  it('预热成功（注入解码器 = 具备能力）：逐图选最优写入缓存，按难度档出规格', async () => {
    const decode = vi.fn(async () => flatImage(32, 64))
    const { ok, failed } = await warmBuiltinOptima({ decode })
    expect(failed).toEqual([])
    expect(ok).toHaveLength(GALLERY.length)
    expect(decode).toHaveBeenCalledTimes(GALLERY.length)
    // animals-01 复杂度 1 / space-03 复杂度 2：同一竖图在各档窗口内选块形最优
    expect(bestSpecFor('animals-01')).toEqual({ rows: 4, cols: 2 })
    expect(bestSpecFor('space-03')).toEqual({ rows: 6, cols: 3 })
  })

  it('单图分析失败：记入 failed 并回落占位，不影响其余图', async () => {
    const decode = vi.fn(async (entry: { id: string }) => {
      if (entry.id === 'animals-01') throw new Error('bad image')
      return flatImage(64, 64)
    })
    const { ok, failed } = await warmBuiltinOptima({ decode })
    expect(failed).toEqual(['animals-01'])
    expect(ok).toHaveLength(GALLERY.length - 1)
    expect(bestSpecFor('animals-01')).toBeUndefined()
    // 其余方图正常出规格（c1 → 3×3）
    expect(bestSpecFor('animals-02')).toEqual({ rows: 3, cols: 3 })
  })

  it('幂等：已缓存图跳过，二次预热不重复解码', async () => {
    const decode = vi.fn(async () => flatImage(64, 64))
    await warmBuiltinOptima({ decode })
    expect(decode).toHaveBeenCalledTimes(GALLERY.length)
    await warmBuiltinOptima({ decode })
    expect(decode).toHaveBeenCalledTimes(GALLERY.length)
  })

  it('单图超时：记入 failed 不悬挂（全部超时 → 缓存为空）', async () => {
    const decode = vi.fn(() => new Promise<ImageDataLike>(() => {}))
    const { ok, failed } = await warmBuiltinOptima({ decode, timeoutMs: 5 })
    expect(ok).toEqual([])
    expect(failed).toHaveLength(GALLERY.length)
    expect(cachedSpecCount()).toBe(0)
  })
})
