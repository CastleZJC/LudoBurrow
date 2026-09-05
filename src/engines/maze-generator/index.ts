// 迷宫生成器引擎（开发计划 4.1 / 技术架构 §12.1）
// 种子随机（mulberry32）+ 递归回溯（Growing Tree 变体）：branching 参数在
// 「取栈顶（DFS 长廊主导）」与「活跃集随机取格（分支密集、死胡同多）」之间插值，
// 控制死胡同密度；任意参数组合都保持完美迷宫性质（全连通 + 无环 → 可解性保证）。
// 无 DOM / 无 Math.random，纯函数可单测（engines 覆盖率 ≥90% 目标）。

import { createRng } from '../rng'

/** cell 坐标（0..size-1，独立于 tile 坐标） */
export interface MazeCell {
  x: number
  y: number
}

export interface MazeOptions {
  /**
   * 分支度 [0,1]（越界钳制）：0 = 纯递归回溯（长蛇廊、死胡同少），
   * 1 = 每步随机选活跃格（树宽矮、死胡同密集）。缺省 0.5。
   */
  branching?: number
}

export interface MazeData {
  /** 单边 cell 数（2-33） */
  size: number
  /** tilemap 边长 = 2*size+1：奇数坐标为 cell 本体，偶数坐标为墙位 */
  tiles: number
  /** 墙位图 row-major：1=墙 0=通路，长度 tiles²（渲染与移动判定共用） */
  walls: Uint8Array
  start: MazeCell
  goal: MazeCell
  /** start→goal 最短步数（BFS cell 步；难度曲线与星级参考） */
  solutionLength: number
  /** 死胡同 cell 数（三面墙，§12.1 分支度统计口径） */
  deadEnds: number
}

/** 单元格最小/最大规格（tilemap 67 上限，足够 50 关最高规格并留裕量） */
const MIN_SIZE = 2
const MAX_SIZE = 33

/** 四方向偏移（N E S W；渲染 sprite 朝向同序） */
const DIRS: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
]

/** tile 坐标是否为墙（越界视为墙：移动判定与渲染共用统一口径） */
export function isWall(maze: MazeData, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= maze.tiles || ty >= maze.tiles) return true
  return maze.walls[ty * maze.tiles + tx] === 1
}

/** cell 坐标 → tile 坐标（奇数格） */
export function tileOfCell(v: number): number {
  return 2 * v + 1
}

/** start→goal 最短步数（cell BFS；不可达返回 -1，正常生成不会发生） */
function solveLength(maze: MazeData): number {
  const { size, walls, tiles } = maze
  const dist = new Int32Array(size * size).fill(-1)
  const queue = new Int32Array(size * size)
  let head = 0
  let tail = 0
  queue[tail++] = maze.start.y * size + maze.start.x
  dist[queue[0]!] = 0
  while (head < tail) {
    const cur = queue[head++]!
    const cx = cur % size
    const cy = Math.floor(cur / size)
    if (cx === maze.goal.x && cy === maze.goal.y) return dist[cur]!
    for (const { dx, dy } of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      if (dist[ny * size + nx] !== -1) continue
      // 相邻 cell 间的墙位（cell 奇数坐标 + 方向偏移）
      if (walls[(2 * cy + 1 + dy) * tiles + (2 * cx + 1 + dx)] === 1) continue
      dist[ny * size + nx] = dist[cur]! + 1
      queue[tail++] = ny * size + nx
    }
  }
  return -1
}

/** 三面墙 cell 计数（死胡同统计） */
function countDeadEnds(maze: MazeData): number {
  const { size, walls, tiles } = maze
  let dead = 0
  for (let cy = 0; cy < size; cy++) {
    for (let cx = 0; cx < size; cx++) {
      let wallSides = 0
      for (const { dx, dy } of DIRS) {
        if (walls[(2 * cy + 1 + dy) * tiles + (2 * cx + 1 + dx)] === 1) wallSides++
      }
      if (wallSides === 3) dead++
    }
  }
  return dead
}

/**
 * 生成完美迷宫：Growing Tree（递归回溯的分支度泛化）。
 * 每步从活跃集取一格：branching 概率随机取（多分支），否则取最新格（DFS 长廊）；
 * 只向未访问 cell 打通墙 → 生成树（无环、全连通），start→goal 必然可达。
 */
export function generateMaze(seed: number, size: number, options: MazeOptions = {}): MazeData {
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new RangeError(`maze-generator: size 需为整数 [${MIN_SIZE}, ${MAX_SIZE}]，收到 ${size}`)
  }
  const branching = Math.min(1, Math.max(0, options.branching ?? 0.5))
  const rng = createRng(seed)

  const tiles = 2 * size + 1
  const walls = new Uint8Array(tiles * tiles).fill(1)
  const carve = (tx: number, ty: number): void => {
    walls[ty * tiles + tx] = 0
  }
  // cell 本体全部落地板
  for (let cy = 0; cy < size; cy++) {
    for (let cx = 0; cx < size; cx++) carve(tileOfCell(cx), tileOfCell(cy))
  }

  const visited = new Uint8Array(size * size)
  const active: number[] = [] // 活跃集（cell 编码 y*size+x），最新格在栈顶
  const pushCell = (code: number): void => {
    visited[code] = 1
    active.push(code)
  }
  pushCell(0) // 从左上 start 起生成

  while (active.length > 0) {
    // 分支度插值：随机取活跃格（分支密集）vs 取栈顶（DFS 长廊）
    const pickIdx = rng.next() < branching ? rng.int(0, active.length) : active.length - 1
    const cur = active[pickIdx]!
    const cx = cur % size
    const cy = Math.floor(cur / size)

    // 未访问邻居（顺序打乱 → 结构由种子决定）
    const candidates: number[] = []
    for (let di = 0; di < DIRS.length; di++) {
      const { dx, dy } = DIRS[di]!
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      if (visited[ny * size + nx] === 1) continue
      candidates.push(di)
    }
    rng.shuffle(candidates)

    if (candidates.length === 0) {
      active.splice(pickIdx, 1)
      continue
    }
    const dir = DIRS[candidates[0]!]!
    // 打通当前 cell 与邻居 cell 之间的墙位
    carve(2 * cx + 1 + dir.dx, 2 * cy + 1 + dir.dy)
    pushCell((cy + dir.dy) * size + (cx + dir.dx))
  }

  const maze: MazeData = {
    size,
    tiles,
    walls,
    start: { x: 0, y: 0 },
    goal: { x: size - 1, y: size - 1 },
    solutionLength: 0,
    deadEnds: 0,
  }
  maze.solutionLength = solveLength(maze)
  maze.deadEnds = countDeadEnds(maze)
  return maze
}
