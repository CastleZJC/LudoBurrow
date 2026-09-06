// 块视觉区分度评分与唯一性校验（技术架构 §11.6，v1.0 验收返工二轮：全均匀切块口径）
// 目标：从算法上保证「不存在模棱两可的位置」——
//   低区分度块（纯色/低对比）不再移动切割线（线位恒均匀），直接形状强化兜底（锯齿加深，形状即线索）。

import type { ImageDataLike, PieceDef, TabSpec } from './types'
import { luma } from './grid'

/** 块边界采样点数（每条邻接边） */
const EDGE_SAMPLES = 8

/** 收集块内亮度采样（步长采样控制计算量） */
function sampleLuma(image: ImageDataLike, rect: { x: number; y: number; w: number; h: number }): number[] {
  const { width: w, data } = image
  const stepX = Math.max(1, Math.floor(rect.w / 12))
  const stepY = Math.max(1, Math.floor(rect.h / 12))
  const out: number[] = []
  for (let y = rect.y; y < rect.y + rect.h; y += stepY) {
    for (let x = rect.x; x < rect.x + rect.w; x += stepX) {
      const i = (y * w + x) * 4
      out.push(luma(data[i], data[i + 1], data[i + 2]))
    }
  }
  return out
}

function std(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/** 两条邻接边的平均亮度差（0-255）：沿线等距采样对应点 */
function edgeContrast(image: ImageDataLike, a: PieceDef, b: PieceDef, side: 'top' | 'bottom' | 'left' | 'right'): number {
  const { width: w, data } = image
  const px = (x: number, y: number): number => {
    const i = (y * w + x) * 4
    return luma(data[i], data[i + 1], data[i + 2])
  }
  let sum = 0
  if (side === 'top' || side === 'bottom') {
    const yA = side === 'top' ? a.y : a.y + a.h - 1
    const yB = side === 'top' ? b.y + b.h - 1 : b.y
    for (let s = 0; s < EDGE_SAMPLES; s++) {
      const x = a.x + Math.floor((a.w * (s + 0.5)) / EDGE_SAMPLES)
      sum += Math.abs(px(x, yA) - px(x, yB))
    }
  } else {
    const xA = side === 'left' ? a.x : a.x + a.w - 1
    const xB = side === 'left' ? b.x + b.w - 1 : b.x
    for (let s = 0; s < EDGE_SAMPLES; s++) {
      const y = a.y + Math.floor((a.h * (s + 0.5)) / EDGE_SAMPLES)
      sum += Math.abs(px(xA, y) - px(xB, y))
    }
  }
  return sum / EDGE_SAMPLES
}

/**
 * 单块区分度评分（0-100）：
 *   颜色方差分（权重 0.6，std 0-127 → 0-100）+ 邻块对比度分（权重 0.4，差值 0-255 → 0-100）
 * 纯色且与邻块无差异 → 0 分（模棱两可）；色彩丰富且边界清晰 → 高分。
 */
export function pieceScore(image: ImageDataLike, piece: PieceDef, neighbors: PieceDef[]): number {
  const varScore = Math.min(100, (std(sampleLuma(image, piece)) * 100) / 127)
  let contrast = 0
  let sides = 0
  for (const nb of neighbors) {
    if (nb.row === piece.row - 1) { contrast += edgeContrast(image, piece, nb, 'top'); sides++ }
    if (nb.row === piece.row + 1) { contrast += edgeContrast(image, piece, nb, 'bottom'); sides++ }
    if (nb.col === piece.col - 1) { contrast += edgeContrast(image, piece, nb, 'left'); sides++ }
    if (nb.col === piece.col + 1) { contrast += edgeContrast(image, piece, nb, 'right'); sides++ }
  }
  const contrastScore = sides > 0 ? Math.min(100, ((contrast / sides) * 100) / 255) : 0
  return Math.round(0.6 * varScore + 0.4 * contrastScore)
}

/** 由切割线数组组装块矩形与四边锯齿引用（score/shapeBoost 由调用方补齐） */
export function assemblePieces(
  rowLines: number[],
  colLines: number[],
  hTabs: TabSpec[],
  vTabs: TabSpec[],
): PieceDef[] {
  const rows = rowLines.length - 1
  const cols = colLines.length - 1
  const pieces: PieceDef[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pieces.push({
        index: r * cols + c,
        row: r,
        col: c,
        x: colLines[c],
        y: rowLines[r],
        w: colLines[c + 1] - colLines[c],
        h: rowLines[r + 1] - rowLines[r],
        top: r > 0 ? hTabs[r - 1] : null,
        right: c < cols - 1 ? vTabs[c] : null,
        bottom: r < rows - 1 ? hTabs[r] : null,
        left: c > 0 ? vTabs[c - 1] : null,
        score: 0,
        shapeBoost: false,
      })
    }
  }
  return pieces
}

/**
 * 唯一性校验（全均匀切块口径）：评分 → 低于阈值的块标记 shapeBoost（渲染时锯齿加深，形状区分兜底）。
 * 切割线不再调整（验收返工二轮：线位恒均匀）；返回 adjusted 恒 0（字段保留 = CutPlan 契约不变，历史方案读取兼容）。
 */
export function ensureUniqueness(
  image: ImageDataLike,
  draft: { rowLines: number[]; colLines: number[]; hTabs: TabSpec[]; vTabs: TabSpec[]; pieces: PieceDef[] },
  threshold: number,
): { minScore: number; adjusted: number } {
  for (const p of draft.pieces) {
    const neighbors = draft.pieces.filter(
      (q) => Math.abs(q.row - p.row) + Math.abs(q.col - p.col) === 1,
    )
    p.score = pieceScore(image, p, neighbors)
  }
  for (const p of draft.pieces) {
    if (p.score < threshold) p.shapeBoost = true
  }
  const minScore = Math.min(...draft.pieces.map((p) => p.score))
  return { minScore, adjusted: 0 }
}
