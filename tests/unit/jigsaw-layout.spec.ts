// 拼图五区布局与吸附命中单测（M3.3/M3.4 坐标纯函数）
import { describe, it, expect } from 'vitest'
import type { CutPlan } from '@/engines/jigsaw-cutter'
import {
  boardContentRect,
  computeLayout,
  hitTestSlot,
  pointInRect,
  slotRect,
} from '@/games/jigsaw/layout'

function makePlan(w: number, h: number, rowLines: number[], colLines: number[]): CutPlan {
  return {
    width: w,
    height: h,
    params: { rows: rowLines.length - 1, cols: colLines.length - 1, tabDepth: 0.16, uniquenessThreshold: 18 },
    seed: 1,
    rowLines,
    colLines,
    hTabs: [],
    vTabs: [],
    pieces: [],
    minScore: 50,
    adjusted: 0,
  }
}

describe('computeLayout（五区）', () => {
  it('960×600：五区互不重叠且都在容器内', () => {
    const rects = computeLayout(960, 600)
    const all = [rects.preview, rects.board, rects.staging, rects.current, rects.remaining]
    for (const r of all) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(960)
      expect(r.y + r.h).toBeLessThanOrEqual(600)
    }
    // 左列（preview/staging）在 board 左侧；底条（current/remaining）在 board 下方
    expect(rects.preview.x + rects.preview.w).toBeLessThanOrEqual(rects.board.x)
    expect(rects.staging.x + rects.staging.w).toBeLessThanOrEqual(rects.board.x)
    expect(rects.current.y).toBeGreaterThanOrEqual(rects.board.y + rects.board.h)
    expect(rects.remaining.y).toBeGreaterThanOrEqual(rects.board.y + rects.board.h)
  })

  it('容器过小抛 RangeError', () => {
    expect(() => computeLayout(200, 150)).toThrow(RangeError)
  })
})

describe('boardContentRect（contain 适配）', () => {
  it('方图在宽板：高受限、水平居中', () => {
    const plan = makePlan(90, 90, [0, 30, 60, 90], [0, 30, 60, 90])
    const board = { x: 100, y: 0, w: 600, h: 300 }
    const c = boardContentRect(board, plan)
    expect(c.h).toBeCloseTo(300)
    expect(c.w).toBeCloseTo(300)
    expect(c.x).toBeCloseTo(250) // 居中
    expect(c.y).toBeCloseTo(0)
  })
})

describe('slotRect（非均匀网格映射）', () => {
  const plan = makePlan(100, 90, [0, 30, 60, 90], [0, 25, 50, 75, 100])
  const content = { x: 0, y: 0, w: 200, h: 180 }

  it('槽位矩形按切割线比例映射（colLines[1]=25 → x=50）', () => {
    const r = slotRect(content, plan, 0, 1)
    expect(r.x).toBeCloseTo(50)
    expect(r.w).toBeCloseTo(50) // 25→50 段宽 25% × 200
    expect(r.y).toBeCloseTo(0)
    expect(r.h).toBeCloseTo(60) // 30/90 × 180
  })
})

describe('pointInRect', () => {
  const rect = { x: 10, y: 10, w: 100, h: 50 }

  it('含边界；inflate 扩大热区', () => {
    expect(pointInRect(10, 10, rect)).toBe(true)
    expect(pointInRect(110, 60, rect)).toBe(true)
    expect(pointInRect(111, 10, rect)).toBe(false)
    expect(pointInRect(5, 10, rect, 6)).toBe(true)
  })
})

describe('hitTestSlot（网格级吸附命中）', () => {
  const plan = makePlan(100, 90, [0, 30, 60, 90], [0, 25, 50, 75, 100])
  const board = { x: 0, y: 0, w: 200, h: 180 } // 恰好 contain（100:90 = 200:180）

  it('各槽中心点命中对应行列', () => {
    expect(hitTestSlot(25, 15, board, plan)).toEqual({ row: 0, col: 0 })
    expect(hitTestSlot(75, 45, board, plan)).toEqual({ row: 0, col: 1 })
    expect(hitTestSlot(25, 75, board, plan)).toEqual({ row: 1, col: 0 })
    expect(hitTestSlot(175, 165, board, plan)).toEqual({ row: 2, col: 3 })
  })

  it('拼图区外返回 null', () => {
    expect(hitTestSlot(-5, 10, board, plan)).toBeNull()
    expect(hitTestSlot(250, 10, board, plan)).toBeNull()
  })

  it('末边界坐标钳到最后一段', () => {
    expect(hitTestSlot(199.9, 179.9, board, plan)).toEqual({ row: 2, col: 3 })
  })
})
