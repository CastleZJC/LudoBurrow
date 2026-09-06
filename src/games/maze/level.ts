// 迷宫关卡生成（开发计划 4.5 / 技术架构 §12.2）
// 难度曲线：尺寸阶梯递增（每 3 关进阶：5×5 → 21×21）+ 分支度线性上升（0.15 → 0.8，死胡同渐多）。
// 确定性：seed = levelSeed('maze', n) 为关卡基准种子（生成器同参同迷宫，§12.1 可复现）；
//         实例生产路径每局叠加随机扰动（instance.ts，验收返工：同关每局轨迹随机）。
// 主题（验收返工 F-20）：跟随设置 mazeTheme（HUD 内切换并持久化 = 记住上次），
//         所有关卡共享单一进度，主题只影响观感；旧「每 10 关轮换」退役。

import type { BaseLevelConfig } from '@/core/types'
import { getSettings } from '@/core/settings'
import { levelSeed } from '@/engines/rng'

/** 主题 id 集合（§12.3；验收返工二轮扩至 8 主题：城堡/花园 + 雪原/火山/海底/丛林/太空站/矿洞；皮肤定义见 theme.ts 单一出处） */
export const MAZE_THEMES = [
  'castle', 'garden', 'snow', 'volcano', 'ocean', 'jungle', 'station', 'mine',
] as const
export type MazeTheme = (typeof MAZE_THEMES)[number]

/** 默认主题（旧档无 mazeTheme 字段时的兜底，与存档校验口径一致） */
export const DEFAULT_MAZE_THEME: MazeTheme = 'castle'

export const TOTAL_MAZE_LEVELS = 50

export interface MazeLevelConfig extends BaseLevelConfig {
  gameId: 'maze'
  /** 单边 cell 数（难度曲线 §12.2） */
  size: number
  /** 分支度 [0,1]：死胡同密度 */
  branching: number
  /** 瓦片主题（8 主题之一，MAZE_THEMES） */
  theme: MazeTheme
}

/** 尺寸阶梯：n ∈ [1,50] → min(5 + floor((n-1)/3), 21) */
export function sizeForLevel(n: number): number {
  return Math.min(5 + Math.floor((n - 1) / 3), 21)
}

/** 分支度线性：0.15 → 0.8（首关长廊主导、末关死胡同密集） */
export function branchingForLevel(n: number): number {
  return 0.15 + ((n - 1) / 49) * 0.65
}

export function createMazeLevel(n: number): MazeLevelConfig {
  if (n < 1 || n > TOTAL_MAZE_LEVELS) throw new RangeError(`maze: 非法关卡号 ${n}`)
  return {
    gameId: 'maze',
    n,
    seed: levelSeed('maze', n),
    size: sizeForLevel(n),
    branching: branchingForLevel(n),
    theme: getSettings().mazeTheme ?? DEFAULT_MAZE_THEME,
  }
}
