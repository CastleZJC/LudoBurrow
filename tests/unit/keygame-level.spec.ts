// 键盘词表模式关卡生成单测（验收返工二轮：词序按词表顺序由简到难——首关从首词开始，顺序滚动窗口环绕）
import { describe, it, expect } from 'vitest'
import { createKeygameLevel } from '@/games/keygame/level'
import { PINYIN_BASIC, PINYIN_COMMON, WORDS_L3, WORDS_L6 } from '@/engines/wordbank'
import type { WordbankConfig } from '@/core/save'

describe('词序（验收返工二轮：词表顺序 = 难度序，不再随机洗牌）', () => {
  it('拼音一级第 1 关：首词 = 词表首词「大」（非随机起点）', () => {
    const level = createKeygameLevel(1, 'pinyin')
    expect(level.segments[0]!.hint).toBe(PINYIN_BASIC[0]!.word)
    expect(level.segments[0]!.hint).toBe('大')
    expect(level.segments[0]!.chars).toBe('DA')
  })

  it('拼音顺序推进：第 2 关首词 = 词表第 2 词「小」', () => {
    const level = createKeygameLevel(2, 'pinyin')
    expect(level.segments[0]!.hint).toBe(PINYIN_BASIC[1]!.word)
  })

  it('拼音换级从该级首词开始：第 18 关（二级）首词 =「学校」', () => {
    const level = createKeygameLevel(18, 'pinyin')
    expect(level.segments[0]!.hint).toBe(PINYIN_COMMON[0]!.word)
  })

  it('拼音自定义短词表环绕：3 词池第 4 关首词回绕到首词（顺序滚动窗口）', () => {
    const wb: WordbankConfig = {
      pinyin: { '1': [{ word: '一', pinyin: 'yi' }, { word: '二', pinyin: 'er' }, { word: '三', pinyin: 'san' }] },
    }
    const level = createKeygameLevel(4, 'pinyin', wb)
    expect(level.segments[0]!.hint).toBe('一')
  })

  it('英文第 1 关：首词 = 桶首词 cat，按词表顺序取词', () => {
    const level = createKeygameLevel(1, 'english')
    expect(level.segments[0]!.chars).toBe(WORDS_L3[0]!.toUpperCase())
    expect(level.segments[0]!.chars).toBe('CAT')
    expect(level.segments[1]!.chars).toBe(WORDS_L3[1]!.toUpperCase())
  })

  it('英文顺序推进：第 2 关首词 = 桶第 2 词 dog', () => {
    const level = createKeygameLevel(2, 'english')
    expect(level.segments[0]!.chars).toBe('DOG')
  })

  it('英文跨档推进：第 31 关落 6 字母桶，start = (n-1) % 池长 回绕到桶首词', () => {
    const level = createKeygameLevel(31, 'english')
    // 第 31 关 wordLen = 6（lerp 阶梯）；WORDS_L6 共 30 词 → start = 30 % 30 = 0
    expect(level.segments[0]!.chars).toBe(WORDS_L6[0]!.toUpperCase())
  })

  it('英文自定义短词表环绕：3 词池第 4 关首词回绕到首词', () => {
    const wb: WordbankConfig = { english: { '3': ['sun', 'sky', 'sea'] } }
    const level = createKeygameLevel(4, 'english', wb)
    expect(level.segments[0]!.chars).toBe('SUN')
  })
})
