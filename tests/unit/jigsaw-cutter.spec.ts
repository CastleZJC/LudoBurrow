// 切块引擎单测（测试规范 §3.3 必测：确定性 / 全均匀性 / 互补性 / 唯一性兜底；验收返工二轮：切割线恒均匀）
import { describe, it, expect } from 'vitest'
import { createRng } from '@/engines/rng'
import type { ImageDataLike, TabSpec } from '@/engines/jigsaw-cutter/types'
import {
  normalizeCutParams,
  createCutPlan,
  buildAxisLines,
  buildTabSpecs,
  sampleEdgePoints,
  assemblePieces,
  pieceScore,
  ensureUniqueness,
} from '@/engines/jigsaw-cutter'

/** 合成图工厂：paint(x, y) 返回 [r, g, b] */
function makeImage(
  w: number,
  h: number,
  paint: (x: number, y: number) => [number, number, number],
): ImageDataLike {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y)
      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { width: w, height: h, data }
}

/** 合成图：上 1/3 纯红、中 1/3 水平黑白细条纹（细节密集）、下 1/3 纯蓝 */
function threeBandImage(size = 90): ImageDataLike {
  return makeImage(size, size, (_x, y) => {
    if (y < size / 3) return [200, 30, 30]
    if (y >= (size * 2) / 3) return [30, 30, 200]
    return y % 4 < 2 ? [0, 0, 0] : [255, 255, 255]
  })
}

/** 全图随机噪声（细节最丰富，区分度极高） */
function noiseImage(size = 80, seed = 99): ImageDataLike {
  const rng = createRng(seed)
  return makeImage(size, size, () => [
    rng.int(0, 256),
    rng.int(0, 256),
    rng.int(0, 256),
  ])
}

/** 黑白棋盘格（4px 格）：块内方差与邻块对比度双高 */
function checkerImage(size = 60, cell = 4): ImageDataLike {
  return makeImage(size, size, (x, y) =>
    (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? [255, 255, 255] : [0, 0, 0],
  )
}

describe('normalizeCutParams', () => {
  it('rows/cols 钳制 [2,12]，可选项取默认', () => {
    expect(normalizeCutParams({ rows: 1, cols: 13 })).toEqual({
      rows: 2,
      cols: 12,
      tabDepth: 0.16,
      uniquenessThreshold: 18,
    })
    expect(normalizeCutParams({ rows: 3, cols: 3, tabDepth: 0.5, uniquenessThreshold: 200 })).toEqual({
      rows: 3,
      cols: 3,
      tabDepth: 0.25,
      uniquenessThreshold: 100,
    })
  })
})

describe('buildAxisLines（全均匀切割，验收返工二轮口径）', () => {
  it('线恒均匀：第 k 条内部线 = round(size×k/count)，与图片内容无关（签名不含图）', () => {
    expect(buildAxisLines(90, 3)).toEqual([0, 30, 60, 90])
    expect(buildAxisLines(100, 4)).toEqual([0, 25, 50, 75, 100])
    expect(buildAxisLines(96, 3)).toEqual([0, 32, 64, 96])
  })

  it('非整除尺寸：round 线位微差 ≤ 1px，段宽差 ≤ 1px（内容分析只选块数不选线位）', () => {
    const lines = buildAxisLines(95, 4)
    expect(lines).toEqual([0, 24, 48, 71, 95])
    const segs = [lines[1]!, lines[2]! - lines[1]!, lines[3]! - lines[2]!, 95 - lines[3]!]
    for (const s of segs) expect(Math.abs(s - 95 / 4)).toBeLessThanOrEqual(1)
  })

  it.each([[1, 10], [0, 10], [2, 2], [4, 4]])('非法输入（段 %i / 尺寸 %i）抛 RangeError', (count, size) => {
    expect(() => buildAxisLines(size, count)).toThrow(RangeError)
  })
})

describe('buildTabSpecs（锯齿规格）', () => {
  const lines = [0, 30, 60, 90]
  const spans = [0, 20, 40, 60, 80, 100]

  it('内部线各一条规格；pattern/depths 值域合规；确定性', () => {
    const a = buildTabSpecs('h', lines, spans, createRng(7), 0.16)
    const b = buildTabSpecs('h', lines, spans, createRng(7), 0.16)
    expect(a).toHaveLength(2)
    expect(a[0].at).toBe(30)
    expect(a[1].at).toBe(60)
    // 每边单旋钮（反馈 4.3）：segments = 沿线块数 × 1
    expect(a[0].segments).toBe(spans.length - 1)
    expect(a).toEqual(b)
    for (const spec of a) {
      expect(spec.pattern.every((v) => v === -1 || v === 0 || v === 1)).toBe(true)
      expect(spec.depths.every((d) => d >= 0.6 && d <= 1.4)).toBe(true)
      expect(spec.baseDepth).toBe(0.16)
    }
  })

  it('不同种子生成不同形状', () => {
    const a = buildTabSpecs('v', lines, spans, createRng(1), 0.16)
    const b = buildTabSpecs('v', lines, spans, createRng(2), 0.16)
    expect(a[0].pattern).not.toEqual(b[0].pattern)
  })
})

describe('sampleEdgePoints（边几何）', () => {
  const flat: TabSpec = { dir: 'h', at: 10, segments: 2, pattern: [0, 0], depths: [1, 1], baseDepth: 0.2 }
  const bumped: TabSpec = { dir: 'h', at: 10, segments: 2, pattern: [1, -1], depths: [1, 1], baseDepth: 0.2 }

  it('平段全零偏移，起止点归零', () => {
    const pts = sampleEdgePoints(flat, 40, 'before', 0.2)
    expect(pts[0]).toEqual({ along: 0, offset: 0 })
    expect(pts[pts.length - 1].offset).toBe(0)
    expect(pts.every((p) => p.offset === 0)).toBe(true)
  })

  it('同一条线两侧凸凹互补（offset 互为相反）', () => {
    const before = sampleEdgePoints(bumped, 40, 'before', 0.2)
    const after = sampleEdgePoints(bumped, 40, 'after', 0.2)
    expect(before).toHaveLength(after.length)
    let mirrored = true
    for (let i = 0; i < before.length; i++) {
      if (Math.abs(before[i].offset + after[i].offset) > 1e-9) mirrored = false
    }
    expect(mirrored).toBe(true)
    expect(before.some((p) => p.offset !== 0)).toBe(true)
  })

  it('along 单调不减', () => {
    const pts = sampleEdgePoints(bumped, 40, 'after', 0.2)
    for (let i = 1; i < pts.length; i++) expect(pts[i].along).toBeGreaterThanOrEqual(pts[i - 1].along)
  })

  it('半圆旋钮剖面（反馈 4.3 三轮）：峰≈全深、无颈缩、半高宽≈86% 圆弧、左右对称、端点归零', () => {
    const pts = sampleEdgePoints(bumped, 40, 'after', 0.2) // 段宽 20、深度 0.2；段0 旋钮区 along∈[5,15]
    expect(pts[0]).toEqual({ along: 0, offset: 0 })
    expect(pts[pts.length - 1]).toEqual({ along: 40, offset: 0 })
    const knob = pts.filter((p) => p.along >= 5 && p.along <= 15)
    expect(knob.length).toBeGreaterThan(10)
    const peak = Math.max(...knob.map((p) => Math.abs(p.offset)))
    expect(peak).toBeGreaterThan(0.19) // 峰 ≈ 全深 0.2
    expect(peak).toBeLessThan(0.22) // 样条过冲有界
    // 无颈缩（三轮核心）：左半单调升、右半单调降——不存在 undercut 局部极小（山峰/蘑菇读感来源）
    const rise = knob.filter((p) => p.along <= 10).map((p) => Math.abs(p.offset))
    const fall = knob.filter((p) => p.along >= 10).map((p) => Math.abs(p.offset))
    for (let i = 1; i < rise.length; i++) expect(rise[i]).toBeGreaterThanOrEqual(rise[i - 1]! - 0.01)
    for (let i = 1; i < fall.length; i++) expect(fall[i]).toBeLessThanOrEqual(fall[i - 1]! + 0.01)
    // 半圆判定：半高（≥0.099）宽 ≈ 旋钮宽 10 × 86.6% = 8.66（带颈/尖峰剖面显著更窄）
    const above = knob.filter((p) => Math.abs(p.offset) >= 0.099)
    const width = Math.max(...above.map((p) => p.along)) - Math.min(...above.map((p) => p.along))
    expect(width).toBeGreaterThan(7.8)
    expect(width).toBeLessThan(9.4)
    // 左右对称（段中心 10 为轴）
    let maxAsym = 0
    for (const p of knob) {
      const mirrored = knob.reduce((b, q) =>
        Math.abs(q.along - (20 - p.along)) < Math.abs(b.along - (20 - p.along)) ? q : b,
      )
      maxAsym = Math.max(maxAsym, Math.abs(Math.abs(p.offset) - Math.abs(mirrored.offset)))
    }
    expect(maxAsym).toBeLessThan(0.01)
  })
})

describe('assemblePieces（网格组装）', () => {
  const rowLines = [0, 30, 60, 90]   // 3 行
  const colLines = [0, 25, 50, 75, 100] // 4 列
  const hTabs = buildTabSpecs('h', rowLines, colLines, createRng(3), 0.16)
  const vTabs = buildTabSpecs('v', colLines, rowLines, createRng(4), 0.16)

  it('3×4 = 12 块，矩形与切割线一致，面积守恒', () => {
    const pieces = assemblePieces(rowLines, colLines, hTabs, vTabs)
    expect(pieces).toHaveLength(12)
    const area = pieces.reduce((a, p) => a + p.w * p.h, 0)
    expect(area).toBe(100 * 90)
    for (const p of pieces) {
      expect(p.x).toBe(colLines[p.col])
      expect(p.y).toBe(rowLines[p.row])
      expect(p.x + p.w).toBe(colLines[p.col + 1])
      expect(p.y + p.h).toBe(rowLines[p.row + 1])
    }
  })

  it('相邻块共享同一条边规格（引用相等），外缘为 null', () => {
    const pieces = assemblePieces(rowLines, colLines, hTabs, vTabs)
    const at = (r: number, c: number) => pieces[r * 4 + c]
    expect(at(0, 0).bottom).toBe(at(1, 0).top)
    expect(at(1, 1).top).toBe(at(0, 1).bottom)
    expect(at(0, 0).right).toBe(at(0, 1).left)
    expect(at(0, 0).top).toBeNull()
    expect(at(0, 0).left).toBeNull()
    expect(at(2, 3).bottom).toBeNull()
    expect(at(2, 3).right).toBeNull()
  })
})

describe('pieceScore（区分度评分）', () => {
  it('纯色图中间块低分（模棱两可），棋盘图块高分', () => {
    const flat = makeImage(60, 60, () => [50, 50, 50])
    const checker = checkerImage(60)
    const pieces = assemblePieces([0, 30, 60], [0, 30, 60], [], [])
    const center = pieces[3] // (1,1)
    const flatNeighbors = pieces.filter(
      (q) => Math.abs(q.row - center.row) + Math.abs(q.col - center.col) === 1,
    )
    expect(pieceScore(flat, center, flatNeighbors)).toBeLessThanOrEqual(10)
    // 棋盘块方差分满分 100，即使边界对比分俭 0，总分也应达到方差权重上限（0.6×100）
    expect(pieceScore(checker, center, flatNeighbors)).toBeGreaterThanOrEqual(55)
  })
})

describe('ensureUniqueness（唯一性闭环）', () => {
  it('纯色图无法调整达标时标记 shapeBoost（形状兜底），不抛错', () => {
    const flat = makeImage(60, 60, () => [80, 80, 80])
    const rowLines = [0, 30, 60]
    const colLines = [0, 30, 60]
    const draft = {
      rowLines,
      colLines,
      hTabs: buildTabSpecs('h', rowLines, colLines, createRng(1), 0.16),
      vTabs: buildTabSpecs('v', colLines, rowLines, createRng(2), 0.16),
      pieces: assemblePieces(rowLines, colLines, [], []),
    }
    draft.pieces = assemblePieces(rowLines, colLines, draft.hTabs, draft.vTabs)
    const { minScore, adjusted } = ensureUniqueness(flat, draft, 18)
    expect(minScore).toBeLessThan(18)
    expect(draft.pieces.every((p) => p.shapeBoost)).toBe(true)
    // 全均匀口径（验收返工二轮）：线不再调整，adjusted 恒 0（字段保留 = CutPlan 契约兼容）
    expect(adjusted).toBe(0)
  })
})

describe('createCutPlan（集成，确定性）', () => {
  it('同图同参同种子 → 完全相同方案；不同种子形状不同', () => {
    const img = threeBandImage(90)
    const a = createCutPlan(img, { rows: 3, cols: 3 }, 42)
    const b = createCutPlan(img, { rows: 3, cols: 3 }, 42)
    expect(a).toEqual(b)
    const c = createCutPlan(img, { rows: 3, cols: 3 }, 43)
    expect(c.hTabs[0].pattern).not.toEqual(a.hTabs[0].pattern)
  })

  it('方案结构完整：线数组首尾与单调、块面积守恒、index 连续', () => {
    const plan = createCutPlan(threeBandImage(90), { rows: 3, cols: 4 }, 5)
    expect(plan.rowLines[0]).toBe(0)
    expect(plan.rowLines[plan.rowLines.length - 1]).toBe(90)
    expect(plan.colLines[plan.colLines.length - 1]).toBe(90)
    expect(plan.pieces).toHaveLength(12)
    expect(plan.pieces.map((p) => p.index)).toEqual(Array.from({ length: 12 }, (_, i) => i))
    const area = plan.pieces.reduce((sum, p) => sum + p.w * p.h, 0)
    expect(area).toBe(90 * 90)
    for (let i = 1; i < plan.rowLines.length; i++) {
      expect(plan.rowLines[i]).toBeGreaterThan(plan.rowLines[i - 1])
    }
  })

  it('噪声图/棋盘图全部块达标（minScore ≥ 阈值或形状兜底生效）', () => {
    const checker = createCutPlan(checkerImage(96, 6), { rows: 3, cols: 3 }, 11)
    expect(checker.minScore).toBeGreaterThanOrEqual(checker.params.uniquenessThreshold)
    const noisy = createCutPlan(noiseImage(96), { rows: 3, cols: 3 }, 12)
    const pass = noisy.minScore >= noisy.params.uniquenessThreshold ||
      noisy.pieces.some((p) => p.shapeBoost)
    expect(pass).toBe(true)
  })

  it('rows/cols 超界经钳制生成合法网格', () => {
    const plan = createCutPlan(threeBandImage(96), { rows: 99, cols: 1 }, 1)
    expect(plan.params.rows).toBe(12)
    expect(plan.params.cols).toBe(2)
    expect(plan.pieces).toHaveLength(24)
  })
})
