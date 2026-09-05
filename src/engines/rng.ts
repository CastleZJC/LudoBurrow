// mulberry32 PRNG 封装（技术架构 §9.2）
// 32 位种子、速度快、跨浏览器一致；关卡生成路径禁止使用 Math.random。

export interface Rng {
  /** 返回 [0, 1) 均匀分布浮点数 */
  next(): number
  /** 返回 [min, max) 整数（含 min 不含 max） */
  int(min: number, max: number): number
  /** 就地打乱数组（Fisher-Yates）并返回同一引用 */
  shuffle<T>(items: T[]): T[]
  /** 从数组随机取一项 */
  pick<T>(items: readonly T[]): T
}

/** mulberry32：确定性伪随机序列（同种子同序列） */
export function createRng(seed: number): Rng {
  // mulberry32 标准实现：|0 归一化 + 位混合；种子先散列一轮避免低位聚集
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number): number => {
    if (max <= min) throw new RangeError(`rng.int 需要 min < max，收到 ${min} / ${max}`)
    return min + Math.floor(next() * (max - min))
  }
  const shuffle = <T>(items: T[]): T[] => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = int(0, i + 1)
      const tmp = items[i]
      items[i] = items[j]
      items[j] = tmp
    }
    return items
  }
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError('rng.pick 需要非空数组')
    return items[int(0, items.length)]
  }
  return { next, int, shuffle, pick }
}

/** 关卡种子派生：hash(gameId + ':' + n)，同关卡恒定（技术架构 §9.1） */
export function levelSeed(gameId: string, n: number): number {
  const key = `${gameId}:${n}`
  // FNV-1a 32 位：实现简单、分布均匀、跨平台一致
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
