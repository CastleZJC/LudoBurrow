// 切块规格自动优选（验收返工「每图自动选最优切块方案」）
// 语义：难度档（图库 complexity）决定块数窗口，窗口内按图片内容挑出「块最好认、切得最匀、块形最正」的 rows×cols；
//       只选 rows/cols —— 锯齿深度与种子不参与区分度评分（评分只采样块矩形），保持既有参数口径不变。
// 确定性：输入 = 内嵌分析缩略（thumbs.ts data URI）+ 纯函数评分 → 同版本同图恒同结果，任何设备可复现；
//         规格不是用户数据，不入档（存档 schema 零变更），每次启动重算 + 进程内缓存复用。
// 兜底：无 Canvas 像素回读能力（异常环境 / 测试 mock）或单图分析失败 → 回落复杂度占位网格（schemes.ts）。

import { buildAxisLines, pieceScore } from '@/engines/jigsaw-cutter'
import type { ImageDataLike, PieceDef } from '@/engines/jigsaw-cutter'
import { GALLERY, loadAnalysisImage } from './gallery'
import type { GalleryEntry } from './gallery'

/** 切块规格（行×列） */
export interface GridSpec {
  rows: number
  cols: number
}

/**
 * 难度档 → 块数窗口与目标块数。
 * target 与旧「复杂度 + 2」占位网格同块数（1→3×3=9 / 2→4×4=16 / 3→5×5=25）：
 * 内容无显著偏向的图仍选回占位规格，难度阶梯与验收前的关卡曲线一致。
 */
export const COMPLEXITY_PIECES: Record<1 | 2 | 3, { min: number; max: number; target: number }> = {
  1: { min: 6, max: 12, target: 9 },
  2: { min: 12, max: 20, target: 16 },
  3: { min: 20, max: 30, target: 25 },
}

/** 规格单边上限（内置图库难度阶梯不超过 6；引擎本身支持到 12） */
const MAX_EDGE = 6

/** 区分度阈值（与引擎默认一致：低于此分的块算「弱块」） */
const WEAK_THRESHOLD = 18
/** 平均区分度满分参考（pieceScore 0-100；45 分以上视为足够好认） */
const MEAN_FULL = 45
/** 最弱块区分度满分参考 */
const MIN_FULL = 25
/** 权重：平均区分度 / 最弱块 / 弱块占比 / 面积均匀度 */
const W_MEAN = 0.4
const W_MIN = 0.2
const W_WEAK = 0.2
const W_UNIFORM = 0.2
/** 块形偏离正方形的扣分上限（比例差 2 倍及以上扣满） */
const ASPECT_WEIGHT = 0.35
/** 单图分析超时（异常图源不至于让预热悬挂） */
const WARM_TIMEOUT_MS = 4000

/** 单规格评分明细（可观测：调试与测试断言用） */
export interface SpecScore extends GridSpec {
  /** 最低块区分度（0-100） */
  min: number
  /** 平均块区分度（0-100） */
  mean: number
  /** 低于阈值的块占比（0-1） */
  weakRatio: number
  /** 块面积均匀度（1 = 完全均匀） */
  uniformity: number
  /** 块宽高比偏离正方形的惩罚（0 = 正方形，1 = 偏离 ≥2 倍） */
  aspectPenalty: number
  /** 综合分（0-100，越高越优） */
  score: number
}

export interface BestSpecResult {
  spec: GridSpec
  score: SpecScore
  /** 全部候选评分（候选顺序 = 择优优先序，同分时靠前者优先） */
  ranked: SpecScore[]
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

function std(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

/**
 * 候选规格（确定性顺序）：块数落在难度档窗口内、单边 ≤ 6 的全部 rows×cols，
 * 按「块数贴近目标」升序排列（同偏差保持 rows 升序生成序）——同分时优先难度最贴近占位阶梯的规格。
 */
export function candidateSpecs(complexity: 1 | 2 | 3): GridSpec[] {
  const window = COMPLEXITY_PIECES[complexity]
  const out: GridSpec[] = []
  for (let rows = 2; rows <= MAX_EDGE; rows++) {
    for (let cols = 2; cols <= MAX_EDGE; cols++) {
      const pieces = rows * cols
      if (pieces < window.min || pieces > window.max) continue
      out.push({ rows, cols })
    }
  }
  return out.sort(
    (a, b) => Math.abs(a.rows * a.cols - window.target) - Math.abs(b.rows * b.cols - window.target),
  )
}

/**
 * 块数 → 难度档（自定义上传图无 complexity 元数据时用：按当前表单块数保持档位不变，只优化行列分配）。
 * 窗口边界重叠处（12 / 20）归低档，与 candidateSpecs 的窗口口径一致。
 */
export function complexityForPieces(pieces: number): 1 | 2 | 3 {
  if (pieces <= COMPLEXITY_PIECES[1].max) return 1
  if (pieces <= COMPLEXITY_PIECES[2].max) return 2
  return 3
}

/** 评估用块矩形（不生成锯齿规格：区分度评分只采样矩形，锯齿不参与） */
function evalPieces(rowLines: number[], colLines: number[]): PieceDef[] {
  const rows = rowLines.length - 1
  const cols = colLines.length - 1
  const out: PieceDef[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        index: r * cols + c,
        row: r,
        col: c,
        x: colLines[c]!,
        y: rowLines[r]!,
        w: colLines[c + 1]! - colLines[c]!,
        h: rowLines[r + 1]! - rowLines[r]!,
        top: null,
        right: null,
        bottom: null,
        left: null,
        score: 0,
        shapeBoost: false,
      })
    }
  }
  return out
}

function neighboursOf(piece: PieceDef, all: PieceDef[]): PieceDef[] {
  return all.filter((q) => Math.abs(q.row - piece.row) + Math.abs(q.col - piece.col) === 1)
}

/**
 * 单规格评分（纯函数）：复用引擎的均匀建线与块区分度评分，保证「评估口径 = 实际切块口径」。
 * 验收返工二轮：切割线恒均匀（与 createCutPlan 同式），内容分析只用于选块数（rows×cols）。
 */
export function scoreSpec(
  image: ImageDataLike,
  spec: GridSpec,
  opts: { threshold?: number } = {},
): SpecScore {
  const threshold = opts.threshold ?? WEAK_THRESHOLD
  const rowLines = buildAxisLines(image.height, spec.rows)
  const colLines = buildAxisLines(image.width, spec.cols)
  const pieces = evalPieces(rowLines, colLines)
  const scores = pieces.map((p) => pieceScore(image, p, neighboursOf(p, pieces)))

  const areas = pieces.map((p) => p.w * p.h)
  const meanArea = mean(areas)
  const uniformity = meanArea > 0 ? clamp01(1 - std(areas) / meanArea) : 0
  // 块宽高比：(图宽/cols) / (图高/rows)；=1 为正方形块，偏离 2 倍及以上扣满
  const blockAspect = (image.width / spec.cols) / (image.height / spec.rows)
  const aspectPenalty = clamp01(Math.abs(Math.log(blockAspect)) / Math.LN2)

  const min = Math.min(...scores)
  const avg = mean(scores)
  const weakRatio = scores.filter((s) => s < threshold).length / scores.length
  const quality =
    W_MEAN * clamp01(avg / MEAN_FULL) +
    W_MIN * clamp01(min / MIN_FULL) +
    W_WEAK * (1 - weakRatio) +
    W_UNIFORM * uniformity

  return {
    rows: spec.rows,
    cols: spec.cols,
    min,
    mean: avg,
    weakRatio,
    uniformity,
    aspectPenalty,
    score: 100 * quality * (1 - ASPECT_WEIGHT * aspectPenalty),
  }
}

/**
 * 每图自动选最优规格：枚举难度档候选并评分，取综合分最高者（同分取候选序靠前 = 块数更贴近目标）。
 * 验收返工二轮：切块全均匀，内容分析（色彩/线条区分度）仅决定块数选择。
 */
export function pickBestSpec(
  image: ImageDataLike,
  complexity: 1 | 2 | 3,
  opts: { threshold?: number } = {},
): BestSpecResult {
  const ranked = candidateSpecs(complexity).map((spec) => scoreSpec(image, spec, opts))
  let best = ranked[0]!
  for (const item of ranked) if (item.score > best.score) best = item
  return { spec: { rows: best.rows, cols: best.cols }, score: best, ranked }
}

// ---- 进程内缓存（内置图 imageId → 最优规格）----

const specCache = new Map<string, GridSpec>()

/** 已解析的最优规格（未解析返回 undefined → 调用方回落复杂度占位网格） */
export function bestSpecFor(imageId: string): GridSpec | undefined {
  return specCache.get(imageId)
}

/** 写入缓存（预热与单图补算共用） */
export function rememberSpec(imageId: string, spec: GridSpec): void {
  specCache.set(imageId, { rows: spec.rows, cols: spec.cols })
}

/** 清空缓存（图库刷新 / 测试隔离用） */
export function resetSpecCache(): void {
  specCache.clear()
}

/** 已解析图数（预热进度观测 / 测试断言） */
export function cachedSpecCount(): number {
  return specCache.size
}

/**
 * Canvas 像素回读能力自检：getContext 存在还不够（无实现环境会返回桩对象），
 * 需实测 getImageData 的尺寸与数据长度是否与请求一致——不一致即视为不可分析，直接走占位兜底。
 */
export function canAnalyze(): boolean {
  if (typeof document === 'undefined') return false
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 4
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  try {
    const probe = ctx.getImageData(0, 0, 2, 2)
    return probe.width === 2 && probe.height === 2 && probe.data.length === 16
  } catch {
    return false
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`jigsaw: 分析超时 ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error('jigsaw: 分析失败'))
      },
    )
  })
}

/**
 * 预热内置图库最优规格（App 启动 / 拼图选关页挂载时调用；幂等，已解析图跳过）。
 * 串行逐图：单图失败（图源缺失 / 解码异常 / 超时）只记入 failed 并回落占位网格，不影响其余图。
 * 无 Canvas 像素能力时立即返回（不做任何解码）；自备解码器（decode 注入，测试/建图工具）视为已具备能力。
 */
export async function warmBuiltinOptima(
  opts: { timeoutMs?: number; decode?: (entry: GalleryEntry) => Promise<ImageDataLike> } = {},
): Promise<{ ok: string[]; failed: string[] }> {
  const ok: string[] = []
  const failed: string[] = []
  const decode = opts.decode ?? loadAnalysisImage
  // 未注入解码器时才做能力自检：自备解码器 = 已具备分析能力（测试/建图工具）
  if (!opts.decode && !canAnalyze()) {
    return { ok, failed: GALLERY.filter((e) => !specCache.has(e.id)).map((e) => e.id) }
  }
  const timeoutMs = opts.timeoutMs ?? WARM_TIMEOUT_MS
  for (const entry of GALLERY) {
    if (specCache.has(entry.id)) {
      ok.push(entry.id)
      continue
    }
    try {
      const image = await withTimeout(decode(entry), timeoutMs)
      rememberSpec(entry.id, pickBestSpec(image, entry.complexity).spec)
      ok.push(entry.id)
    } catch {
      failed.push(entry.id)
    }
  }
  return { ok, failed }
}
