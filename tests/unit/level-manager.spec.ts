import { describe, it, expect, beforeEach } from 'vitest'
import {
  TOTAL_LEVELS, getUnlockedCount, isUnlocked,
  getLevelRecord, getLevelRecords, recordResult,
} from '@/core/level-manager'
import type { LevelResult } from '@/core/types'

function result(n: number, elapsedMs: number, stars: 1 | 2 | 3, mistakes = 0): LevelResult {
  return { gameId: 'keygame', n, elapsedMs, mistakes, stars }
}

describe('level-manager', () => {
  beforeEach(() => localStorage.clear())

  it('初始仅第 1 关解锁', () => {
    expect(getUnlockedCount('keygame')).toBe(1)
    expect(isUnlocked('keygame', 1)).toBe(true)
    expect(isUnlocked('keygame', 2)).toBe(false)
  })

  it('通过第 n 关解锁第 n+1 关', () => {
    recordResult('keygame', result(1, 10_000, 3))
    expect(getUnlockedCount('keygame')).toBe(2)
    expect(isUnlocked('keygame', 2)).toBe(true)
    expect(isUnlocked('keygame', 3)).toBe(false)
  })

  it('重玩已过关不降低解锁数（重复过关幂等）', () => {
    recordResult('keygame', result(1, 10_000, 3))
    recordResult('keygame', result(1, 12_000, 2))
    expect(getUnlockedCount('keygame')).toBe(2)
  })

  it('第 50 关过关后解锁数封顶 50', () => {
    recordResult('keygame', result(50, 60_000, 3))
    expect(getUnlockedCount('keygame')).toBe(TOTAL_LEVELS)
  })

  it('星级取高保留', () => {
    recordResult('keygame', result(1, 10_000, 1))
    recordResult('keygame', result(1, 20_000, 3))
    expect(getLevelRecord('keygame', 1)?.stars).toBe(3)
    recordResult('keygame', result(1, 30_000, 2))
    expect(getLevelRecord('keygame', 1)?.stars).toBe(3)
  })

  it('最佳用时与最少失误取低保留', () => {
    recordResult('keygame', result(1, 10_000, 3, 5))
    recordResult('keygame', result(1, 8_000, 2, 7))
    const rec = getLevelRecord('keygame', 1)
    expect(rec?.bestMs).toBe(8_000)
    expect(rec?.bestMistakes).toBe(5)
  })

  it('不同游戏进度互不影响', () => {
    recordResult('keygame', result(1, 10_000, 3))
    expect(getUnlockedCount('maze')).toBe(1)
    expect(getLevelRecords('maze')).toEqual({})
  })

  it('非法关卡号（0 或负数）不解锁异常进度', () => {
    recordResult('keygame', result(0, 1000, 3))
    expect(getUnlockedCount('keygame')).toBe(1)
    expect(isUnlocked('keygame', 0)).toBe(false)
  })
})
