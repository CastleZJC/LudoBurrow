// 拼图块轮廓几何（纯函数，无 Canvas 依赖，技术架构 §11.6 / R-06 坐标纯函数化）
// 渲染约定：同一条内部切割线两侧块共享同一条物理曲线 —— 统一以 'before' 侧采样，
// 相邻块边缘天然互补贴合（一块的凸台落入另一块的凹口）；块角落点强制归零保证四边闭合。

import { sampleEdgePoints, type EdgePoint } from '@/engines/jigsaw-cutter'
import type { CutPlan, PieceDef } from '@/engines/jigsaw-cutter/types'

export interface Pt {
  x: number
  y: number
}

export interface PieceOutline {
  /** 闭合折线顶点（图坐标系；首尾不重复，渲染时 closePath） */
  points: Pt[]
  /** 轮廓包围盒（含锯齿外扩，图坐标系） */
  bounds: { x: number; y: number; w: number; h: number }
}

/**
 * 截取边点列的 [from, to] 区间（端点 offset 强制归零 = 精确矩形角，保证相邻块角落贴合）。
 * 输入点列须按 along 升序（sampleEdgePoints 保证）。
 */
export function sliceEdgePoints(pts: readonly EdgePoint[], from: number, to: number): EdgePoint[] {
  const out: EdgePoint[] = [{ along: from, offset: 0 }]
  for (const p of pts) {
    if (p.along > from && p.along < to) out.push(p)
  }
  out.push({ along: to, offset: 0 })
  return out
}

/**
 * 块完整轮廓（顺时针）：top → right → bottom(逆行) → left(逆行)。
 * @param piece  块定义（含四边 TabSpec 引用）
 * @param plan   切块方案（提供线全长 = 图宽/高）
 * @param tabPx  绝对锯齿深度（像素），由渲染层按比例换算
 */
export function buildPieceOutline(piece: PieceDef, plan: CutPlan, tabPx: number): PieceOutline {
  const points: Pt[] = []

  // top 边：h 线 rowLines[row]（row>0 为内部线），从左到右
  if (piece.top) {
    const spec = piece.top
    const edge = sliceEdgePoints(
      sampleEdgePoints(spec, plan.width, 'before', tabPx),
      piece.x,
      piece.x + piece.w,
    )
    for (const p of edge) points.push({ x: p.along, y: spec.at + p.offset })
  } else {
    points.push({ x: piece.x, y: piece.y })
  }

  // right 边：v 线 colLines[col+1]（col<cols-1 为内部线），从上到下
  if (piece.right) {
    const spec = piece.right
    const edge = sliceEdgePoints(
      sampleEdgePoints(spec, plan.height, 'before', tabPx),
      piece.y,
      piece.y + piece.h,
    )
    for (const p of edge) points.push({ x: spec.at + p.offset, y: p.along })
  } else {
    points.push({ x: piece.x + piece.w, y: piece.y })
  }

  // bottom 边：h 线 rowLines[row+1]，从右到左（采样点逆行）
  if (piece.bottom) {
    const spec = piece.bottom
    const edge = sliceEdgePoints(
      sampleEdgePoints(spec, plan.width, 'before', tabPx),
      piece.x,
      piece.x + piece.w,
    )
    for (const p of edge.reverse()) points.push({ x: p.along, y: spec.at + p.offset })
  } else {
    points.push({ x: piece.x + piece.w, y: piece.y + piece.h })
  }

  // left 边：v 线 colLines[col]（col>0 为内部线），从下到上（采样点逆行）
  if (piece.left) {
    const spec = piece.left
    const edge = sliceEdgePoints(
      sampleEdgePoints(spec, plan.height, 'before', tabPx),
      piece.y,
      piece.y + piece.h,
    )
    for (const p of edge.reverse()) points.push({ x: spec.at + p.offset, y: p.along })
  } else {
    points.push({ x: piece.x, y: piece.y + piece.h })
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return {
    points,
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
  }
}
