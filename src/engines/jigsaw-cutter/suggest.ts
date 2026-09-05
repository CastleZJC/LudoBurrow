// AI 切块建议规范化与建线（技术架构 §14.5）
// 任何 AI 输出不得直接应用：剥壳解析（parseSuggestionText）→ schema 校验与合法化
// （normalizeSuggestion）→ 权重累计等分建线（weightsToLines），建议线替换本地梯度线后
// 复用锯齿/组装/唯一性闭环（createCutPlanFromSuggestion，与本地算法同源下游）。

import { createRng } from '../rng'
import { normalizeCutParams } from './index'
import { buildTabSpecs } from './edge'
import { assemblePieces, ensureUniqueness } from './uniqueness'
import type { CutParams, CutPlan, ImageDataLike, RequiredCutParams } from './types'

/** 与本地算法同口径的网格界（index.ts normalizeCutParams）：越界即拒绝而非钳制（钳制会破坏权重对应） */
const MIN_GRID = 2
const MAX_GRID = 12
/** 权重抬升下限：0/负值块仍需可切（数值合法化，§14.5） */
const WEIGHT_FLOOR = 0.01

/** AI 返回的原始建议形状（剥壳后的直接产物，字段未校验） */
export interface CutSuggestionJSON {
  rows: number
  cols: number
  /** 每行相对高度权重（权重大 = 块高；细节丰富区切小块 = 低权重，与本地梯度算法方向一致） */
  rowWeights: number[]
  /** 每列相对宽度权重 */
  colWeights: number[]
}

/** 规范化后的建议：rows/cols 合法整数、权重归一化（和为 1 且均 > 0）——可直接持久化到方案 */
export interface NormalizedSuggestion {
  rows: number
  cols: number
  rowWeights: number[]
  colWeights: number[]
}

export type ParseResult = { ok: true; suggestion: CutSuggestionJSON } | { ok: false; reason: 'invalid-json' }

export type NormalizeResult =
  | { ok: true; suggestion: NormalizedSuggestion }
  | { ok: false; reason: 'invalid-schema' }

/** markdown 代码围栏（```json ... ```）剥壳：LLM 常把 JSON 包在围栏中 */
const FENCED = /^```(?:json)?\s*([\s\S]*?)\s*```$/i

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 网格数校验：必须为 [2,12] 内整数（字符串/小数/越界均拒） */
function isGridCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= MIN_GRID && v <= MAX_GRID
}

/** AI 文本输出 → JSON 对象；只保证「可解析且为对象」，字段校验归 normalizeSuggestion */
export function parseSuggestionText(text: string): ParseResult {
  const trimmed = text.trim()
  const fenced = FENCED.exec(trimmed)
  const payload = fenced ? fenced[1]! : trimmed
  try {
    const parsed: unknown = JSON.parse(payload)
    if (!isPlainObject(parsed)) return { ok: false, reason: 'invalid-json' }
    // 字段校验归 normalizeSuggestion（此处仅保证「是个 JSON 对象」）
    return { ok: true, suggestion: parsed as unknown as CutSuggestionJSON }
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
}

/** schema 校验 + 合法化：结构/类型/长度不符即拒；数值越界经抬下限 + 归一化合法化 */
export function normalizeSuggestion(raw: unknown): NormalizeResult {
  if (!isPlainObject(raw)) return { ok: false, reason: 'invalid-schema' }
  const { rows, cols, rowWeights, colWeights } = raw
  if (!isGridCount(rows) || !isGridCount(cols)) return { ok: false, reason: 'invalid-schema' }
  if (!Array.isArray(rowWeights) || !Array.isArray(colWeights)) return { ok: false, reason: 'invalid-schema' }
  if (rowWeights.length !== rows || colWeights.length !== cols) return { ok: false, reason: 'invalid-schema' }
  const isFiniteNumber = (w: unknown): w is number => typeof w === 'number' && Number.isFinite(w)
  if (!rowWeights.every(isFiniteNumber) || !colWeights.every(isFiniteNumber)) {
    return { ok: false, reason: 'invalid-schema' }
  }
  return {
    ok: true,
    suggestion: {
      rows,
      cols,
      rowWeights: normalizeWeights(rowWeights),
      colWeights: normalizeWeights(colWeights),
    },
  }
}

/** 0/负值抬升下限后归一化（和为 1，均 > 0）；相对比例保持 */
function normalizeWeights(weights: readonly number[]): number[] {
  const lifted = weights.map((w) => Math.max(w, WEIGHT_FLOOR))
  const total = lifted.reduce((a, b) => a + b, 0)
  return lifted.map((w) => w / total)
}

/**
 * 权重累计等分 → 切割线坐标（含首尾 0/size；第 i 条内部线 = 前 i 段权重占比 × size）。
 * 网格对齐（§14.5 合法化）：round 到整数像素并保证严格递增——
 * 下游区分度采样/锯齿分段按整数像素索引，浮点线会产生 NaN 采样（与本地算法产出同口径）。
 */
export function weightsToLines(weights: readonly number[], size: number): number[] {
  const total = weights.reduce((a, b) => a + b, 0)
  const lines: number[] = [0]
  let acc = 0
  for (let i = 0; i < weights.length - 1; i += 1) {
    acc += weights[i]!
    const next = Math.round((acc / total) * size)
    // 抬升下限后极端权重（0.01）仍保证每段 ≥ 1px；n ≤ 12 且 size ≥ 96 时尾线恒大于末段
    lines.push(Math.max(next, lines[lines.length - 1]! + 1))
  }
  lines.push(size)
  return lines
}

/**
 * 建议 → 切块方案：rows/cols/权重来自建议，tabDepth/uniquenessThreshold 沿用调用方 base。
 * 建议线替换本地梯度线，锯齿规格/组装/唯一性闭环与 createCutPlan 完全同源。
 */
export function createCutPlanFromSuggestion(
  image: ImageDataLike,
  suggestion: NormalizedSuggestion,
  base: CutParams,
  seed: number,
): CutPlan {
  const p: RequiredCutParams = {
    ...normalizeCutParams(base),
    rows: suggestion.rows,
    cols: suggestion.cols,
  }
  const rng = createRng(seed)
  const rowLines = weightsToLines(suggestion.rowWeights, image.height)
  const colLines = weightsToLines(suggestion.colWeights, image.width)

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
