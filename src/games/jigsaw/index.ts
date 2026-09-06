// 拼图游戏模块出口（GameModule 契约，技术架构 §8）
// 专题轨（4 内置 + custom）：选关页先选专题，关卡数按该专题方案数动态生成（新增方案 = 自动新增关卡）。
// mount 支持依赖注入（JigsawMountDeps）供建图工具/测试复用；平台注册路径不传 deps。

import type { GameModule } from '@/core/types'
import { createTopicLevel, isJigsawTopicId, JIGSAW_TOPICS, topicLevelCount } from './schemes'
import type { JigsawTopicId } from './schemes'
import { mountJigsaw } from './instance'

export const jigsawModule: GameModule = {
  id: 'jigsaw',
  name: 'game.jigsaw',
  icon: 'assets/icons/jigsaw.svg',
  // 专题页签：id = JigsawTopicId = 进度轨后缀（jigsaw:<topic>）
  tracks: JIGSAW_TOPICS.map(({ id, labelKey }) => ({ id, labelKey })),
  // 关卡数动态：内置方案（每图一个）+ 用户切片方案；非法/缺省轨回落首专题
  levelCount: (track) => topicLevelCount(isJigsawTopicId(track) ? track : 'animals'),
  createLevel: (n, track) => createTopicLevel(n, isJigsawTopicId(track) ? track : ('animals' as JigsawTopicId)),
  mount: (container, level, hooks) => mountJigsaw(container, level, hooks),
}

export type { JigsawLevelConfig } from './level'
export { mountJigsaw, type JigsawMountDeps } from './instance'
export { JigsawBoard, type PieceZone, type PlaceOutcome, type AbandonStep, type HelpResult } from './board'
export { GALLERY, GALLERY_TOPICS, sourceSrc, loadAnalysisImage, loadSourceImage } from './gallery'
// 切块规格自动优选（验收返工「每图自动选最优切块」）：启动/选关页预热，内置方案规格读缓存
export { warmBuiltinOptima } from './optimize'
export type { GridSpec } from './optimize'
export { computeLayout, hitTestSlot } from './layout'
export { buildPieceOutline } from './pieces'
export {
  JIGSAW_TOPICS,
  BUILTIN_SCHEME_PREFIX,
  builtinSchemes,
  createScheme,
  deleteScheme,
  getScheme,
  listSchemes,
  schemesForTopic,
  topicLevelCount,
  topicOfSource,
  createTopicLevel,
  schemeLevelNumber,
} from './schemes'
export type { JigsawTopicId, SchemeCatalogEntry } from './schemes'
