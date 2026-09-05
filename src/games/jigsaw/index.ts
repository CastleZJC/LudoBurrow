// 拼图游戏模块出口（GameModule 契约，技术架构 §8）
// mount 支持依赖注入（JigsawMountDeps）供建图工具/测试复用；平台注册路径不传 deps。

import type { GameModule } from '@/core/types'
import { createJigsawLevel } from './level'
import { mountJigsaw } from './instance'

export const jigsawModule: GameModule = {
  id: 'jigsaw',
  name: 'game.jigsaw',
  icon: 'assets/icons/jigsaw.svg',
  createLevel: createJigsawLevel,
  mount: (container, level, hooks) => mountJigsaw(container, level, hooks),
}

export { createJigsawLevel, gridForLevel, type JigsawLevelConfig } from './level'
export { mountJigsaw, type JigsawMountDeps } from './instance'
export { JigsawBoard, type PieceZone, type PlaceOutcome, type AbandonStep, type HelpResult } from './board'
export { GALLERY, GALLERY_TOPICS, pickImageForLevel, sourceSrc, loadAnalysisImage, loadSourceImage } from './gallery'
export { computeLayout, hitTestSlot } from './layout'
export { buildPieceOutline } from './pieces'
