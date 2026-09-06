import { describe, it, expect, beforeEach } from 'vitest'
import {
  TOTAL_LEVELS, getUnlockedCount, isUnlocked,
  getLevelRecord, getLevelRecords, recordResult, progressSlotKey,
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
    expect(getLevelRecord('keygame', '1')?.stars).toBe(3)
    recordResult('keygame', result(1, 30_000, 2))
    expect(getLevelRecord('keygame', '1')?.stars).toBe(3)
  })

  it('最佳用时与最少失误取低保留', () => {
    recordResult('keygame', result(1, 10_000, 3, 5))
    recordResult('keygame', result(1, 8_000, 2, 7))
    const rec = getLevelRecord('keygame', '1')
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

describe('progressSlotKey（多轨进度槽键）', () => {
  it('单轨（无 track）= gameId', () => {
    expect(progressSlotKey('maze')).toBe('maze')
    expect(progressSlotKey('keygame', undefined)).toBe('keygame')
  })

  it('多轨（有 track）= gameId:track', () => {
    expect(progressSlotKey('keygame', 'pinyin')).toBe('keygame:pinyin')
    expect(progressSlotKey('keygame', 'full-random')).toBe('keygame:full-random')
  })
})

describe('多轨独立进度（键盘四模式各一条轨）', () => {
  beforeEach(() => localStorage.clear())

  it('各模式轨独立解锁/星级，互不影响', () => {
    const full = progressSlotKey('keygame', 'full-random')
    const pinyin = progressSlotKey('keygame', 'pinyin')
    recordResult(full, { gameId: 'keygame', n: 1, elapsedMs: 9_000, mistakes: 0, stars: 3 })
    recordResult(full, { gameId: 'keygame', n: 2, elapsedMs: 9_000, mistakes: 0, stars: 3 })
    expect(getUnlockedCount(full)).toBe(3)
    expect(getLevelRecord(full, '2')?.stars).toBe(3)
    // 拼音轨未动：仍仅第 1 关解锁、无成绩
    expect(getUnlockedCount(pinyin)).toBe(1)
    expect(getLevelRecords(pinyin)).toEqual({})
  })
})

describe('动态总数与记录键（拼图「方案 = 关卡」轨道）', () => {
  beforeEach(() => localStorage.clear())

  it('total 参数：解锁封顶动态总数（如专题 6 关），读取时收敛高于总数的存量解锁数', () => {
    const slot = progressSlotKey('jigsaw', 'animals')
    recordResult(slot, { gameId: 'jigsaw', n: 6, elapsedMs: 60_000, mistakes: 0, stars: 3 }, { total: 6 })
    expect(getUnlockedCount(slot, 6)).toBe(6) // 封顶 6 而非 50
    // 方案被删后总数收敛为 4：存量解锁数 6 读取时收敛，不回写
    expect(getUnlockedCount(slot, 4)).toBe(4)
    expect(isUnlocked(slot, 5, 4)).toBe(false)
  })

  it('recordKey 参数：成绩按方案 id 记（与关卡号键互不干扰），解锁推进照常', () => {
    const slot = progressSlotKey('jigsaw', 'animals')
    recordResult(slot, { gameId: 'jigsaw', n: 1, elapsedMs: 60_000, mistakes: 0, stars: 3 }, { total: 6, recordKey: 'bs-animals-01' })
    expect(getLevelRecord(slot, 'bs-animals-01')?.stars).toBe(3)
    expect(getLevelRecord(slot, '1')).toBeUndefined() // 未写关卡号键
    expect(getUnlockedCount(slot, 6)).toBe(2)
  })

  it('recordKey 缺省 = 关卡号（固定曲线游戏行为不变）', () => {
    recordResult('maze', { gameId: 'maze', n: 3, elapsedMs: 30_000, mistakes: 0, stars: 2 })
    expect(getLevelRecord('maze', '3')?.stars).toBe(2)
  })
})
