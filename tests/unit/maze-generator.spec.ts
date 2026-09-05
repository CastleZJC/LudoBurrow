// 迷宫生成器引擎单测（开发计划 4.1 / 技术架构 §12.1）
// 覆盖：可复现 / 结构合法（外圈墙 + cell 全地板）/ 完美迷宫性质（生成树无环）/
//       可解性（BFS 独立重算）/ 死胡同计数 / 分支度参数生效 / 参数校验与边界。
import { describe, it, expect } from 'vitest'
import { generateMaze, isWall, type MazeData } from '@/engines/maze-generator'

/** 独立 BFS：迷宫上 start→goal 最短步数（测试口径与引擎实现分离） */
function bfsLength(maze: MazeData): number {
  const { size, walls, tiles } = maze
  const open = (cx: number, cy: number, dx: number, dy: number): boolean => {
    const tx = 2 * cx + 1 + dx
    const ty = 2 * cy + 1 + dy
    return walls[ty * tiles + tx] === 0
  }
  const dist = new Int32Array(size * size).fill(-1)
  const queue: number[] = [maze.start.y * size + maze.start.x]
  dist[queue[0]!] = 0
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!
    const cx = cur % size
    const cy = Math.floor(cur / size)
    if (cx === maze.goal.x && cy === maze.goal.y) return dist[cur]!
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      if (dist[ny * size + nx] !== -1 || !open(cx, cy, dx, dy)) continue
      dist[ny * size + nx] = dist[cur]! + 1
      queue.push(ny * size + nx)
    }
  }
  return -1
}

/** 独立重算死胡同数（3 面墙的 cell） */
function countDeadEnds(maze: MazeData): number {
  const { size, walls, tiles } = maze
  let dead = 0
  for (let cy = 0; cy < size; cy++) {
    for (let cx = 0; cx < size; cx++) {
      let wallSides = 0
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        if (walls[(2 * cy + 1 + dy) * tiles + (2 * cx + 1 + dx)] === 1) wallSides++
      }
      if (wallSides === 3) dead++
    }
  }
  return dead
}

describe('generateMaze 参数校验', () => {
  it('size 非法（<2 / 非整数 / >33）抛 RangeError', () => {
    expect(() => generateMaze(1, 1)).toThrow(RangeError)
    expect(() => generateMaze(1, 34)).toThrow(RangeError)
    expect(() => generateMaze(1, 7.5)).toThrow(RangeError)
  })

  it('branching 越界钳制到 [0,1]，不抛错且产出合法迷宫', () => {
    const low = generateMaze(42, 9, { branching: -0.5 })
    const high = generateMaze(42, 9, { branching: 1.5 })
    expect(bfsLength(low)).toBeGreaterThan(0)
    expect(bfsLength(high)).toBeGreaterThan(0)
  })
})

describe('generateMaze 可复现性（§12.1 同关卡可复现）', () => {
  it('同 seed 同参：两次生成 walls 逐字节全等，解长/死胡同一致', () => {
    const a = generateMaze(20260906, 13, { branching: 0.6 })
    const b = generateMaze(20260906, 13, { branching: 0.6 })
    expect(Array.from(a.walls)).toEqual(Array.from(b.walls))
    expect(a.solutionLength).toBe(b.solutionLength)
    expect(a.deadEnds).toBe(b.deadEnds)
  })

  it('不同 seed：walls 不同', () => {
    const a = generateMaze(1, 11)
    const b = generateMaze(2, 11)
    expect(Array.from(a.walls)).not.toEqual(Array.from(b.walls))
  })
})

describe('generateMaze 结构合法性', () => {
  const maze = generateMaze(7, 9, { branching: 0.5 })

  it('tiles = 2*size+1，walls 长度 = tiles²', () => {
    expect(maze.tiles).toBe(19)
    expect(maze.walls).toHaveLength(19 * 19)
  })

  it('外圈全墙；所有 cell 本体是地板', () => {
    for (let t = 0; t < maze.tiles; t++) {
      expect(maze.walls[t]).toBe(1) // 上边
      expect(maze.walls[(maze.tiles - 1) * maze.tiles + t]).toBe(1) // 下边
      expect(maze.walls[t * maze.tiles]).toBe(1) // 左边
      expect(maze.walls[t * maze.tiles + maze.tiles - 1]).toBe(1) // 右边
    }
    for (let cy = 0; cy < 9; cy++) {
      for (let cx = 0; cx < 9; cx++) {
        expect(maze.walls[(2 * cy + 1) * maze.tiles + (2 * cx + 1)]).toBe(0)
      }
    }
  })

  it('start=左上、goal=右下 cell', () => {
    expect(maze.start).toEqual({ x: 0, y: 0 })
    expect(maze.goal).toEqual({ x: 8, y: 8 })
  })

  it('完美迷宫性质：地板总数 = 2*cells-1（生成树无环）', () => {
    // cell 本体 size² 个 + 打通的墙 size²-1 个
    let floors = 0
    for (const v of maze.walls) if (v === 0) floors++
    expect(floors).toBe(2 * 9 * 9 - 1)
  })
})

describe('generateMaze 可解性与统计', () => {
  it.each([2, 5, 9, 17, 33])('size=%i：start→goal 连通且 solutionLength 与独立 BFS 全等', (size) => {
    const maze = generateMaze(99 + size, size, { branching: 0.4 })
    const expected = bfsLength(maze)
    expect(expected).toBeGreaterThan(0)
    expect(maze.solutionLength).toBe(expected)
    // 解长下界 = 曼哈顿距离（对角穿越至少走 size-1 + size-1 步）
    expect(maze.solutionLength).toBeGreaterThanOrEqual(2 * (size - 1))
  })

  it('deadEnds 与独立重算一致', () => {
    const maze = generateMaze(555, 11, { branching: 0.7 })
    expect(maze.deadEnds).toBe(countDeadEnds(maze))
  })

  it('解长随尺寸上升（多 seed 平均：21×21 > 7×7）', () => {
    const avg = (size: number): number => {
      let sum = 0
      for (let s = 1; s <= 5; s++) sum += generateMaze(s, size, { branching: 0.5 }).solutionLength
      return sum / 5
    }
    expect(avg(21)).toBeGreaterThan(avg(7))
  })
})

describe('branching 分支度参数生效（§12.1 死胡同密度）', () => {
  it('多 seed 平均：branching=0.9 死胡同多于 branching=0.1', () => {
    const avg = (branching: number): number => {
      let sum = 0
      for (let s = 1; s <= 6; s++) sum += generateMaze(s, 15, { branching }).deadEnds
      return sum / 6
    }
    expect(avg(0.9)).toBeGreaterThan(avg(0.1))
  })
})

describe('isWall 坐标判定（渲染/移动共用）', () => {
  const maze = generateMaze(3, 5)

  it('tile 越界视为墙；cell 本体非墙', () => {
    expect(isWall(maze, -1, 3)).toBe(true)
    expect(isWall(maze, 3, 99)).toBe(true)
    expect(isWall(maze, 1, 1)).toBe(false)
  })
})

describe('性能冒烟（NF-01/02 同源：生成不得拖慢交互）', () => {
  it('size=33 生成 < 200ms', () => {
    const t0 = Date.now()
    generateMaze(777, 33, { branching: 0.8 })
    expect(Date.now() - t0).toBeLessThan(200)
  })
})
