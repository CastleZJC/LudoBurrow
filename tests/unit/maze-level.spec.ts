// 迷宫关卡曲线单测（开发计划 4.5 / 技术架构 §12.2）
// 覆盖：尺寸阶梯（5×5 → 21×21）/ 分支度递增 / 主题跟随设置（验收返工 F-20，旧轮换退役）/
//       确定性（基准 seed 派生，实例每局扰动在 instance 层）/ 参数与生成器联动（可解性落地）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { levelSeed } from '@/engines/rng'
import { generateMaze } from '@/engines/maze-generator'
import { updateSettings } from '@/core/settings'
import { createMazeLevel, sizeForLevel, branchingForLevel, TOTAL_MAZE_LEVELS } from '@/games/maze/level'

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

describe('createMazeLevel 主题（跟随设置，验收返工 F-20）', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('缺省 = 城堡；updateSettings 后新关卡沿用上次主题（记住上次，与关卡号无关）', () => {
    expect(createMazeLevel(7).theme).toBe('castle')
    updateSettings({ mazeTheme: 'garden' })
    expect(createMazeLevel(7).theme).toBe('garden')
    expect(createMazeLevel(41).theme).toBe('garden') // 旧「每 10 关轮换」退役：任意关同主题
  })
})

describe('createMazeLevel', () => {
  beforeEach(() => localStorage.clear())

  it('结构完整且确定性（同关卡两次生成全等；seed 为基准种子，可复现性见 §12.1）', () => {
    const a = createMazeLevel(7)
    const b = createMazeLevel(7)
    expect(a).toEqual(b)
    expect(a.gameId).toBe('maze')
    expect(a.n).toBe(7)
    expect(a.seed).toBe(levelSeed('maze', 7))
    expect(a.size).toBe(sizeForLevel(7))
    expect(a.branching).toBe(branchingForLevel(7))
    expect(a.theme).toBe('castle') // 缺省主题（localStorage 已清）
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
