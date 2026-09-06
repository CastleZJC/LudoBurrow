// 均匀网格（技术架构 §11.6，v1.0 验收返工二轮口径）：
// 切割线恒均匀等分——内容分析（色彩/线条区分度）仅用于选块数（rows×cols，见 games/jigsaw/optimize.ts），
// 不再影响线位；块间区分度不足时由唯一性闭环的形状强化兜底（锯齿加深，uniqueness.ts）。

/** 像素亮度（Rec.601 加权；uniqueness.ts 块评分用） */
export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * 单轴均匀切割线（含首尾边界）：第 k 条内部线 = round(size × k / count)。
 * 约束 size > count 保证相邻线间距 > 1 → round 后严格递增。
 */
export function buildAxisLines(size: number, count: number): number[] {
  if (count < 2) throw new RangeError(`jigsaw-cutter: 段数需 ≥ 2，收到 ${count}`)
  if (size <= count) throw new RangeError(`jigsaw-cutter: 尺寸 ${size} 不足以切 ${count} 段`)
  const bounds: number[] = [0]
  for (let k = 1; k < count; k++) bounds.push(Math.round((size * k) / count))
  bounds.push(size)
  return bounds
}
