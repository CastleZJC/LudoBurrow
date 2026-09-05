// 迷宫关卡生成（开发计划 4.5 / 技术架构 §12.2）
// 难度曲线：尺寸阶梯递增（每 3 关进阶：5×5 → 21×21）+ 分支度线性上升（0.15 → 0.8，
// 死胡同渐多）+ 主题每 10 关轮换（城堡/花园，F-20 主题切换可见）。
// 确定性：seed = levelSeed('maze', n)，生成器同参同迷宫（§12.1 可复现）。

import type { BaseLevelConfig } from '@/core/types'
import { levelSeed } from '@/engines/rng'

/** 主题 id（§12.3 首期两主题；皮肤定义见 theme.ts 单一出处） */
export type MazeTheme = 'castle' | 'garden'

export const TOTAL_MAZE_LEVELS = 50

export interface MazeLevelConfig extends BaseLevelConfig {
  gameId: 'maze'
  /** 单边 cell 数（难度曲线 §12.2） */
  size: number
  /** 分支度 [0,1]：死胡同密度 */
  branching: number
  /** 瓦片主题（城堡/花园） */
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

/** 主题轮换：每 10 关切换（1-10 城堡 / 11-20 花园 / …） */
export function themeForLevel(n: number): MazeTheme {
  return Math.floor((n - 1) / 10) % 2 === 0 ? 'castle' : 'garden'
}

export function createMazeLevel(n: number): MazeLevelConfig {
  if (n < 1 || n > TOTAL_MAZE_LEVELS) throw new RangeError(`maze: 非法关卡号 ${n}`)
  return {
    gameId: 'maze',
    n,
    seed: levelSeed('maze', n),
    size: sizeForLevel(n),
    branching: branchingForLevel(n),
    theme: themeForLevel(n),
  }
}
