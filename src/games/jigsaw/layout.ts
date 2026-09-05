// 拼图五区布局与命中判定（纯函数，无 Canvas/DOM 依赖，技术架构 §11.1 / M3.4 坐标纯函数化）
// 五区：左上效果图 | 中间拼图区（网格底座+吸附）| 左下暂存区 | 右上当前块 | 右下剩余块
// 拼图区按源图宽高比 contain 适配；非均匀网格（rowLines/colLines 不等距）按比例映射到屏幕槽位。

import type { CutPlan } from '@/engines/jigsaw-cutter'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ZoneRects {
  /** 左上：效果图（完成参考） */
  preview: Rect
  /** 中间：拼图区（网格底座） */
  board: Rect
  /** 左下：暂存区 */
  staging: Rect
  /** 底条左段：当前块位 */
  current: Rect
  /** 底条右段：剩余块缩略列表 */
  remaining: Rect
}

const PAD = 10

/**
 * 五区布局（容器逻辑尺寸 → 各区矩形）。
 * 左列宽 = 容器 24%（180-300px）；底条高 = 容器 20%（96-160px）。
 */
export function computeLayout(width: number, height: number): ZoneRects {
  if (width < 320 || height < 240) throw new RangeError(`jigsaw: 容器尺寸不足 (${width}×${height})`)
  const leftW = Math.min(300, Math.max(180, Math.round(width * 0.24)))
  const bottomH = Math.min(160, Math.max(96, Math.round(height * 0.2)))
  const upperH = height - bottomH - PAD * 3

  const preview = { x: PAD, y: PAD, w: leftW - PAD * 2, h: Math.round(upperH * 0.55) }
  const staging = { x: PAD, y: preview.y + preview.h + PAD, w: leftW - PAD * 2, h: upperH - preview.h - PAD }
  const board = { x: leftW + PAD, y: PAD, w: width - leftW - PAD * 2, h: upperH }
  const current = { x: PAD, y: height - bottomH + PAD, w: leftW - PAD * 2, h: bottomH - PAD * 2 }
  const remaining = { x: leftW + PAD, y: height - bottomH + PAD, w: width - leftW - PAD * 2, h: bottomH - PAD * 2 }
  return { preview, board, staging, current, remaining }
}

/** 拼图区内容矩形：源图按宽高比 contain 适配后的实际网格区域 */
export function boardContentRect(board: Rect, plan: CutPlan): Rect {
  const scale = Math.min(board.w / plan.width, board.h / plan.height)
  const w = plan.width * scale
  const h = plan.height * scale
  return { x: board.x + (board.w - w) / 2, y: board.y + (board.h - h) / 2, w, h }
}

/** 槽位（row, col）的屏幕矩形：非均匀网格按切割线比例映射 */
export function slotRect(content: Rect, plan: CutPlan, row: number, col: number): Rect {
  const x0 = content.x + (plan.colLines[col] / plan.width) * content.w
  const y0 = content.y + (plan.rowLines[row] / plan.height) * content.h
  const x1 = content.x + (plan.colLines[col + 1] / plan.width) * content.w
  const y1 = content.y + (plan.rowLines[row + 1] / plan.height) * content.h
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function pointInRect(px: number, py: number, rect: Rect, inflate = 0): boolean {
  return (
    px >= rect.x - inflate && px <= rect.x + rect.w + inflate &&
    py >= rect.y - inflate && py <= rect.y + rect.h + inflate
  )
}

/**
 * 吸附命中（M3.4 网格级校准）：屏幕坐标 → 最近槽位。
 * 返回 null = 指针不在拼图区内（拖拽将回退/进暂存）。
 */
export function hitTestSlot(px: number, py: number, board: Rect, plan: CutPlan): { row: number; col: number } | null {
  const content = boardContentRect(board, plan)
  if (!pointInRect(px, py, content)) return null
  const fx = ((px - content.x) / content.w) * plan.width
  const fy = ((py - content.y) / content.h) * plan.height
  // 二分落点：找第一条 > fx 的列线 → 前一列
  let col = -1
  for (let c = 0; c < plan.params.cols; c++) {
    if (fx >= plan.colLines[c] && fx < plan.colLines[c + 1]) {
      col = c
      break
    }
  }
  let row = -1
  for (let r = 0; r < plan.params.rows; r++) {
    if (fy >= plan.rowLines[r] && fy < plan.rowLines[r + 1]) {
      row = r
      break
    }
  }
  // fx/fy 恰在末边界时循环可能落空（< 末线判定），钳到最后一段
  if (col < 0) col = plan.params.cols - 1
  if (row < 0) row = plan.params.rows - 1
  return { row, col }
}
