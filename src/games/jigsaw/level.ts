// 拼图关卡生成（开发计划 3.8 / 技术架构 §11.5）
// 难度曲线：网格规格阶梯递增（每约 5 关进阶一档：3×3 → 4×4 → … → 9×9，第 31 关起恒 9×9）
// 图片复杂度配对：低关（1-20）用主体突出的图、中关（21-40）均衡、高关（41-50）细节丰富色彩相近。
// 确定性：seed = levelSeed('jigsaw', n)，切块参数由 seed 派生，同关卡方案恒定。

import type { BaseLevelConfig } from '@/core/types'
import { levelSeed } from '@/engines/rng'
import { pickImageForLevel } from './gallery'

export interface JigsawLevelConfig extends BaseLevelConfig {
  gameId: 'jigsaw'
  /** 网格规格（内置曲线：行 = 列；方案模式以 rows 为准，rows/cols 可不同） */
  gridSize: number
  /** 内置图库条目 id（gallery.ts 单一出处；custom 来源方案为空串） */
  imageId: string
  // ---- 方案模式可选字段（schemeLevel 填充；§11.8）----
  /** 行数（缺省 = gridSize） */
  rows?: number
  /** 列数（缺省 = gridSize） */
  cols?: number
  /** 锯齿深度（缺省用引擎默认 0.16） */
  tabDepth?: number
  /** 唯一性阈值（缺省用引擎默认 18） */
  uniquenessThreshold?: number
  /** 所属方案 id（无 = 内置关卡） */
  schemeId?: string
  /** 自定义素材仓库引用（kind=custom 方案；instance 经 services/assetRepo 加载） */
  assetId?: string
  /** AI 建议切块权重（M5 §14.5；长度与当前关 rows/cols 匹配时生效，否则本地梯度算法） */
  suggestion?: {
    rowWeights: number[]
    colWeights: number[]
  }
}

/** 网格阶梯：n ∈ [1,50] → min(3 + floor((n-1)/5), 9) */
export function gridForLevel(n: number): number {
  return Math.min(3 + Math.floor((n - 1) / 5), 9)
}

export function createJigsawLevel(n: number): JigsawLevelConfig {
  if (n < 1 || n > 50) throw new RangeError(`jigsaw: 非法关卡号 ${n}`)
  return {
    gameId: 'jigsaw',
    n,
    seed: levelSeed('jigsaw', n),
    gridSize: gridForLevel(n),
    imageId: pickImageForLevel(n).id,
  }
}
