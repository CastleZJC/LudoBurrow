// 迷宫游戏实例（技术架构 §12 / 开发计划 4.2-4.4）
// 分层渲染：tilemap 全图一次性画入离屏画布缓存，主画布每帧只贴缓存 + 绘角色（§12.3 分层绘制）。
// 输入：方向键 / WASD（keydown 归一化，箭头 preventDefault 防滚动）。
// 结算（§12.5）：到出口 onComplete（步数相对解长星级；meta 携带 steps/size/theme）。
// 皮肤（theme.ts）：paletteSkin 先行渲染（零等待），PNG 皮肤异步就绪后整体重画；
//                  测试经 deps 注入固定迷宫与皮肤，完全绕开资源加载。

import type { BaseLevelConfig, GameHooks, GameInstance } from '@/core/types'
import { generateMaze, type MazeData } from '@/engines/maze-generator'
import { i18n } from '@/i18n'
import type { MazeLevelConfig } from './level'
import { THEME_LABEL_KEY, THEME_PALETTES, loadTileSkin, paletteSkin, type TileSkin, type TileKind } from './theme'
import { animFrameOf, calcMazeStars, createHero, isAtGoal, tryMove, type Facing, type HeroState } from './walk'
import { cellCenter, computeView, type MazeView } from './view'

/** 挂载依赖注入（测试用；生产缺省 = 种子生成迷宫 + 皮肤加载） */
export interface MazeMountDeps {
  maze?: MazeData
  skin?: TileSkin
}

type Phase = 'idle' | 'running' | 'paused' | 'done' | 'destroyed'

const KEY_FACING: Record<string, Facing> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
}

/** 当前位置 → 出口的剩余最短步数（进度条口径；重算 BFS 成本 < 0.1ms） */
function distToGoal(maze: MazeData, cx: number, cy: number): number {
  const { size, walls, tiles } = maze
  const dist = new Int32Array(size * size).fill(-1)
  const queue = new Int32Array(size * size)
  let head = 0
  let tail = 0
  const start = cy * size + cx
  queue[tail++] = start
  dist[start] = 0
  while (head < tail) {
    const cur = queue[head++]!
    const x = cur % size
    const y = Math.floor(cur / size)
    if (x === maze.goal.x && y === maze.goal.y) return dist[cur]!
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      if (dist[ny * size + nx] !== -1) continue
      if (walls[(2 * y + 1 + dy) * tiles + (2 * x + 1 + dx)] === 1) continue
      dist[ny * size + nx] = dist[cur]! + 1
      queue[tail++] = ny * size + nx
    }
  }
  return maze.solutionLength // 不可达不会发生（完美迷宫全连通）；保守回退满距
}

function el(tag: string, cls?: string): HTMLElement {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  return node
}

export function mountMaze(
  container: HTMLElement,
  level: BaseLevelConfig,
  hooks: GameHooks,
  deps: MazeMountDeps = {},
): GameInstance {
  const cfg = level as MazeLevelConfig
  const maze = deps.maze ?? generateMaze(cfg.seed, cfg.size, { branching: cfg.branching })
  let phase: Phase = 'idle'
  let hero: HeroState = createHero(maze)
  let skin: TileSkin = deps.skin ?? paletteSkin(cfg.theme)
  let view: MazeView
  let dirty = true
  let rafId = 0

  // ---- DOM 骨架（HUD + 画布）----
  const root = el('div', 'mz-root')
  const hud = el('div', 'mz-hud')
  const sizeEl = el('span', 'mz-size')
  sizeEl.dataset.mz = 'size'
  const themeEl = el('span', 'mz-theme')
  themeEl.dataset.mz = 'theme'
  const stepsEl = el('span', 'mz-steps')
  stepsEl.dataset.mz = 'steps'
  const mistakesEl = el('span', 'mz-mistakes')
  mistakesEl.dataset.mz = 'mistakes'
  const hintEl = el('span', 'mz-hint')
  hintEl.textContent = i18n.global.t('maze.hint')
  hud.append(sizeEl, themeEl, stepsEl, mistakesEl, hintEl)

  const canvas = el('canvas', 'mz-canvas') as HTMLCanvasElement
  root.append(hud, canvas)
  container.appendChild(root)

  const ctxMaybe = canvas.getContext('2d')
  if (!ctxMaybe) {
    root.appendChild(errNode(i18n.global.t('maze.loadError')))
    phase = 'destroyed'
    return stubInstance()
  }
  const ctx = ctxMaybe
  const board = document.createElement('canvas')
  const bctx = board.getContext('2d')!
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1

  function errNode(msg: string): HTMLElement {
    const node = el('div', 'mz-error')
    node.dataset.mz = 'error'
    node.textContent = msg
    return node
  }

  function refreshHud(): void {
    sizeEl.textContent = `${cfg.size}×${cfg.size}`
    themeEl.textContent = i18n.global.t(THEME_LABEL_KEY[cfg.theme])
    stepsEl.textContent = `${i18n.global.t('settle.steps')} ${hero.steps}`
    mistakesEl.textContent = `${i18n.global.t('common.mistakes')} ${hero.bumps}`
  }

  /** tilemap 奇偶语义 → 瓦片类型（墙 / 出口 / 起点 / 地板） */
  function tileKindAt(tx: number, ty: number): TileKind {
    if (maze.walls[ty * maze.tiles + tx] === 1) return 'wall'
    if (tx === 2 * maze.goal.x + 1 && ty === 2 * maze.goal.y + 1) return 'goal'
    if (tx === 2 * maze.start.x + 1 && ty === 2 * maze.start.y + 1) return 'start'
    return 'floor'
  }

  /** 尺寸变化：重算视图并整体重画离屏棋盘缓存（皮肤更换后同样调用） */
  function rebuildBoard(): void {
    const cssW = Math.max(root.clientWidth || 0, 480)
    const cssH = Math.max(root.clientHeight || 0, 360)
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    view = computeView(cssW, cssH, maze.tiles)
    board.width = view.tile * maze.tiles
    board.height = view.tile * maze.tiles
    for (let ty = 0; ty < maze.tiles; ty++) {
      for (let tx = 0; tx < maze.tiles; tx++) {
        skin.drawTile(bctx, tileKindAt(tx, ty), tx * view.tile, ty * view.tile, view.tile)
      }
    }
    dirty = true
  }

  function paint(): void {
    if (phase === 'destroyed') return
    const cssW = canvas.width / dpr
    const cssH = canvas.height / dpr
    ctx.fillStyle = THEME_PALETTES[cfg.theme].bg
    ctx.fillRect(0, 0, cssW, cssH)
    ctx.drawImage(board, view.ox, view.oy)
    // 角色：中心对齐 cell 瓦片，尺寸略放大（俯视小人稍压墙缘，视觉正常）
    const c = cellCenter(hero.cx, hero.cy, view)
    const s = view.tile * 1.6
    skin.drawHero(ctx, hero.facing, animFrameOf(hero), c.x - s / 2, c.y - s / 2, s)
    dirty = false
  }

  function requestPaint(): void {
    if (rafId !== 0 || phase === 'destroyed') return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      if (dirty) paint()
    })
  }

  function finish(): void {
    phase = 'done'
    hooks.onComplete({
      gameId: 'maze',
      n: cfg.n,
      elapsedMs: 0, // 平台 timer 权威覆写（core/types 约定，与 keygame/jigsaw 同口径）
      mistakes: hero.bumps,
      stars: calcMazeStars(hero.steps, maze.solutionLength),
      meta: { steps: hero.steps, size: cfg.size, theme: cfg.theme, solutionLength: maze.solutionLength },
    })
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (phase !== 'running') return
    const dir = KEY_FACING[event.code]
    if (!dir) return
    event.preventDefault()
    const next = tryMove(maze, hero, dir)
    hero = next.hero
    refreshHud()
    if (next.moved) {
      hooks.onProgress({
        gameId: 'maze',
        n: cfg.n,
        done: Math.max(0, maze.solutionLength - distToGoal(maze, hero.cx, hero.cy)),
        total: maze.solutionLength,
      })
    }
    if (isAtGoal(maze, hero)) {
      paint()
      finish()
      return
    }
    dirty = true
    requestPaint()
  }

  const onResize = (): void => {
    if (phase === 'destroyed') return
    rebuildBoard()
    requestPaint()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', onResize)

  rebuildBoard()
  refreshHud()
  paint()

  // PNG 皮肤异步升级（deps 注入皮肤时跳过；失败保持色板兜底，§12.3 可靠性分支）
  if (!deps.skin) {
    void loadTileSkin(cfg.theme).then((s) => {
      if (phase === 'destroyed') return
      skin = s
      rebuildBoard()
      requestPaint()
    })
  }

  return {
    start() {
      if (phase !== 'idle') return
      phase = 'running'
    },
    pause() {
      if (phase !== 'running') return
      phase = 'paused'
    },
    resume() {
      if (phase !== 'paused') return
      phase = 'running'
    },
    destroy() {
      if (phase === 'destroyed') return
      phase = 'destroyed'
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
      if (rafId !== 0) cancelAnimationFrame(rafId)
      rafId = 0
      root.remove()
    },
  }
}

function stubInstance(): GameInstance {
  return {
    start() {},
    pause() {},
    resume() {},
    destroy() {},
  }
}
