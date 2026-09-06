// 拼图关卡配置类型（验收返工「方案 = 关卡」模型）
// 关卡 = 切片方案：专题轨（animals/space/scenery/cartoon/custom）内第 n 关 = 第 n 个方案，
// 由 schemes.createTopicLevel 生成；关卡数按方案数动态（新增方案 = 自动新增关卡）。
// 旧「1-50 固定曲线」（gridForLevel/createJigsawLevel）已随存档 v6 迁移退役。

import type { BaseLevelConfig } from '@/core/types'

export interface JigsawLevelConfig extends BaseLevelConfig {
  gameId: 'jigsaw'
  /** 网格规格（兼容字段 = rows；方案模式以 rows/cols 为准，可不同） */
  gridSize: number
  /** 内置图库条目 id（gallery.ts 单一出处；custom 来源方案为空串） */
  imageId: string
  // ---- 方案参数（createTopicLevel 填充）----
  /** 行数（缺省 = gridSize） */
  rows?: number
  /** 列数（缺省 = gridSize） */
  cols?: number
  /** 锯齿深度（缺省用引擎默认 0.16） */
  tabDepth?: number
  /** 唯一性阈值（缺省用引擎默认 18） */
  uniquenessThreshold?: number
  /** 所属方案 id（内置方案 bs-<imageId> / 用户方案 js-*；进度记录键） */
  schemeId?: string
  /** 自定义素材仓库引用（kind=custom 方案；instance 经 services/assetRepo 加载） */
  assetId?: string
  /** AI 建议切块权重（M5 §14.5；长度与 rows/cols 匹配时生效，否则本地梯度算法） */
  suggestion?: {
    rowWeights: number[]
    colWeights: number[]
  }
}
