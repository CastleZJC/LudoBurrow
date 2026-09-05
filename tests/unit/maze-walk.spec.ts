// 迷宫移动逻辑单测（开发计划 4.4 / 技术架构 §12.5）
// 覆盖：tryMove 转身/撞墙/前进语义、步数与撞墙计数、动画帧交替、出口判定、星级口径。
import { describe, it, expect } from 'vitest'
import { generateMaze } from '@/engines/maze-generator'
import type { Facing } from '@/games/maze/walk'
import {
  createHero,
  tryMove,
  isAtGoal,
  animFrameOf,
  calcMazeStars,
  type HeroState,
} from '@/games/maze/walk'

/** 构造可控小迷宫的辅助：在 walls 位图上按 cell 序列开路 */
function mazeWithCorridor(): ReturnType<typeof generateMaze> {
  // seed 探测：找一个 (0,0)→(1,0) 方向开着的 5×5 迷宫（多数 seed 都满足）
  for (let seed = 1; seed < 50; seed++) {
    const maze = generateMaze(seed, 5, { branching: 0.3 })
    // cell(0,0)→(1,0) 墙位 = tile(2,1)（cell 本体在奇数位 1/3）
    if (maze.walls[1 * maze.tiles + 2] === 0) return maze
  }
  throw new Error('未找到满足条件的 seed')
}

describe('createHero', () => {
  it('出生在 start、朝下、零计数', () => {
    const maze = generateMaze(9, 7)
    const hero = createHero(maze)
    expect(hero).toEqual({ cx: 0, cy: 0, facing: 'down', steps: 0, bumps: 0, walkTick: 0 })
  })
})

describe('tryMove（转身总是生效；墙 = 撞墙不动；开 = 前进一步）', () => {
  const maze = mazeWithCorridor()

  it('目标方向是墙：bumps+1、位置不动、但 facing 更新', () => {
    const hero = createHero(maze)
    // 探测一个被墙挡住的方向（迷宫必有，左/上为边界墙）
    const r1 = tryMove(maze, hero, 'up') // 边界上必为墙
    expect(r1.moved).toBe(false)
    expect(r1.hero.cx).toBe(0)
    expect(r1.hero.cy).toBe(0)
    expect(r1.hero.bumps).toBe(1)
    expect(r1.hero.steps).toBe(0)
    expect(r1.hero.facing).toBe('up')
    expect(hero.bumps).toBe(0) // 不可变：原对象不动
  })

  it('目标方向开路：前进一格、steps+1、walkTick 推进', () => {
    const hero = createHero(maze)
    const r = tryMove(maze, hero, 'right') // (0,0)→(1,0) 已打通
    expect(r.moved).toBe(true)
    expect(r.hero).toEqual({ cx: 1, cy: 0, facing: 'right', steps: 1, bumps: 0, walkTick: 1 })
  })
})

describe('animFrameOf（站立 0；行走 1/2 交替）', () => {
  it('walkTick 偶数 → 1，奇数 → 2；零步 → 0', () => {
    const h0: HeroState = { cx: 0, cy: 0, facing: 'down', steps: 0, bumps: 0, walkTick: 0 }
    const h1 = { ...h0, walkTick: 1 }
    const h2 = { ...h0, walkTick: 2 }
    expect(animFrameOf(h0)).toBe(0)
    expect(animFrameOf(h1)).toBe(1)
    expect(animFrameOf(h2)).toBe(2)
  })
})

describe('isAtGoal', () => {
  it('到达右下角 cell 为真', () => {
    const maze = generateMaze(4, 5)
    const hero: HeroState = { cx: maze.goal.x, cy: maze.goal.y, facing: 'down', steps: 9, bumps: 0, walkTick: 9 }
    expect(isAtGoal(maze, hero)).toBe(true)
    expect(isAtGoal(maze, { ...hero, cx: 0, cy: 0 })).toBe(false)
  })
})

describe('calcMazeStars（§12.5 用时与步数口径：步数相对解长）', () => {
  it('≤1.2×解长 3 星；≤1.8× 2 星；超出 1 星', () => {
    expect(calcMazeStars(10, 10)).toBe(3)
    expect(calcMazeStars(12, 10)).toBe(3)
    expect(calcMazeStars(13, 10)).toBe(2)
    expect(calcMazeStars(18, 10)).toBe(2)
    expect(calcMazeStars(19, 10)).toBe(1)
    expect(calcMazeStars(60, 10)).toBe(1)
  })
})

describe('完整通关链路（引擎 + 移动逻辑联动）', () => {
  it('沿 BFS 路径逐格 tryMove 到出口，步数 = 解长', () => {
    const maze = generateMaze(2026, 9, { branching: 0.4 })
    // 贪心走法：每步选使曼哈顿距离减小且无墙的方向（BFS 最短路在这类网格不一定贪心可达，改用真 BFS 路径）
    const path = bfsPath(maze)
    expect(path.length).toBe(maze.solutionLength)
    let hero = createHero(maze)
    for (const dir of path) {
      const r = tryMove(maze, hero, dir)
      expect(r.moved).toBe(true)
      hero = r.hero
    }
    expect(isAtGoal(maze, hero)).toBe(true)
    expect(hero.steps).toBe(maze.solutionLength)
    expect(calcMazeStars(hero.steps, maze.solutionLength)).toBe(3)
  })
})

/** BFS 还原方向序列（测试辅助） */
function bfsPath(maze: ReturnType<typeof generateMaze>): Facing[] {
  const { size, walls, tiles } = maze
  const prev = new Int32Array(size * size).fill(-2)
  const prevDir = new Int32Array(size * size).fill(-1)
  const dirs: { dx: number; dy: number; name: Facing }[] = [
    { dx: 0, dy: -1, name: 'up' },
    { dx: 1, dy: 0, name: 'right' },
    { dx: 0, dy: 1, name: 'down' },
    { dx: -1, dy: 0, name: 'left' },
  ]
  const queue = [maze.start.y * size + maze.start.x]
  prev[queue[0]!] = -1
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!
    const cx = cur % size
    const cy = Math.floor(cur / size)
    if (cx === maze.goal.x && cy === maze.goal.y) break
    dirs.forEach((d, di) => {
      const nx = cx + d.dx
      const ny = cy + d.dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) return
      if (prev[ny * size + nx] !== -2) return
      if (walls[(2 * cy + 1 + d.dy) * tiles + (2 * cx + 1 + d.dx)] === 1) return
      prev[ny * size + nx] = cur
      prevDir[ny * size + nx] = di
      queue.push(ny * size + nx)
    })
  }
  const out: Facing[] = []
  let cur = maze.goal.y * size + maze.goal.x
  while (prev[cur] !== -1) {
    const p = prev[cur]!
    const di = prevDir[cur]!
    out.unshift(dirs[di]!.name)
    cur = p
  }
  return out
}
