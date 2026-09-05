// 键盘游戏关卡生成单测（四模式分段 / 难度曲线 / 确定性 / 星级规则）
import { describe, it, expect } from 'vitest'
import { createKeygameLevel, calcKeygameStars } from '@/games/keygame/level'
import { WORDS_L8, PINYIN_BASIC, PINYIN_COMMON, PINYIN_EXT } from '@/engines/wordbank'
import { levelSeed } from '@/engines/rng'

describe('模式分段（50 关全覆盖）', () => {
  it.each([
    [1, 'full-random', 'full'],
    [13, 'full-random', 'full'],
    [14, 'compact-random', 'compact'],
    [25, 'compact-random', 'compact'],
    [26, 'english', 'full'],
    [38, 'english', 'full'],
    [39, 'pinyin', 'full'],
    [50, 'pinyin', 'full'],
  ] as const)('第 %i 关 = %s / %s', (n, mode, layout) => {
    const level = createKeygameLevel(n)
    expect(level.mode).toBe(mode)
    expect(level.layout).toBe(layout)
    expect(level.gameId).toBe('keygame')
    expect(level.n).toBe(n)
    expect(level.seed).toBe(levelSeed('keygame', n))
  })

  it('全 50 关模式分段正确', () => {
    for (let n = 1; n <= 50; n++) {
      const { mode } = createKeygameLevel(n)
      const expected =
        n <= 13 ? 'full-random' : n <= 25 ? 'compact-random' : n <= 38 ? 'english' : 'pinyin'
      expect(mode, `第 ${n} 关模式`).toBe(expected)
    }
  })

  it.each([0, 51, -1, 100])('非法关卡号 %i 抛 RangeError', (n) => {
    expect(() => createKeygameLevel(n)).toThrow(RangeError)
  })
})

describe('难度曲线边界与单调性', () => {
  it('大键盘线：第 1 关 3 字符、第 13 关 12 字符，中间单调不减', () => {
    const lengths = Array.from({ length: 13 }, (_, i) => createKeygameLevel(i + 1).sequence.length)
    expect(lengths[0]).toBe(3)
    expect(lengths[12]).toBe(12)
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1])
    }
  })

  it('小键盘线：第 14 关 6 字符、第 25 关 17 字符，中间单调不减', () => {
    const lengths = Array.from({ length: 12 }, (_, i) => createKeygameLevel(i + 14).sequence.length)
    expect(lengths[0]).toBe(6)
    expect(lengths[11]).toBe(17)
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1])
    }
  })

  it('英文线：第 26 关 3 词×3 字母、第 38 关 6 词×≥8 字母（长词表）', () => {
    const first = createKeygameLevel(26)
    expect(first.segments).toHaveLength(3)
    for (const seg of first.segments) expect(seg.chars.length).toBe(3)

    const last = createKeygameLevel(38)
    expect(last.segments).toHaveLength(6)
    for (const seg of last.segments) expect(seg.chars.length).toBeGreaterThanOrEqual(8)
  })

  it('英文线取词均来自对应词表（≥8 归 L8 验证）且关内不重复', () => {
    const level = createKeygameLevel(38)
    const words = level.segments.map((seg) => seg.chars.toLowerCase())
    expect(new Set(words).size).toBe(words.length)
    for (const word of words) expect(WORDS_L8).toContain(word)
  })

  it('拼音线：39-42 一级 / 43-46 二级 / 47-50 三级，词数 3→6', () => {
    for (const n of [39, 42, 43, 46, 47, 50]) {
      const level = createKeygameLevel(n)
      const grade = n < 43 ? 1 : n < 47 ? 2 : 3
      const table = grade === 1 ? PINYIN_BASIC : grade === 2 ? PINYIN_COMMON : PINYIN_EXT
      const words = level.segments.map((seg) => seg.hint)
      expect(new Set(words).size).toBe(words.length)
      for (const word of words) {
        expect(table.some((entry) => entry.word === word), `第 ${n} 关词 ${word} 应在等级 ${grade} 词表`).toBe(true)
      }
      for (const seg of level.segments) {
        expect(seg.chars).toMatch(/^[A-Z]+$/)
      }
    }
    expect(createKeygameLevel(39).segments).toHaveLength(3)
    expect(createKeygameLevel(50).segments).toHaveLength(6)
  })
})

describe('一致性与确定性', () => {
  it('sequence 与 segments 拼接一致（比对口径 = 展示口径）', () => {
    for (let n = 1; n <= 50; n++) {
      const level = createKeygameLevel(n)
      expect(level.sequence.join('')).toBe(level.segments.map((seg) => seg.chars).join(''))
    }
  })

  it('同一关卡重复生成内容恒定（确定性）', () => {
    for (const n of [1, 17, 30, 50]) {
      expect(createKeygameLevel(n)).toEqual(createKeygameLevel(n))
    }
  })

  it('相邻关卡内容不同（种子随关卡变化）', () => {
    expect(createKeygameLevel(1).sequence).not.toEqual(createKeygameLevel(2).sequence)
    expect(createKeygameLevel(26).segments).not.toEqual(createKeygameLevel(27).segments)
  })

  it('随机模式字符集限于大写字母与数字', () => {
    for (const n of [1, 5, 13, 14, 25]) {
      for (const ch of createKeygameLevel(n).sequence) expect(ch).toMatch(/^[A-Z0-9]$/)
    }
  })
})

describe('calcKeygameStars（星级规则）', () => {
  it.each([
    [0, 1, 3],
    [0, 10, 3],
    [1, 10, 2],
    [1, 19, 2],
    [2, 10, 1],
    [1, 3, 1],
    [3, 30, 2],
    [4, 30, 1],
    [5, 50, 2],
    [6, 50, 1],
  ] as const)('%i 失误 / 序列 %i → %i 星', (mistakes, total, stars) => {
    expect(calcKeygameStars(mistakes, total)).toBe(stars)
  })
})
