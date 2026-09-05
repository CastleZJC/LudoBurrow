// 迷宫关卡曲线单测（开发计划 4.5 / 技术架构 §12.2）
// 覆盖：尺寸阶梯（5×5 → 21×21）/ 分支度递增 / 主题段轮换（城堡/花园）/
//       确定性（seed 派生）/ 参数与生成器联动（可解性落地）。
import { describe, it, expect } from 'vitest'
import { levelSeed } from '@/engines/rng'
import { generateMaze } from '@/engines/maze-generator'
import { createMazeLevel, sizeForLevel, branchingForLevel, themeForLevel, TOTAL_MAZE_LEVELS } from '@/games/maze/level'

describe('sizeForLevel 尺寸阶梯（每 3 关进阶：5 → 21）', () => {
  it.each([
    [1, 5], [3, 5], [4, 6], [7, 7], [16, 10], [31, 15], [48, 20], [49, 21], [50, 21],
  ])('第 %i 关 → %i×%i', (n, expected) => {
    expect(sizeForLevel(n)).toBe(expected)
  })
})

describe('branchingForLevel 分支度递增（死胡同渐多）', () => {
  it('首关 0.15、末关 0.8，且全程单调不减', () => {
    expect(branchingForLevel(1)).toBeCloseTo(0.15, 10)
    expect(branchingForLevel(50)).toBeCloseTo(0.8, 10)
    for (let n = 2; n <= 50; n++) {
      expect(branchingForLevel(n)).toBeGreaterThanOrEqual(branchingForLevel(n - 1))
    }
  })
})

describe('themeForLevel 主题段轮换（每 10 关切换城堡/花园，F-20）', () => {
  it.each([
    [1, 'castle'], [10, 'castle'], [11, 'garden'], [20, 'garden'],
    [21, 'castle'], [31, 'garden'], [41, 'castle'], [50, 'castle'],
  ])('第 %i 关 → %s', (n, expected) => {
    expect(themeForLevel(n)).toBe(expected)
  })
})

describe('createMazeLevel', () => {
  it('结构完整且确定性（同关卡两次生成全等）', () => {
    const a = createMazeLevel(7)
    const b = createMazeLevel(7)
    expect(a).toEqual(b)
    expect(a.gameId).toBe('maze')
    expect(a.n).toBe(7)
    expect(a.seed).toBe(levelSeed('maze', 7))
    expect(a.size).toBe(sizeForLevel(7))
    expect(a.branching).toBe(branchingForLevel(7))
    expect(a.theme).toBe(themeForLevel(7))
  })

  it('非法关卡号抛 RangeError', () => {
    expect(() => createMazeLevel(0)).toThrow(RangeError)
    expect(() => createMazeLevel(TOTAL_MAZE_LEVELS + 1)).toThrow(RangeError)
  })

  it.each([1, 13, 27, 41, 50])('第 %i 关参数喂给生成器 → 合法可解迷宫', (n) => {
    const cfg = createMazeLevel(n)
    const maze = generateMaze(cfg.seed, cfg.size, { branching: cfg.branching })
    expect(maze.solutionLength).toBeGreaterThan(0)
    expect(maze.size).toBe(cfg.size)
  })
})
