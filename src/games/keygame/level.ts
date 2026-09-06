// 键盘游戏关卡生成（开发计划 M2 / 技术架构 §10.2-§10.4）
// 四模式各自独立 1-50 难度曲线（方案 B：选关页先选模式，每模式一条独立进度轨）：
//   full-random    全键盘随机序列（长度 3→16）
//   compact-random 紧凑键盘随机序列（长度 6→20）
//   english        英文单词（词数 3→8、词长 3→8）
//   pinyin         中文拼音（分级 1→3、词数 3→8）
// 确定性：随机性经 levelSeed(`keygame:${mode}`, n) 派生 Rng，同(模式,关卡)内容恒定（§9 纪律）

import type { BaseLevelConfig } from '@/core/types'
import type { WordbankConfig } from '@/core/save'
import { createRng, levelSeed } from '@/engines/rng'
import {
  getPinyinByGrade,
  getWordsByLength,
  pinyinToSequence,
  randomCharSequence,
} from '@/engines/wordbank'

export type KeygameMode = 'full-random' | 'compact-random' | 'english' | 'pinyin'

/** 四模式（选关页页签顺序 = 此顺序；i18n key 见 keygame.mode*） */
export const KEYGAME_MODES: readonly KeygameMode[] = ['full-random', 'compact-random', 'english', 'pinyin']

/** 模式 i18n 标签键（HUD / 选关页页签共用） */
export const KEYGAME_MODE_LABEL_KEY: Record<KeygameMode, string> = {
  'full-random': 'keygame.modeFull',
  'compact-random': 'keygame.modeCompact',
  english: 'keygame.modeEnglish',
  pinyin: 'keygame.modePinyin',
}

/** 模式 → 虚拟键盘布局：紧凑键盘模式用 compact，其余 full */
export function layoutOfMode(mode: KeygameMode): 'full' | 'compact' {
  return mode === 'compact-random' ? 'compact' : 'full'
}

/** 模式守卫：track 字符串收窄为合法 KeygameMode */
export function isKeygameMode(v: unknown): v is KeygameMode {
  return v === 'full-random' || v === 'compact-random' || v === 'english' || v === 'pinyin'
}

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

export function createKeygameLevel(
  n: number,
  mode: KeygameMode = 'full-random',
  wordbank?: WordbankConfig,
): KeygameLevelConfig {
  if (n < 1 || n > 50) throw new RangeError(`keygame: 非法关卡号 ${n}`)
  if (!isKeygameMode(mode)) throw new RangeError(`keygame: 非法模式 ${String(mode)}`)
  const seed = levelSeed(`keygame:${mode}`, n)
  const rng = createRng(seed)
  const layout = layoutOfMode(mode)

  let segments: TargetSegment[]
  if (mode === 'full-random') {
    // 全键盘线：序列长度 3 → 16（跨 1-50 均匀上探）
    const len = lerpStep(n, 1, 50, 3, 16)
    segments = [{ chars: randomCharSequence(rng, len).join(''), hint: '' }]
  } else if (mode === 'compact-random') {
    // 紧凑键盘线：序列更长 6 → 20（紧凑布局键位少，靠长度上难度）
    const len = lerpStep(n, 1, 50, 6, 20)
    segments = [{ chars: randomCharSequence(rng, len).join(''), hint: '' }]
  } else if (mode === 'english') {
    // 英文线：词数 3 → 8、词长 3 → 8（≥8 归长词桶），关内不重复；
    // 自定义词表按词长桶覆盖（键与 getWordsByLength 分桶口径一致：≥8 归 '8'）
    const count = lerpStep(n, 1, 50, 3, 8)
    const wordLen = lerpStep(n, 1, 50, 3, 8)
    const bucket = wordLen >= 8 ? '8' : String(wordLen)
    const pool = rng.shuffle([...getWordsByLength(wordLen, wordbank?.english?.[bucket])])
    segments = pool.slice(0, count).map((word) => ({ chars: word.toUpperCase(), hint: '' }))
  } else {
    // 拼音线：1-17 一级 / 18-34 二级 / 35-50 三级，词数 3 → 8；自定义词表按等级覆盖
    const grade: 1 | 2 | 3 = n <= 17 ? 1 : n <= 34 ? 2 : 3
    const count = lerpStep(n, 1, 50, 3, 8)
    const pool = rng.shuffle([...getPinyinByGrade(grade, wordbank?.pinyin?.[String(grade)])])
    segments = pool.slice(0, count).map((entry) => ({
      chars: pinyinToSequence(entry).join(''),
      hint: entry.word,
    }))
  }

  const sequence: string[] = []
  for (const seg of segments) sequence.push(...seg.chars.split(''))
  return { gameId: 'keygame', n, seed, mode, layout, sequence, segments, track: mode }
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
