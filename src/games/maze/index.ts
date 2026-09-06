// 迷宫游戏模块出口（GameModule 契约，技术架构 §8 / §12）
// mount 支持依赖注入（MazeMountDeps）供测试复用；平台注册路径不传 deps。

import type { GameModule } from '@/core/types'
import { createMazeLevel } from './level'
import { mountMaze } from './instance'

export const mazeModule: GameModule = {
  id: 'maze',
  name: 'game.maze',
  icon: 'assets/icons/maze.svg',
  createLevel: createMazeLevel,
  mount: (container, level, hooks) => mountMaze(container, level, hooks),
}

export {
  createMazeLevel,
  sizeForLevel,
  branchingForLevel,
  DEFAULT_MAZE_THEME,
  TOTAL_MAZE_LEVELS,
  type MazeLevelConfig,
  type MazeTheme,
} from './level'
export { mountMaze, type MazeMountDeps } from './instance'
export { THEME_PALETTES, THEME_LABEL_KEY, paletteSkin, loadTileSkin, tilePath, type TileSkin, type TileKind } from './theme'
export { createHero, tryMove, isAtGoal, animFrameOf, calcMazeStars, type Facing, type HeroState } from './walk'
export { computeView, cellCenter } from './view'
