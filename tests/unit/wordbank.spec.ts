// 词库引擎单测（测试规范 §3.3 必测：确定性生成 + 词表完整性 + 边界）
import { describe, it, expect } from 'vitest'
import { createRng } from '@/engines/rng'
import {
  WORDS_L3,
  WORDS_L4,
  WORDS_L5,
  WORDS_L6,
  WORDS_L7,
  WORDS_L8,
  PINYIN_BASIC,
  PINYIN_COMMON,
  PINYIN_EXT,
  getWordsByLength,
  getPinyinByGrade,
  pinyinToSequence,
  randomCharSequence,
} from '@/engines/wordbank'

const ENGLISH_TABLES: ReadonlyArray<{ name: string; len: number; table: readonly string[] }> = [
  { name: 'L3', len: 3, table: WORDS_L3 },
  { name: 'L4', len: 4, table: WORDS_L4 },
  { name: 'L5', len: 5, table: WORDS_L5 },
  { name: 'L6', len: 6, table: WORDS_L6 },
  { name: 'L7', len: 7, table: WORDS_L7 },
  { name: 'L8', len: 8, table: WORDS_L8 },
]

describe('英文分级词表完整性', () => {
  it.each(ENGLISH_TABLES)('$name 每表 30 词、全小写纯字母、无重复、词长符合分级', ({ len, table }) => {
    expect(table).toHaveLength(30)
    for (const word of table) {
      expect(word).toMatch(/^[a-z]+$/)
      expect(word.length).toBeGreaterThanOrEqual(len)
      if (len < 8) expect(word.length, `词 ${word} 应为 ${len} 字母`).toBe(len)
    }
    expect(new Set(table).size).toBe(table.length)
  })

  it('六张表之间无跨表重复词', () => {
    const all = ENGLISH_TABLES.flatMap(({ table }) => table)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('getWordsByLength', () => {
  it.each([
    [3, WORDS_L3],
    [4, WORDS_L4],
    [5, WORDS_L5],
    [6, WORDS_L6],
    [7, WORDS_L7],
  ] as const)('词长 %i 精确映射对应表', (len, table) => {
    expect(getWordsByLength(len)).toBe(table)
  })

  it.each([8, 9, 12, 100])('词长 %i（≥8）归长词表 L8', (len) => {
    expect(getWordsByLength(len)).toBe(WORDS_L8)
  })

  it.each([0, 1, 2, -3])('非法词长 %i 抛 RangeError', (len) => {
    expect(() => getWordsByLength(len)).toThrow(RangeError)
  })
})

describe('拼音词表', () => {
  it('三级词表规模：24 / 24 / 20', () => {
    expect(PINYIN_BASIC).toHaveLength(24)
    expect(PINYIN_COMMON).toHaveLength(24)
    expect(PINYIN_EXT).toHaveLength(20)
  })

  it('拼音串为小写字母 + 单空格分隔音节，音节非空', () => {
    for (const entry of [...PINYIN_BASIC, ...PINYIN_COMMON, ...PINYIN_EXT]) {
      expect(entry.pinyin).toMatch(/^[a-z]+( [a-z]+)*$/)
      for (const syllable of entry.pinyin.split(' ')) {
        expect(syllable.length).toBeGreaterThan(0)
      }
    }
  })

  it('三级内汉字词不重复', () => {
    const words = [...PINYIN_BASIC, ...PINYIN_COMMON, ...PINYIN_EXT].map((e) => e.word)
    expect(new Set(words).size).toBe(words.length)
  })

  it('分级边界：一级全部单字、二级全部双字词、三级三字及以上', () => {
    for (const e of PINYIN_BASIC) expect(e.word).toHaveLength(1)
    for (const e of PINYIN_COMMON) expect(e.word).toHaveLength(2)
    for (const e of PINYIN_EXT) expect(e.word.length).toBeGreaterThanOrEqual(3)
  })
})

describe('getPinyinByGrade', () => {
  it.each([
    [1, PINYIN_BASIC],
    [2, PINYIN_COMMON],
    [3, PINYIN_EXT],
  ] as const)('等级 %i 精确映射对应表', (grade, table) => {
    expect(getPinyinByGrade(grade)).toBe(table)
  })
})

describe('pinyinToSequence', () => {
  it('去空格 + 转大写 + 拆单字符', () => {
    expect(pinyinToSequence({ word: '学校', pinyin: 'xue xiao' })).toEqual([
      'X', 'U', 'E', 'X', 'I', 'A', 'O',
    ])
  })

  it('多空格容忍', () => {
    expect(pinyinToSequence({ word: '大树', pinyin: 'da  shu' })).toEqual(['D', 'A', 'S', 'H', 'U'])
  })

  it('单音节', () => {
    expect(pinyinToSequence({ word: '大', pinyin: 'da' })).toEqual(['D', 'A'])
  })
})

describe('randomCharSequence（确定性）', () => {
  it('指定长度生成，字符集限于大写字母与数字', () => {
    const rng = createRng(7)
    for (const len of [1, 3, 12, 17]) {
      const seq = randomCharSequence(rng, len)
      expect(seq).toHaveLength(len)
      for (const ch of seq) expect(ch).toMatch(/^[A-Z0-9]$/)
    }
  })

  it('同种子同序列（确定性核心）', () => {
    expect(randomCharSequence(createRng(42), 10)).toEqual(randomCharSequence(createRng(42), 10))
  })

  it('不同种子序列不同', () => {
    expect(randomCharSequence(createRng(1), 17)).not.toEqual(randomCharSequence(createRng(2), 17))
  })

  it('avoidRepeat（默认开）无相邻重复字符', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const seq = randomCharSequence(createRng(seed), 30)
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i]).not.toBe(seq[i - 1])
      }
    }
  })

  it('avoidRepeat 关闭时仍可正常生成', () => {
    const seq = randomCharSequence(createRng(9), 5, { avoidRepeat: false, digitRatio: 0 })
    expect(seq).toHaveLength(5)
  })

  it('digitRatio 0 → 全字母；1 → 全数字', () => {
    const letters = randomCharSequence(createRng(5), 20, { digitRatio: 0 })
    expect(letters.every((ch) => ch >= 'A' && ch <= 'Z')).toBe(true)
    const digits = randomCharSequence(createRng(5), 20, { digitRatio: 1 })
    expect(digits.every((ch) => ch >= '0' && ch <= '9')).toBe(true)
  })

  it.each([0, -1])('非法长度 %i 抛 RangeError', (len) => {
    expect(() => randomCharSequence(createRng(1), len)).toThrow(RangeError)
  })
})
