// AI 切块建议规范化器单测（开发计划 5.3 / 技术架构 §14.5）
// 任何 AI 输出不得直接应用：parse（剥壳）→ schema 校验 → 合法化 → 建议切块链路
// （建议线 + 锯齿 + 组装 + 唯一性闭环，与本地算法共用下游）。

import { describe, it, expect } from 'vitest'
import type { ImageDataLike } from '@/engines/jigsaw-cutter'
import {
  createCutPlanFromSuggestion,
  normalizeSuggestion,
  parseSuggestionText,
  weightsToLines,
} from '@/engines/jigsaw-cutter/suggest'

/** 纯色图（梯度全 0）：建议切块在无梯度信号下仍可工作 */
function flatImage(size = 96): ImageDataLike {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128
    data[i + 1] = 128
    data[i + 2] = 128
    data[i + 3] = 255
  }
  return { width: size, height: size, data }
}

describe('parseSuggestionText（AI 输出剥壳）', () => {
  it('纯 JSON 文本 → 解析成功', () => {
    const r = parseSuggestionText('{"rows":3,"cols":4,"rowWeights":[1,1,1],"colWeights":[1,1,1,1]}')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.suggestion.rows).toBe(3)
  })

  it('markdown 代码围栏包裹 → 剥壳后解析成功', () => {
    const r = parseSuggestionText('```json\n{"rows":2,"cols":2,"rowWeights":[1,1],"colWeights":[1,1]}\n```')
    expect(r.ok).toBe(true)
  })

  it('非法 JSON → invalid-json', () => {
    expect(parseSuggestionText('这不是 JSON')).toEqual({ ok: false, reason: 'invalid-json' })
    expect(parseSuggestionText('{"rows":3,}')).toEqual({ ok: false, reason: 'invalid-json' })
  })

  it('JSON 非对象（数组/数字）→ invalid-json', () => {
    expect(parseSuggestionText('[1,2,3]')).toEqual({ ok: false, reason: 'invalid-json' })
    expect(parseSuggestionText('42')).toEqual({ ok: false, reason: 'invalid-json' })
  })
})

describe('normalizeSuggestion（schema 校验 + 合法化）', () => {
  it('合法输入 → 归一化权重（和为 1，均 > 0）', () => {
    const r = normalizeSuggestion({
      rows: 3,
      cols: 2,
      rowWeights: [1, 2, 3],
      colWeights: [5, 5],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.suggestion.rows).toBe(3)
    expect(r.suggestion.cols).toBe(2)
    const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
    expect(sum(r.suggestion.rowWeights)).toBeCloseTo(1, 12)
    expect(sum(r.suggestion.colWeights)).toBeCloseTo(1, 12)
    expect(r.suggestion.rowWeights.every((w) => w > 0)).toBe(true)
    // 相对比例保持：[1,2,3]/6
    expect(r.suggestion.rowWeights[0]!).toBeCloseTo(1 / 6, 12)
    expect(r.suggestion.rowWeights[2]!).toBeCloseTo(3 / 6, 12)
  })

  it('rows/cols 非整数或越界（钳制会破坏权重对应）→ invalid-schema', () => {
    const mk = (rows: unknown): unknown => ({ rows, cols: 2, rowWeights: [1, 1], colWeights: [1, 1] })
    expect(normalizeSuggestion(mk(4.5)).ok).toBe(false)
    expect(normalizeSuggestion(mk(1)).ok).toBe(false)
    expect(normalizeSuggestion(mk(13)).ok).toBe(false)
    expect(normalizeSuggestion(mk('3')).ok).toBe(false)
  })

  it('权重数组长度与 rows/cols 不符 → invalid-schema', () => {
    expect(
      normalizeSuggestion({ rows: 3, cols: 2, rowWeights: [1, 1], colWeights: [1, 1] }).ok,
    ).toBe(false)
    expect(
      normalizeSuggestion({ rows: 2, cols: 2, rowWeights: [1, 1], colWeights: [1, 1, 1] }).ok,
    ).toBe(false)
  })

  it('权重含 NaN / 字符串 / 缺字段 → invalid-schema', () => {
    expect(normalizeSuggestion({ rows: 2, cols: 2, rowWeights: [1, Number.NaN], colWeights: [1, 1] }).ok).toBe(false)
    expect(normalizeSuggestion({ rows: 2, cols: 2, rowWeights: [1, '2'], colWeights: [1, 1] }).ok).toBe(false)
    expect(normalizeSuggestion({ rows: 2, cols: 2, colWeights: [1, 1] }).ok).toBe(false)
  })

  it('权重 0 / 负值（数值钳制合法化）→ 抬升下限后归一化通过', () => {
    const r = normalizeSuggestion({ rows: 2, cols: 2, rowWeights: [0, 1], colWeights: [-1, 1] })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.suggestion.rowWeights.every((w) => w > 0)).toBe(true)
      expect(r.suggestion.colWeights.every((w) => w > 0)).toBe(true)
    }
  })
})

describe('weightsToLines（权重 → 切割线，累计等分）', () => {
  it('均匀权重 → 像素等分（含首尾边界）', () => {
    expect(weightsToLines([1, 1, 1, 1], 100)).toEqual([0, 25, 50, 75, 100])
  })

  it('偏斜权重 [3,1] → 前段占 3/4（权重大 = 块大）', () => {
    expect(weightsToLines([3, 1], 100)).toEqual([0, 75, 100])
  })

  it('单段 → 仅首尾', () => {
    expect(weightsToLines([2], 50)).toEqual([0, 50])
  })
})

describe('createCutPlanFromSuggestion（建议 → 切块方案，复用唯一性闭环）', () => {
  const SUGGESTION = normalizeSuggestion({
    rows: 3,
    cols: 3,
    rowWeights: [3, 1, 1],
    colWeights: [1, 1, 3],
  })
  if (!SUGGESTION.ok) throw new Error('测试前置：合法建议')

  it('结构完整：线长 rows+1、块数 rows×cols、首尾边界', () => {
    const img = flatImage(96)
    const plan = createCutPlanFromSuggestion(img, SUGGESTION.suggestion, { rows: 3, cols: 3 }, 42)
    expect(plan.rowLines).toHaveLength(4)
    expect(plan.colLines).toHaveLength(4)
    expect(plan.pieces).toHaveLength(9)
    expect(plan.rowLines[0]).toBe(0)
    expect(plan.rowLines[3]).toBe(96)
    expect(plan.colLines[0]).toBe(0)
    expect(plan.colLines[3]).toBe(96)
  })

  it('偏斜建议生效：rowWeights [3,1,1] → 第一行边界 > 中点（前段块大）', () => {
    const img = flatImage(96)
    const plan = createCutPlanFromSuggestion(img, SUGGESTION.suggestion, { rows: 3, cols: 3 }, 42)
    // [3,1,1]/5 → 边界 57.6 → 唯一性调整容差内仍应明显大于中点
    expect(plan.rowLines[1]).toBeGreaterThan(48)
    // colWeights [1,1,3] → 前两列紧凑（第二条内部线 < 中点）、第三列段宽 > 中点
    expect(plan.colLines[2]).toBeLessThan(48)
    expect(plan.colLines[3]! - plan.colLines[2]!).toBeGreaterThan(48)
  })

  it('确定性：同图同建议同参同种子 → 完全相同方案', () => {
    const img = flatImage(96)
    const a = createCutPlanFromSuggestion(img, SUGGESTION.suggestion, { rows: 3, cols: 3, tabDepth: 0.2 }, 7)
    const b = createCutPlanFromSuggestion(img, SUGGESTION.suggestion, { rows: 3, cols: 3, tabDepth: 0.2 }, 7)
    expect(a).toEqual(b)
    const c = createCutPlanFromSuggestion(img, SUGGESTION.suggestion, { rows: 3, cols: 3, tabDepth: 0.2 }, 8)
    expect(c.hTabs).not.toEqual(a.hTabs) // 种子影响锯齿形态
  })

  it('base.tabDepth / uniquenessThreshold 传入：tabDepth 固化到线规格', () => {
    const img = flatImage(96)
    const plan = createCutPlanFromSuggestion(
      img,
      SUGGESTION.suggestion,
      { rows: 3, cols: 3, tabDepth: 0.24, uniquenessThreshold: 5 },
      42,
    )
    expect(plan.params.tabDepth).toBe(0.24)
    expect(plan.params.uniquenessThreshold).toBe(5)
    expect(plan.hTabs.every((t) => t.baseDepth === 0.24)).toBe(true)
  })

  it('唯一性闭环参与：纯色图（区分度低）不崩溃，minScore 有限', () => {
    const img = flatImage(96)
    const plan = createCutPlanFromSuggestion(img, SUGGESTION.suggestion, { rows: 3, cols: 3 }, 42)
    expect(Number.isFinite(plan.minScore)).toBe(true)
    expect(plan.adjusted).toBeGreaterThanOrEqual(0)
  })
})
