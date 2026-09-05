// 键盘游戏关卡生成（开发计划 M2 / 技术架构 §10.2-§10.4）
// 难度曲线（50 关四模式分段，大/小键盘各自成线）：
//   1-13   大键盘随机序列（长度 3→12）      14-25  小键盘随机序列（长度 6→17）
//   26-38  英文单词（词数 3→6、词长 3→8）   39-50  拼音（分级 1→3、词数 3→6）
// 确定性：随机性一律经 levelSeed('keygame', n) 派生 Rng，同关卡内容恒定（§9 纪律）

import type { BaseLevelConfig } from '@/core/types'
import { createRng, levelSeed } from '@/engines/rng'
import {
  getPinyinByGrade,
  getWordsByLength,
  pinyinToSequence,
  randomCharSequence,
} from '@/engines/wordbank'

export type KeygameMode = 'full-random' | 'compact-random' | 'english' | 'pinyin'

/** 展示分段：chars = 目标字符（大写/数字）；hint = 拼音模式的汉字提示，其余为空串 */
export interface TargetSegment {
  chars: string
  hint: string
}

export interface KeygameLevelConfig extends BaseLevelConfig {
  gameId: 'keygame'
  mode: KeygameMode
  /** 虚拟键盘布局：full = 大键盘（含数字小键盘区），compact = 小键盘（紧凑） */
  layout: 'full' | 'compact'
  /** 比对用扁平目标序列（大写字母/数字） */
  sequence: readonly string[]
  /** 展示分段（英文 = 单词、拼音 = 词、随机 = 整段一条） */
  segments: readonly TargetSegment[]
}

/** 关卡号线性插值取整：n 在 [n0, n1] 上把值从 v0 均匀推进到 v1 */
function lerpStep(n: number, n0: number, n1: number, v0: number, v1: number): number {
  const t = (n - n0) / (n1 - n0)
  return v0 + Math.round(t * (v1 - v0))
}

/** 模式分段（大/小键盘各自成线 + 两种内容模式收尾） */
function modeOf(n: number): { mode: KeygameMode; layout: 'full' | 'compact' } {
  if (n >= 1 && n <= 13) return { mode: 'full-random', layout: 'full' }
  if (n <= 25) return { mode: 'compact-random', layout: 'compact' }
  if (n <= 38) return { mode: 'english', layout: 'full' }
  return { mode: 'pinyin', layout: 'full' }
}

export function createKeygameLevel(n: number): KeygameLevelConfig {
  if (n < 1 || n > 50) throw new RangeError(`keygame: 非法关卡号 ${n}`)
  const rng = createRng(levelSeed('keygame', n))
  const { mode, layout } = modeOf(n)

  let segments: TargetSegment[]
  if (mode === 'full-random') {
    // 大键盘线：短序列起步（3 → 12 字符）
    const len = lerpStep(n, 1, 13, 3, 12)
    segments = [{ chars: randomCharSequence(rng, len).join(''), hint: '' }]
  } else if (mode === 'compact-random') {
    // 小键盘线：序列更长（6 → 17 字符），难度上探
    const len = lerpStep(n, 14, 25, 6, 17)
    segments = [{ chars: randomCharSequence(rng, len).join(''), hint: '' }]
  } else if (mode === 'english') {
    // 英文线：词数 3 → 6、词长 3 → 8（≥8 归长词表），关内不重复
    const count = lerpStep(n, 26, 38, 3, 6)
    const wordLen = lerpStep(n, 26, 38, 3, 8)
    const pool = rng.shuffle([...getWordsByLength(wordLen)])
    segments = pool.slice(0, count).map((word) => ({ chars: word.toUpperCase(), hint: '' }))
  } else {
    // 拼音线：39-42 一级 / 43-46 二级 / 47-50 三级，词数 3 → 6
    const grade = n < 43 ? 1 : n < 47 ? 2 : 3
    const count = lerpStep(n, 39, 50, 3, 6)
    const pool = rng.shuffle([...getPinyinByGrade(grade)])
    segments = pool.slice(0, count).map((entry) => ({
      chars: pinyinToSequence(entry).join(''),
      hint: entry.word,
    }))
  }

  const sequence: string[] = []
  for (const seg of segments) sequence.push(...seg.chars.split(''))
  return { gameId: 'keygame', n, seed: levelSeed('keygame', n), mode, layout, sequence, segments }
}

/**
 * 星级规则（开发计划 M2 验收口径）：
 * 0 失误 = 3 星；失误 ≤ 序列长度 10%（向下取整）= 2 星；否则 1 星。
 */
export function calcKeygameStars(mistakes: number, total: number): 1 | 2 | 3 {
  if (mistakes <= 0) return 3
  if (mistakes <= Math.floor(total * 0.1)) return 2
  return 1
}
