// 切块引擎编排（技术架构 §11.6）：均匀网格 → 锯齿边缘 → 唯一性校验闭环（v1.0 验收返工二轮：全均匀切块）
// 本地算法为默认兜底：纯前端纯函数，离线 file:// 永远可用；AI 建议（M5）经规范化器后复用本链路（建议只贡献块数）。

import { createRng } from '../rng'
import type { CutParams, CutPlan, ImageDataLike, RequiredCutParams } from './types'
import { buildAxisLines } from './grid'
import { buildTabSpecs } from './edge'
import { assemblePieces, ensureUniqueness } from './uniqueness'

const MIN_GRID = 2
const MAX_GRID = 12
const DEFAULT_TAB_DEPTH = 0.16
const DEFAULT_THRESHOLD = 18

/** 参数规范化：rows/cols 钳制 [2,12]，tabDepth [0.08,0.25]，阈值 [0,100] */
export function normalizeCutParams(params: CutParams): RequiredCutParams {
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
  return {
    rows: Math.round(clamp(params.rows, MIN_GRID, MAX_GRID)),
    cols: Math.round(clamp(params.cols, MIN_GRID, MAX_GRID)),
    tabDepth: clamp(params.tabDepth ?? DEFAULT_TAB_DEPTH, 0.08, 0.25),
    uniquenessThreshold: clamp(params.uniquenessThreshold ?? DEFAULT_THRESHOLD, 0, 100),
  }
}

/**
 * 切块主入口（确定性：同图 + 同参数 + 同种子 → 完全相同方案）。
 * 流程：均匀行/列切割 → 内部线锯齿规格 → 组装块 → 唯一性校验（低分块形状强化，线位不动）。
 */
export function createCutPlan(image: ImageDataLike, params: CutParams, seed: number): CutPlan {
  const p = normalizeCutParams(params)
  const rng = createRng(seed)
  const rowLines = buildAxisLines(image.height, p.rows)
  const colLines = buildAxisLines(image.width, p.cols)

  const hTabs = buildTabSpecs('h', rowLines, colLines, rng, p.tabDepth)
  const vTabs = buildTabSpecs('v', colLines, rowLines, rng, p.tabDepth)

  const draft = {
    rowLines,
    colLines,
    hTabs,
    vTabs,
    pieces: assemblePieces(rowLines, colLines, hTabs, vTabs),
  }
  const { minScore, adjusted } = ensureUniqueness(image, draft, p.uniquenessThreshold)

  return {
    width: image.width,
    height: image.height,
    params: p,
    seed,
    rowLines: draft.rowLines,
    colLines: draft.colLines,
    hTabs: draft.hTabs,
    vTabs: draft.vTabs,
    pieces: draft.pieces,
    minScore,
    adjusted,
  }
}

export { buildAxisLines } from './grid'
export { buildTabSpecs, sampleEdgePoints, type EdgePoint } from './edge'
export { pieceScore, assemblePieces, ensureUniqueness } from './uniqueness'
export type { ImageDataLike, CutParams, RequiredCutParams, TabSpec, PieceDef, CutPlan } from './types'
