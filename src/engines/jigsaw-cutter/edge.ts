// 锯齿凸凹边缘生成（技术架构 §11.6）：切割线级规格，线两侧块共享同一 TabSpec，
// 凸凹互补 = 几何层对另一侧取反符号（数据层单一出处）。

import type { Rng } from '../rng'
import type { TabSpec } from './types'

/** 每块边沿的锯齿段数（奇数，中段为主凸） */
const SEGMENTS_PER_PIECE_EDGE = 3
/** 平坦段概率（约 12% 的段不带凸凹，增加形态多样性） */
const FLAT_CHANCE = 0.12
/** 锯齿骨架每段样条插点数（验收四轮七圆润化：3 → 每段 16 点，折线转平滑曲线） */
const SMOOTH_SUBDIV = 3

/**
 * 为一组同向内部切割线生成锯齿规格。
 * @param lines    轴向边界数组（buildAxisLines 产物，含首尾）
 * @param spans    每条内部线所横跨的垂直向边界（决定每段的起止与宽度）
 * @param depth    基础深度比例（CutParams.tabDepth）
 */
export function buildTabSpecs(
  dir: 'h' | 'v',
  lines: number[],
  spans: number[],
  rng: Rng,
  depth: number,
): TabSpec[] {
  const specs: TabSpec[] = []
  // 内部线索引 1..lines.length-2；每条线按垂直向 spans 分段（每块边 SEGMENTS_PER_PIECE_EDGE 段）
  for (let li = 1; li < lines.length - 1; li++) {
    const segments = Math.max(1, (spans.length - 1) * SEGMENTS_PER_PIECE_EDGE)
    const pattern: number[] = []
    const depths: number[] = []
    for (let s = 0; s < segments; s++) {
      if (rng.next() < FLAT_CHANCE) {
        pattern.push(0)
      } else {
        pattern.push(rng.next() < 0.5 ? 1 : -1)
      }
      depths.push(0.6 + rng.next() * 0.8) // 0.6 - 1.4
    }
    specs.push({ dir, at: lines[li], segments, pattern, depths, baseDepth: depth })
  }
  return specs
}

/**
 * 块几何路径采样点（渲染/命中检测用）：把某一条边展开为带锯齿的折线点列。
 * side = 该块位于线的哪一侧（'before' = 上/左块，'after' = 下/右块），凸凹符号随之翻转。
 * 返回相对块基准矩形的偏移点列 [{ along, offset }]：
 *   along = 沿边方向坐标（0..length），offset = 垂直边方向偏移（0 = 基准线，正 = 凸出侧）
 */
export interface EdgePoint {
  along: number
  offset: number
}

/**
 * Catmull-Rom 样条插值单点（p1→p2 段，t∈(0,1]；切线由邻点 p0/p3 决定，端点自然延长）。
 * 验收四轮七：锯齿边缘圆润化 —— 肩/峰折线顶点经样条细分后为平滑曲线，
 * 点列端点（肩部/段尾基准零点）精确保留，两侧块共享同一点列仍互补贴合。
 */
function catmullPoint(
  p0: EdgePoint,
  p1: EdgePoint,
  p2: EdgePoint,
  p3: EdgePoint,
  t: number,
): EdgePoint {
  const t2 = t * t
  const t3 = t2 * t
  const f = (a: number, b: number, c: number, d: number): number =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  return {
    along: f(p0.along, p1.along, p2.along, p3.along),
    offset: f(p0.offset, p1.offset, p2.offset, p3.offset),
  }
}

/** 顶点列样条细分（sub = 每段插点数）：输出含首点、不含尾点；首尾顶点用相邻点自然延长切线 */
function smoothPoints(pts: readonly EdgePoint[], sub: number): EdgePoint[] {
  const out: EdgePoint[] = [pts[0]!]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[i + 2] ?? pts[i + 1]!
    for (let k = 1; k <= sub; k++) out.push(catmullPoint(p0, p1, p2, p3, k / sub))
  }
  return out
}

export function sampleEdgePoints(
  spec: TabSpec,
  length: number,
  side: 'before' | 'after',
  baseDepth: number,
  boost = 1,
): EdgePoint[] {
  const sign = side === 'before' ? -1 : 1 // before 侧（上/左块）基准线上方为负方向
  const segWidth = length / spec.segments
  const points: EdgePoint[] = [{ along: 0, offset: 0 }]
  for (let s = 0; s < spec.segments; s++) {
    const shape = spec.pattern[s] * sign * boost > 0 ? 1 : spec.pattern[s] * sign * boost < 0 ? -1 : 0
    const depth = spec.depths[s] * baseDepth * (shape === 0 ? 0 : 1) * boost
    const start = s * segWidth
    const end = start + segWidth
    if (shape === 0) {
      points.push({ along: end, offset: 0 })
      continue
    }
    // 段内锯齿骨架：起 → 凸肩(25%) → 峰(50%) → 凸肩(75%) → 段尾；
    // 骨架经 Catmull-Rom 细分（验收四轮七圆润化），肩部零点与段尾零点保持精确
    const mid = (start + end) / 2
    const shoulder1 = start + segWidth * 0.25
    const shoulder2 = start + segWidth * 0.75
    const tabLen = segWidth * 0.5 // 凸起部分占半段（肩到肩）
    const skeleton: EdgePoint[] = [
      { along: shoulder1, offset: 0 },
      { along: shoulder1 + tabLen * 0.2, offset: depth * shape },
      { along: mid, offset: depth * shape },
      { along: shoulder2 - tabLen * 0.2, offset: depth * shape },
      { along: shoulder2, offset: 0 },
    ]
    points.push(...smoothPoints(skeleton, SMOOTH_SUBDIV), { along: end, offset: 0 })
  }
  return points
}
