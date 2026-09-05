// 迷宫移动纯逻辑（开发计划 4.4 / 技术架构 §12.5）
// 不可变 HeroState：tryMove 返回新对象，渲染与测试共享同一语义；
// 墙壁碰撞经引擎 isWall（越界 = 墙）判定，步数/撞墙计数即成绩口径。

import type { MazeData } from '@/engines/maze-generator'
import { isWall } from '@/engines/maze-generator'

export type Facing = 'up' | 'down' | 'left' | 'right'

export interface HeroState {
  cx: number
  cy: number
  facing: Facing
  /** 实际移动步数（§12.5 成绩） */
  steps: number
  /** 撞墙次数（失误口径，报告为 mistakes） */
  bumps: number
  /** 行走步进计数（动画帧 1/2 交替的驱动源） */
  walkTick: number
}

export const DIR_VEC: Record<Facing, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  right: { dx: 1, dy: 0 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
}

export function createHero(maze: MazeData): HeroState {
  return { cx: maze.start.x, cy: maze.start.y, facing: 'down', steps: 0, bumps: 0, walkTick: 0 }
}

/**
 * 尝试朝 dir 移动：总是转身；目标方向为墙 → 撞墙计数 +1 且位置不动；
 * 开路 → 前进一格，步数与行走计数 +1。
 */
export function tryMove(maze: MazeData, hero: HeroState, dir: Facing): { hero: HeroState; moved: boolean } {
  const { dx, dy } = DIR_VEC[dir]
  // cell(cx,cy) 与相邻 cell 之间的墙位：cell 奇数 tile 坐标 + 方向偏移
  const blocked = isWall(maze, 2 * hero.cx + 1 + dx, 2 * hero.cy + 1 + dy)
  if (blocked) {
    return { hero: { ...hero, facing: dir, bumps: hero.bumps + 1 }, moved: false }
  }
  return {
    hero: { ...hero, facing: dir, cx: hero.cx + dx, cy: hero.cy + dy, steps: hero.steps + 1, walkTick: hero.walkTick + 1 },
    moved: true,
  }
}

/** 是否已抵达出口 cell */
export function isAtGoal(maze: MazeData, hero: HeroState): boolean {
  return hero.cx === maze.goal.x && hero.cy === maze.goal.y
}

/** 动画帧：站立 0；行走中按 walkTick 奇偶在 1/2 交替 */
export function animFrameOf(hero: HeroState): 0 | 1 | 2 {
  if (hero.walkTick === 0) return 0
  return hero.walkTick % 2 === 1 ? 1 : 2
}

/** 星级（步数相对最短解长）：≤1.2× 3 星、≤1.8× 2 星、超出 1 星 */
export function calcMazeStars(steps: number, solutionLength: number): 1 | 2 | 3 {
  if (steps <= Math.ceil(solutionLength * 1.2)) return 3
  if (steps <= Math.ceil(solutionLength * 1.8)) return 2
  return 1
}
