// 非均匀网格：梯度/颜色方差分析 → 按内容量等分切割（技术架构 §11.6）
// 语义：细节丰富区段短（块小、多切），平坦同色区段长（块大、少切）；
//       切割线位置在容差内吸附到低梯度行/列（避免切断强边缘）。

import type { ImageDataLike } from './types'

/** 像素亮度（Rec.601 加权） */
export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * 行/列平均梯度剖面：
 * rowGrad[y] = 第 y 行与第 y-1 行对应像素亮度差绝对值的均值（y=0 为 0）
 * colGrad[x] 同理（列方向）。纯逻辑，无 DOM。
 */
export function gradientProfile(
  image: ImageDataLike,
): { rowGrad: Float64Array; colGrad: Float64Array } {
  const { width: w, height: h, data } = image
  const rowGrad = new Float64Array(h)
  const colGrad = new Float64Array(w)

  for (let y = 1; y < h; y++) {
    let sum = 0
    for (let x = 0; x < w; x++) {
      const prev = (y - 1) * w + x
      const cur = y * w + x
      sum += Math.abs(
        luma(data[prev * 4], data[prev * 4 + 1], data[prev * 4 + 2]) -
          luma(data[cur * 4], data[cur * 4 + 1], data[cur * 4 + 2]),
      )
    }
    rowGrad[y] = sum / w
  }
  for (let x = 1; x < w; x++) {
    let sum = 0
    for (let y = 0; y < h; y++) {
      const prev = y * w + (x - 1)
      const cur = y * w + x
      sum += Math.abs(
        luma(data[prev * 4], data[prev * 4 + 1], data[prev * 4 + 2]) -
          luma(data[cur * 4], data[cur * 4 + 1], data[cur * 4 + 2]),
      )
    }
    colGrad[x] = sum / h
  }
  return { rowGrad, colGrad }
}

/**
 * 单轴切割线计算（含首尾边界）。
 * 步骤：①梯度累计等分（每段内容量≈相等 → 细节区段短、平坦区段长）
 *      ②每条内部线在 ±tolerance 内吸附到梯度局部最小（沿平坦处切）
 *      ③均匀微差吸附：距理想均匀位偏差 ≤ 平均段长 10% 的线吸附到均匀位
 *        （微差肉眼难辨，与其留不齐的缝不如切齐；显著偏差是内容驱动的有意设计，保留）
 *      ④最小段长钳制（≥ 平均段长的 40%，防极端细条）
 * 纯色图（总梯度为 0）回退像素等分。
 */
export function buildAxisLines(
  grad: Float64Array,
  size: number,
  count: number,
  tolerance: number,
): number[] {
  if (count < 2) throw new RangeError(`jigsaw-cutter: 段数需 ≥ 2，收到 ${count}`)
  if (size <= count) throw new RangeError(`jigsaw-cutter: 尺寸 ${size} 不足以切 ${count} 段`)

  const cum = new Float64Array(size + 1)
  for (let i = 0; i < size; i++) cum[i + 1] = cum[i] + grad[i]
  const total = cum[size]

  const bounds: number[] = [0]
  if (total <= 0) {
    // 纯色图：内容量等分退化为像素等分，且无低梯度可吸附 → 直接返回
    for (let k = 1; k < count; k++) bounds.push(Math.round((size * k) / count))
    bounds.push(size)
    return bounds
  }
  for (let k = 1; k < count; k++) {
    const quota = (total * k) / count
    let i = 0
    while (i < size && cum[i] < quota) i++
    bounds.push(i)
  }
  bounds.push(size)

  // ② 内部线吸附低梯度局部最小
  const minSeg = Math.max(1, Math.round((size / count) * 0.4))
  for (let k = 1; k < bounds.length - 1; k++) {
    const lo = Math.max(bounds[k - 1] + minSeg, bounds[k] - tolerance)
    const hi = Math.min(bounds[k + 1] - minSeg, bounds[k] + tolerance)
    let best = bounds[k]
    let bestVal = Infinity
    for (let i = lo; i <= hi; i++) {
      // 探测窗口均值，避免吸附到单像素噪声
      const win = Math.max(0, i - 1)
      const v = (grad[i] + grad[win]) / 2
      if (v < bestVal) {
        bestVal = v
        best = i
      }
    }
    bounds[k] = best
  }

  // ③ 均匀微差吸附（验收返工：切块均匀观感）：偏差在带内的线吸附后仍需满足
  // 与两侧线的最小段长（40% 平均段），否则放弃本次吸附（避免挤出新细条）。
  const snapBand = (size / count) * 0.1
  for (let k = 1; k < bounds.length - 1; k++) {
    const ideal = Math.round((size * k) / count)
    if (Math.abs(bounds[k] - ideal) > snapBand) continue
    if (ideal - bounds[k - 1] < minSeg || bounds[k + 1] - ideal < minSeg) continue
    bounds[k] = ideal
  }

  // ④ 单调性修复（吸附后保证严格递增）
  for (let k = 1; k < bounds.length; k++) {
    if (bounds[k] <= bounds[k - 1]) bounds[k] = bounds[k - 1] + 1
  }
  if (bounds[bounds.length - 1] !== size) bounds[bounds.length - 1] = size
  return bounds
}
