// 拼图块轮廓几何单测（M3.3 渲染纯函数）：切片归零 / 闭合性 / 相邻块共享曲线贴合 / 外扩包围盒
import { describe, it, expect } from 'vitest'
import { createRng } from '@/engines/rng'
import { assemblePieces, buildTabSpecs, sampleEdgePoints } from '@/engines/jigsaw-cutter'
import type { CutPlan } from '@/engines/jigsaw-cutter'
import { buildPieceOutline, sliceEdgePoints } from '@/games/jigsaw/pieces'

/** 3×4 真实规格方案（非均匀线 + 种子化锯齿） */
function makePlan(): CutPlan {
  const rowLines = [0, 30, 60, 90]
  const colLines = [0, 25, 50, 75, 100]
  const hTabs = buildTabSpecs('h', rowLines, colLines, createRng(3), 0.16)
  const vTabs = buildTabSpecs('v', colLines, rowLines, createRng(4), 0.16)
  return {
    width: 100,
    height: 90,
    params: { rows: 3, cols: 4, tabDepth: 0.16, uniquenessThreshold: 18 },
    seed: 1,
    rowLines,
    colLines,
    hTabs,
    vTabs,
    pieces: assemblePieces(rowLines, colLines, hTabs, vTabs),
    minScore: 50,
    adjusted: 0,
  }
}

describe('sliceEdgePoints', () => {
  const pts = [
    { along: 0, offset: 0 },
    { along: 10, offset: 2 },
    { along: 20, offset: -3 },
    { along: 30, offset: 0 },
  ]

  it('截取区间内部点，端点强制归零（= 精确矩形角）', () => {
    const out = sliceEdgePoints(pts, 5, 25)
    expect(out).toEqual([
      { along: 5, offset: 0 },
      { along: 10, offset: 2 },
      { along: 20, offset: -3 },
      { along: 25, offset: 0 },
    ])
  })

  it('空区间只有两个端点；边界点不重复', () => {
    expect(sliceEdgePoints(pts, 10, 20)).toEqual([
      { along: 10, offset: 0 },
      { along: 20, offset: 0 },
    ])
  })
})

describe('buildPieceOutline', () => {
  const plan = makePlan()
  const tabPx = 4

  it('角块（0,0）：top/left 直边，轮廓闭合回起点', () => {
    const outline = buildPieceOutline(plan.pieces[0], plan, tabPx)
    const { points } = outline
    expect(points[0]).toEqual({ x: 0, y: 0 })
    // 末点 = left 直边终点（下左角），与首点不同；渲染 closePath 闭合
    expect(points[points.length - 1]).toEqual({ x: 0, y: 30 })
    // top 直边后紧跟 right 曲边（锯齿点），总点数远超矩形 4 点
    expect(points.length).toBeGreaterThan(10)
  })

  it('中心块（1,1）：四边全为曲边，点数更多', () => {
    const corner = buildPieceOutline(plan.pieces[0], plan, tabPx)
    const center = buildPieceOutline(plan.pieces[5], plan, tabPx)
    expect(center.points.length).toBeGreaterThan(corner.points.length)
    expect(center.points.length).toBeGreaterThan(20)
  })

  it('包围盒覆盖块矩形并含锯齿外扩（tab 方向可达 ±tabPx×1.4）', () => {
    for (const piece of plan.pieces) {
      const { bounds } = buildPieceOutline(piece, plan, tabPx)
      expect(bounds.x).toBeLessThanOrEqual(piece.x)
      expect(bounds.y).toBeLessThanOrEqual(piece.y)
      expect(bounds.x + bounds.w).toBeGreaterThanOrEqual(piece.x + piece.w)
      expect(bounds.y + bounds.h).toBeGreaterThanOrEqual(piece.y + piece.h)
    }
  })

  it('相邻块共享同一条物理曲线：两侧轮廓均包含该线的全部曲边内点（贴合无空隙）', () => {
    const topPiece = plan.pieces[0] // (0,0) 底边 = h 线 rowLines[1]
    const bottomPiece = plan.pieces[4] // (1,0) 顶边 = 同一条线
    expect(topPiece.bottom).toBe(bottomPiece.top)
    const a = buildPieceOutline(topPiece, plan, tabPx)
    const b = buildPieceOutline(bottomPiece, plan, tabPx)
    // 独立重建该线曲线（同 side 同区间 = 同一条物理曲线），开区间内点逐点验证两侧包含
    const spec = topPiece.bottom!
    const curve = sliceEdgePoints(
      sampleEdgePoints(spec, plan.width, 'before', tabPx),
      topPiece.x,
      topPiece.x + topPiece.w,
    ).map((p) => ({ x: p.along, y: spec.at + p.offset }))
    const inner = curve.filter((p) => p.x > topPiece.x && p.x < topPiece.x + topPiece.w)
    expect(inner.length).toBeGreaterThan(4)
    for (const p of inner) {
      expect(a.points).toContainEqual(p)
      expect(b.points).toContainEqual(p)
    }
  })

  it('确定性：同参数重复构建结果一致', () => {
    const a = buildPieceOutline(plan.pieces[5], plan, tabPx)
    const b = buildPieceOutline(plan.pieces[5], plan, tabPx)
    expect(a).toEqual(b)
  })
})
