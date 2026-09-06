// 迷宫平台链路测试（开发计划 4.6：主菜单入口 / 选关 50 关与锁定 / 进关配置 / 容器内真实可玩到结算）
// 生产路径端到端：平台注册 → 种子生成迷宫 → 键盘通关 → 结算面板 + 写档解锁。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { registerGame, unregisterGame } from '@/core/game-registry'
import { mazeModule } from '@/games/maze'
import { createMazeLevel, type MazeLevelConfig } from '@/games/maze/level'
import type { Facing } from '@/games/maze/walk'
import { generateMaze, type MazeData } from '@/engines/maze-generator'
import { usePlatformStore } from '@/stores/platform'
import { getUnlockedCount } from '@/core/level-manager'
import { i18n } from '@/i18n'
import LevelSelect from '@/components/LevelSelect.vue'
import GameContainer from '@/components/GameContainer.vue'
import { mountWithApp } from './helpers'

const CODE_OF: Record<Facing, string> = {
  up: 'ArrowUp',
  right: 'ArrowRight',
  down: 'ArrowDown',
  left: 'ArrowLeft',
}

function key(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }))
}

/** start→goal 最短方向序列（cell BFS，与引擎同源墙位口径） */
function bfsPath(maze: MazeData): Facing[] {
  const { size, walls, tiles } = maze
  const startIdx = maze.start.y * size + maze.start.x
  const goalIdx = maze.goal.y * size + maze.goal.x
  const prev = new Int32Array(size * size).fill(-1)
  const seen = new Uint8Array(size * size)
  const queue: number[] = [startIdx]
  seen[startIdx] = 1
  const DIRS: { dir: Facing; dx: number; dy: number }[] = [
    { dir: 'up', dx: 0, dy: -1 },
    { dir: 'right', dx: 1, dy: 0 },
    { dir: 'down', dx: 0, dy: 1 },
    { dir: 'left', dx: -1, dy: 0 },
  ]
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (cur === goalIdx) break
    const cx = cur % size
    const cy = Math.floor(cur / size)
    for (const { dx, dy } of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      if (seen[ny * size + nx]) continue
      if (walls[(2 * cy + 1 + dy) * tiles + (2 * cx + 1 + dx)] === 1) continue
      seen[ny * size + nx] = 1
      prev[ny * size + nx] = cur
      queue.push(ny * size + nx)
    }
  }
  const path: Facing[] = []
  let cur = goalIdx
  while (cur !== startIdx) {
    const p = prev[cur]!
    const dx = (cur % size) - (p % size)
    const dy = Math.floor(cur / size) - Math.floor(p / size)
    path.unshift(dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up')
    cur = p
  }
  return path
}

describe('MainMenu 迷宫入口', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    registerGame(mazeModule)
  })
  afterEach(() => unregisterGame('maze'))

  it('渲染迷宫入口（图标+名称）并进入选关视图', async () => {
    const platform = usePlatformStore()
    const { default: MainMenu } = await import('@/components/MainMenu.vue')
    const wrapper = mountWithApp(MainMenu, { attachTo: document.body })

    const entry = wrapper.find('[data-game="maze"]')
    expect(entry.exists()).toBe(true)
    expect(entry.text()).toContain(i18n.global.t('game.maze'))

    await entry.trigger('click')
    expect(platform.view).toBe('select')
    expect(platform.currentGameId).toBe('maze')
    wrapper.unmount()
  })
})

describe('LevelSelect 迷宫 50 关', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    registerGame(mazeModule)
  })
  afterEach(() => unregisterGame('maze'))

  it('50 关网格：第 1 关解锁、后续锁定、无拼图专属方案入口', () => {
    const platform = usePlatformStore()
    platform.openGameSelect('maze')
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'maze' } })

    expect(wrapper.findAll('[data-level]')).toHaveLength(50)
    expect(wrapper.find('[data-level="1"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-level="2"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-nav="schemes"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('进关：config 携带难度曲线参数（size/branching/theme）且同关种子确定', async () => {
    const platform = usePlatformStore()
    platform.openGameSelect('maze')
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'maze' } })

    await wrapper.find('[data-level="1"]').trigger('click')
    expect(platform.view).toBe('game')
    const cfg = platform.currentLevelConfig as MazeLevelConfig
    expect(cfg).toMatchObject({ gameId: 'maze', n: 1, size: 5, branching: 0.15, theme: 'castle' })
    expect(cfg.seed).toBe(createMazeLevel(1).seed) // 同关同种子（§12.1 可复现）
    wrapper.unmount()
  })
})

describe('GameContainer 迷宫真实实例（生产路径）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    registerGame(mazeModule)
  })
  afterEach(() => unregisterGame('maze'))

  it('挂载即可玩：沿最短路径按键 → 结算面板 3 星 + 写档解锁第 2 关', async () => {
    const platform = usePlatformStore()
    const level = createMazeLevel(1)
    // 轨迹随机（验收返工）：扰动固定 0 → 本局种子 = 基准种子，与外部同源重建可复现通关
    const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    platform.openLevel(level)
    const wrapper = mountWithApp(GameContainer, { props: { level }, attachTo: document.body })
    randSpy.mockRestore()

    // 挂载宿主内渲染迷宫 HUD 与画布（平台注册路径不注入 deps → 种子生成 + 色板皮肤）
    const host = document.querySelector('[data-role="mount-host"]') as HTMLElement
    expect(host.querySelector('canvas.mz-canvas')).not.toBeNull()
    expect(host.querySelector('[data-mz-theme="castle"]')!.getAttribute('aria-pressed')).toBe('true')

    // 与实现同源重建（基准 seed 同参确定性）求最短路径，逐键通关
    const maze = generateMaze(level.seed, level.size, { branching: level.branching })
    for (const dir of bfsPath(maze)) key(CODE_OF[dir])
    await new Promise((r) => setTimeout(r, 0))

    expect(platform.settleInfo).not.toBeNull()
    expect(platform.settleInfo?.isFail).toBe(false)
    expect(platform.settleInfo?.result.stars).toBe(3) // 最短路 ≤ 1.2×solutionLength
    expect(getUnlockedCount('maze')).toBe(2)
    expect(wrapper.find('[data-role="settle"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('轨迹随机：扰动 ≠ 0 时基准种子路径不再通关（同关每局轨迹独立，验收返工 F-20）', async () => {
    const platform = usePlatformStore()
    const level = createMazeLevel(1)
    const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    platform.openLevel(level)
    const wrapper = mountWithApp(GameContainer, { props: { level }, attachTo: document.body })
    randSpy.mockRestore()

    // 本局迷宫 = 基准种子叠加扰动生成，与基准迷宫不同构：
    // 沿基准路径逐键会在中途撞墙中断，不产生结算、不解锁
    const maze = generateMaze(level.seed, level.size, { branching: level.branching })
    for (const dir of bfsPath(maze)) key(CODE_OF[dir])
    await new Promise((r) => setTimeout(r, 0))

    expect(platform.settleInfo).toBeNull()
    expect(getUnlockedCount('maze')).toBe(1)
    wrapper.unmount()
  })
})
