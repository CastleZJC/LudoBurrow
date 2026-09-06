// 拼图五区布局与命中判定（纯函数，无 Canvas/DOM 依赖，技术架构 §11.1 / M3.4 坐标纯函数化）
// 五区三列式（v1.0 验收返工）：左列（上效果图 + 下暂存区）| 中列拼图区（网格底座+吸附，全高）| 右列（上当前块 + 下剩余块）
// 验收返工二轮（布局零失真）：图/块缩略统一走 fitRectAspect 等比 contain，不再拉伸变形。

import type { CutPlan } from '@/engines/jigsaw-cutter'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ZoneRects {
  /** 左列上段：效果图（完成参考） */
  preview: Rect
  /** 中列：拼图区（网格底座，全高） */
  board: Rect
  /** 左列下段：暂存区 */
  staging: Rect
  /** 右列上段：当前块位 */
  current: Rect
  /** 右列下段：剩余块缩略列表 */
  remaining: Rect
}

const PAD = 10

/**
 * 五区布局（容器逻辑尺寸 → 各区矩形；三列式，v1.0 验收返工）。
 * 左右列同宽 = 容器 24%（180-300px）；左列上/下按 55%/45% 分（参考图略大），右列同高对齐；
 * 中列拼图区占余宽全高（同顶同底）。
 */
export function computeLayout(width: number, height: number): ZoneRects {
  if (width < 320 || height < 240) throw new RangeError(`jigsaw: 容器尺寸不足 (${width}×${height})`)
  const sideW = Math.min(300, Math.max(180, Math.round(width * 0.24)))
  const innerH = height - PAD * 2
  const upperH = Math.round(innerH * 0.55)

  const preview = { x: PAD, y: PAD, w: sideW - PAD * 2, h: upperH }
  const staging = { x: PAD, y: PAD + upperH + PAD, w: sideW - PAD * 2, h: innerH - upperH - PAD }
  const board = { x: sideW + PAD, y: PAD, w: width - sideW * 2 - PAD * 3, h: innerH }
  const current = { x: width - sideW + PAD, y: PAD, w: sideW - PAD * 2, h: upperH }
  const remaining = { x: width - sideW + PAD, y: staging.y, w: sideW - PAD * 2, h: staging.h }
  return { preview, board, staging, current, remaining }
}

/** 等比适配（contain）：内容按宽高比缩放至盒内最大并居中（图/块缩略零失真的统一口径） */
export function fitRectAspect(box: Rect, contentW: number, contentH: number): Rect {
  if (contentW <= 0 || contentH <= 0) return { x: box.x, y: box.y, w: 0, h: 0 }
  const k = Math.min(box.w / contentW, box.h / contentH)
  const w = contentW * k
  const h = contentH * k
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

/** 拼图区内容矩形：源图按宽高比 contain 适配后的实际网格区域 */
export function boardContentRect(board: Rect, plan: CutPlan): Rect {
  return fitRectAspect(board, plan.width, plan.height)
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
