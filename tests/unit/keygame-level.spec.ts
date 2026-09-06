// 键盘游戏关卡生成单测（方案 B：四模式各自独立 1-50 曲线 / 确定性 / 星级规则）
import { describe, it, expect } from 'vitest'
import {
  createKeygameLevel,
  calcKeygameStars,
  KEYGAME_MODES,
  layoutOfMode,
  isKeygameMode,
  type KeygameMode,
} from '@/games/keygame/level'
import { WORDS_L3, WORDS_L8, PINYIN_BASIC, PINYIN_COMMON, PINYIN_EXT, getPinyinByGrade } from '@/engines/wordbank'
import { levelSeed } from '@/engines/rng'

describe('模式与进度轨（方案 B：每模式独立 1-50 曲线）', () => {
  it.each([...KEYGAME_MODES] as KeygameMode[])('%s 模式：layout/track/seed 正确', (mode) => {
    const level = createKeygameLevel(1, mode)
    expect(level.mode).toBe(mode)
    expect(level.layout).toBe(layoutOfMode(mode))
    expect(level.track).toBe(mode)
    expect(level.gameId).toBe('keygame')
    expect(level.n).toBe(1)
    expect(level.seed).toBe(levelSeed(`keygame:${mode}`, 1))
  })

  it('紧凑键盘模式用 compact 布局，其余用 full', () => {
    expect(layoutOfMode('compact-random')).toBe('compact')
    for (const mode of ['full-random', 'english', 'pinyin'] as KeygameMode[]) {
      expect(createKeygameLevel(5, mode).layout).toBe('full')
    }
  })

  it('缺省模式为全键盘（createLevel(n) 向后兼容）', () => {
    expect(createKeygameLevel(7).mode).toBe('full-random')
  })

  it('同关卡号不同模式内容/种子不同（独立曲线）', () => {
    const a = createKeygameLevel(10, 'full-random')
    const b = createKeygameLevel(10, 'compact-random')
    expect(a.seed).not.toBe(b.seed)
    expect(a.sequence).not.toEqual(b.sequence)
  })

  it.each([0, 51, -1, 100])('非法关卡号 %i 抛 RangeError', (n) => {
    expect(() => createKeygameLevel(n, 'english')).toThrow(RangeError)
  })

  it('非法模式抛 RangeError；isKeygameMode 守卫正确', () => {
    expect(() => createKeygameLevel(1, 'bogus' as KeygameMode)).toThrow(RangeError)
    expect(isKeygameMode('pinyin')).toBe(true)
    expect(isKeygameMode('nope')).toBe(false)
  })
})

describe('难度曲线边界与单调性（每模式跨 1-50）', () => {
  it('全键盘线：第 1 关 3 字符、第 50 关 16 字符，单调不减', () => {
    const lengths = Array.from({ length: 50 }, (_, i) => createKeygameLevel(i + 1, 'full-random').sequence.length)
    expect(lengths[0]).toBe(3)
    expect(lengths[49]).toBe(16)
    for (let i = 1; i < lengths.length; i++) expect(lengths[i]!).toBeGreaterThanOrEqual(lengths[i - 1]!)
  })

  it('紧凑键盘线：第 1 关 6 字符、第 50 关 20 字符，单调不减', () => {
    const lengths = Array.from({ length: 50 }, (_, i) => createKeygameLevel(i + 1, 'compact-random').sequence.length)
    expect(lengths[0]).toBe(6)
    expect(lengths[49]).toBe(20)
    for (let i = 1; i < lengths.length; i++) expect(lengths[i]!).toBeGreaterThanOrEqual(lengths[i - 1]!)
  })

  it('英文线：第 1 关 3 词×3 字母、第 50 关 8 词×≥8 字母（长词表）', () => {
    const first = createKeygameLevel(1, 'english')
    expect(first.segments).toHaveLength(3)
    for (const seg of first.segments) expect(seg.chars.length).toBe(3)

    const last = createKeygameLevel(50, 'english')
    expect(last.segments).toHaveLength(8)
    for (const seg of last.segments) expect(seg.chars.length).toBeGreaterThanOrEqual(8)
  })

  it('英文线取词均来自对应词表（≥8 归 L8 验证）且关内不重复', () => {
    const level = createKeygameLevel(50, 'english')
    const words = level.segments.map((seg) => seg.chars.toLowerCase())
    expect(new Set(words).size).toBe(words.length)
    for (const word of words) expect(WORDS_L8).toContain(word)
  })

  it('拼音线：1-17 一级 / 18-34 二级 / 35-50 三级，词数 3→8', () => {
    for (const n of [1, 17, 18, 34, 35, 50]) {
      const level = createKeygameLevel(n, 'pinyin')
      const grade = n <= 17 ? 1 : n <= 34 ? 2 : 3
      const table = grade === 1 ? PINYIN_BASIC : grade === 2 ? PINYIN_COMMON : PINYIN_EXT
      const words = level.segments.map((seg) => seg.hint)
      expect(new Set(words).size).toBe(words.length)
      for (const word of words) {
        expect(table.some((entry) => entry.word === word), `第 ${n} 关词 ${word} 应在等级 ${grade} 词表`).toBe(true)
      }
      for (const seg of level.segments) expect(seg.chars).toMatch(/^[A-Z]+$/)
    }
    expect(createKeygameLevel(1, 'pinyin').segments).toHaveLength(3)
    expect(createKeygameLevel(50, 'pinyin').segments).toHaveLength(8)
  })
})

describe('一致性与确定性', () => {
  it('sequence 与 segments 拼接一致（所有模式全 50 关）', () => {
    for (const mode of KEYGAME_MODES) {
      for (let n = 1; n <= 50; n++) {
        const level = createKeygameLevel(n, mode)
        expect(level.sequence.join('')).toBe(level.segments.map((seg) => seg.chars).join(''))
      }
    }
  })

  it('同(模式,关卡)重复生成内容恒定（确定性）', () => {
    for (const mode of KEYGAME_MODES) {
      for (const n of [1, 17, 30, 50]) {
        expect(createKeygameLevel(n, mode)).toEqual(createKeygameLevel(n, mode))
      }
    }
  })

  it('相邻关卡内容不同（种子随关卡变化）', () => {
    expect(createKeygameLevel(1, 'full-random').sequence).not.toEqual(createKeygameLevel(2, 'full-random').sequence)
    expect(createKeygameLevel(26, 'english').segments).not.toEqual(createKeygameLevel(27, 'english').segments)
  })

  it('随机模式字符集限于大写字母与数字', () => {
    for (const mode of ['full-random', 'compact-random'] as KeygameMode[]) {
      for (const n of [1, 5, 25, 50]) {
        for (const ch of createKeygameLevel(n, mode).sequence) expect(ch).toMatch(/^[A-Z0-9]$/)
      }
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

describe('自定义词表消费（设置页词表配置 → 关卡生成，经 services wordbankRepo 供源）', () => {
  it('english：自定义词长桶替换默认词表，同配置同关卡内容恒定', () => {
    const wb = { english: { '3': ['fox', 'owl', 'bee', 'ant', 'hen', 'yak', 'imp', 'elf', 'gnu', 'ram'] } }
    const a = createKeygameLevel(1, 'english', wb)
    const b = createKeygameLevel(1, 'english', wb)
    expect(a.segments).toEqual(b.segments)
    expect(a.segments).toHaveLength(3) // n=1：count = 3
    for (const seg of a.segments) {
      expect(wb.english['3']).toContain(seg.chars.toLowerCase())
      expect(seg.chars).toMatch(/^[A-Z]+$/) // 大写化展示
    }
  })

  it('english：词长 ≥8 归 8 桶（n=50 词长 8 用桶 8 覆盖）', () => {
    const wb = { english: { '8': ['beautiful', 'wonderful', 'adventure', 'vacation', 'umbrella', 'sandwich', 'swimming', 'spaceship'] } }
    const level = createKeygameLevel(50, 'english', wb)
    expect(level.segments).toHaveLength(8)
    for (const seg of level.segments) expect(wb.english['8']).toContain(seg.chars.toLowerCase())
  })

  it('english：未覆盖桶回退默认词表（覆盖桶 8 不影响词长 3 关卡）', () => {
    const wb = { english: { '8': ['beautiful'] } }
    const level = createKeygameLevel(1, 'english', wb) // 词长桶 '3' 未覆盖
    for (const seg of level.segments) {
      expect(WORDS_L3).toContain(seg.chars.toLowerCase())
    }
  })

  it('pinyin：自定义等级词表替换默认（hint = 汉字，chars = 拼音序列）', () => {
    const wb = { pinyin: { '1': [
      { word: '雪', pinyin: 'xue' }, { word: '云', pinyin: 'yun' }, { word: '石', pinyin: 'shi' },
      { word: '草', pinyin: 'cao' }, { word: '风', pinyin: 'feng' },
    ] } }
    const level = createKeygameLevel(1, 'pinyin', wb) // 1-17 → grade 1
    expect(level.segments).toHaveLength(3)
    const seqByWord = new Map(wb.pinyin['1'].map((e) => [e.word, e.pinyin.replace(/\s+/g, '').toUpperCase()]))
    for (const seg of level.segments) {
      expect(['雪', '云', '石', '草', '风']).toContain(seg.hint)
      expect(seg.chars).toBe(seqByWord.get(seg.hint))
    }
  })

  it('pinyin：未覆盖等级回退默认词表（覆盖等级 1 不影响 grade 2 关卡）', () => {
    const wb = { pinyin: { '1': [{ word: '雪', pinyin: 'xue' }] } }
    const level = createKeygameLevel(18, 'pinyin', wb) // 18-34 → grade 2
    const defaults = getPinyinByGrade(2)
    for (const seg of level.segments) {
      expect(defaults.some((e) => e.word === seg.hint)).toBe(true)
    }
  })

  it('空配置 = 全默认（wordbank 传 {} 或 undefined 与不传等价）', () => {
    expect(createKeygameLevel(1, 'english', {})).toEqual(createKeygameLevel(1, 'english'))
    expect(createKeygameLevel(1, 'pinyin', {})).toEqual(createKeygameLevel(1, 'pinyin'))
  })
})
