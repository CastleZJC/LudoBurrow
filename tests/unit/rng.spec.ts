import { describe, it, expect } from 'vitest'
import { createRng, levelSeed } from '@/engines/rng'

describe('rng', () => {
  it('同种子生成完全相同的序列', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('不同种子生成不同序列', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })

  it('next 输出落在 [0, 1) 区间', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('跨调用独立：两个 rng 互不干扰', () => {
    const a = createRng(100)
    const b = createRng(100)
    a.next()
    a.next()
    // b 未被消费，首个值应等于 a 的首个值
    const bFirst = b.next()
    const aFresh = createRng(100).next()
    expect(bFirst).toBe(aFresh)
  })

  it('int 输出落在 [min, max) 且覆盖可达', () => {
    const rng = createRng(9)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) {
      const v = rng.int(3, 6)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThan(6)
      expect(Number.isInteger(v)).toBe(true)
      seen.add(v)
    }
    expect(seen.has(3) && seen.has(4) && seen.has(5)).toBe(true)
  })

  it('int 在 min >= max 时抛错（编程错误）', () => {
    const rng = createRng(1)
    expect(() => rng.int(5, 5)).toThrow(RangeError)
  })

  it('shuffle 保持元素集合不变且同种子结果一致', () => {
    const a = createRng(11)
    const b = createRng(11)
    const source = [1, 2, 3, 4, 5, 6, 7, 8]
    const shuffledA = a.shuffle([...source])
    const shuffledB = b.shuffle([...source])
    expect(shuffledA).toEqual(shuffledB)
    expect([...shuffledA].sort((x, y) => x - y)).toEqual(source)
  })

  it('pick 从数组取有效元素，空数组抛错', () => {
    const rng = createRng(13)
    expect([1, 2, 3]).toContain(rng.pick([1, 2, 3]))
    expect(() => rng.pick([])).toThrow(RangeError)
  })
})

describe('levelSeed', () => {
  it('同 gameId 同关卡号派生相同种子', () => {
    expect(levelSeed('jigsaw', 37)).toBe(levelSeed('jigsaw', 37))
  })

  it('不同游戏或不同关卡派生不同种子', () => {
    expect(levelSeed('jigsaw', 1)).not.toBe(levelSeed('maze', 1))
    expect(levelSeed('jigsaw', 1)).not.toBe(levelSeed('jigsaw', 2))
  })

  it('种子为 32 位无符号整数', () => {
    const seed = levelSeed('keygame', 50)
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThanOrEqual(0xffffffff)
    expect(Number.isInteger(seed)).toBe(true)
  })
})
