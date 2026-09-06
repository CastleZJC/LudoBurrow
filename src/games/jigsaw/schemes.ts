// 拼图切块方案与关卡目录（验收返工「方案 = 关卡」模型）
// 方案 = 一个关卡：内置图库每图派生一个内置方案（bs-<imageId>，不入档，新增图片 = 自动新增关卡），
// 内置方案规格 = 每图自动优选的 rows×cols（optimize.ts，按图内容评分；未解析时回落复杂度兜底网格）。
// 用户方案（js-*，存档 jigsawSchemes 段）= 对内置图再次切片 / 自定义上传图，创建即追加为专题轨新关卡。
// 进度 = 专题轨（games['jigsaw:<topic>']）：levels 键 = 方案 id（删除重排不错位），经 core/level-manager 读写。
// 旧「激活方案 / 方案 50 关阶梯 / 独立进度槽」模型已随存档 v6 迁移退役。

import { loadSave, persistSave } from '@/core/save'
import type { JigsawSchemeData, JigsawSchemeParams, JigsawSchemeSource } from '@/core/save'
import { GALLERY, GALLERY_TOPICS, galleryEntry, type ComplexityLevel } from './gallery'
import type { GalleryTopicId } from './gallery'
import { bestSpecFor } from './optimize'
import { levelSeed } from '@/engines/rng'
import type { JigsawLevelConfig } from './level'

/** 专题轨 id：4 个内置图专题 + 自定义上传图（进度槽键 `jigsaw:<topic>`） */
export type JigsawTopicId = GalleryTopicId | 'custom'

/** 专题页签（选关页先选专题再显示该专题方案关卡；i18n key jigsaw.topic*） */
export const JIGSAW_TOPICS: readonly { id: JigsawTopicId; labelKey: string }[] = [
  ...GALLERY_TOPICS,
  { id: 'custom', labelKey: 'jigsaw.topicCustom' },
]

/** 内置方案 id 前缀（区别于用户方案 js-*；内置方案不入档，运行时从图库派生） */
export const BUILTIN_SCHEME_PREFIX = 'bs-'

/** 方案目录条目：内置派生 + 用户自建统一形状（createTopicLevel 的输入） */
export interface SchemeCatalogEntry {
  id: string
  name: string
  topic: JigsawTopicId
  source: JigsawSchemeSource
  params: JigsawSchemeParams
  builtin: boolean
}

/** 轨道 id 是否为合法拼图专题（选关页/容器兜底用） */
export function isJigsawTopicId(v: unknown): v is JigsawTopicId {
  return JIGSAW_TOPICS.some((t) => t.id === v)
}

/** 方案归专题：内置图 → 图的专题；自定义上传图 → custom */
export function topicOfSource(source: JigsawSchemeSource): JigsawTopicId {
  return source.kind === 'custom' ? 'custom' : galleryEntry(source.imageId).topic
}

// ---- 内置方案（每图一个，确定性派生）----

/**
 * 复杂度占位网格（验收四轮五：六档）：每档窗口内最接近正方形的规格，
 * 块数 9/12/16/25/30/36 严格递增；仅在「每图自动最优规格」（optimize.ts）尚未解析或分析失败时使用。
 */
function builtinGrid(complexity: ComplexityLevel): { rows: number; cols: number } {
  const table: Record<ComplexityLevel, { rows: number; cols: number }> = {
    1: { rows: 3, cols: 3 },
    2: { rows: 3, cols: 4 },
    3: { rows: 4, cols: 4 },
    4: { rows: 5, cols: 5 },
    5: { rows: 5, cols: 6 },
    6: { rows: 6, cols: 6 },
  }
  return table[complexity]
}

/**
 * 内置方案目录（GALLERY 顺序 = 专题内关卡顺序，确定性）。
 * rows/cols = 该图内容优选规格（预热后）；seed 与规格无关，恒由 imageId 派生 → 同图内容恒定。
 */
export function builtinSchemes(): SchemeCatalogEntry[] {
  return GALLERY.map((entry) => {
    const fallback = builtinGrid(entry.complexity)
    const spec = bestSpecFor(entry.id)
    return {
      id: `${BUILTIN_SCHEME_PREFIX}${entry.id}`,
      name: entry.id,
      topic: entry.topic,
      source: { kind: 'builtin' as const, imageId: entry.id },
      params: {
        rows: spec?.rows ?? fallback.rows,
        cols: spec?.cols ?? fallback.cols,
        tabDepth: 0.16,
        uniquenessThreshold: 18,
        seed: levelSeed(`jigsaw-builtin:${entry.id}`, 1),
      },
      builtin: true,
    }
  })
}

// ---- 用户方案 CRUD（存档 jigsawSchemes 段；进度统一在专题轨，方案不自持进度）----

export function listSchemes(): JigsawSchemeData[] {
  return loadSave().jigsawSchemes
}

export function getScheme(schemeId: string): JigsawSchemeData | undefined {
  return loadSave().jigsawSchemes.find((s) => s.id === schemeId)
}

let idSeq = 0

/** 新方案 id：js-<时间戳36>-<序号>（同毫秒创建不碰撞） */
function newSchemeId(): string {
  idSeq = (idSeq + 1) % 0x10000
  return `js-${Date.now().toString(36)}-${idSeq.toString(36)}`
}

/** 创建方案：创建即在所属专题轨末尾追加一个新关卡（无需激活） */
export function createScheme(
  name: string,
  source: JigsawSchemeSource,
  params: JigsawSchemeParams,
): JigsawSchemeData {
  const now = Date.now()
  const scheme: JigsawSchemeData = {
    id: newSchemeId(),
    name: name.trim() || `方案 ${listSchemes().length + 1}`,
    source,
    params,
    createdAt: now,
    updatedAt: now,
  }
  const save = loadSave()
  persistSave({ ...save, jigsawSchemes: [...save.jigsawSchemes, scheme] })
  return scheme
}

/** 删除方案：该专题关卡数随之收敛（其余方案关卡与全部进度零影响） */
export function deleteScheme(schemeId: string): void {
  const save = loadSave()
  const rest = save.jigsawSchemes.filter((s) => s.id !== schemeId)
  if (rest.length === save.jigsawSchemes.length) throw new RangeError(`jigsaw: 未知方案 ${schemeId}`)
  persistSave({ ...save, jigsawSchemes: rest })
}

// ---- 专题关卡目录（动态：关卡数 = 该专题方案数）----

/** 专题内有序方案列表：内置在前（图库顺序），用户方案按创建时间在后 */
export function schemesForTopic(topic: JigsawTopicId): SchemeCatalogEntry[] {
  const user = listSchemes()
    .filter((s) => topicOfSource(s.source) === topic)
    .map((s) => ({ id: s.id, name: s.name, topic, source: s.source, params: s.params, builtin: false }))
  const builtin = builtinSchemes().filter((s) => s.topic === topic)
  return [...builtin, ...user]
}

/** 专题关卡数（动态：新增方案 = 自动 +1；custom 专题可能为 0 = 空态） */
export function topicLevelCount(topic: JigsawTopicId): number {
  return schemesForTopic(topic).length
}

/** 专题第 n 关配置（n 1-based；seed = 方案固有 seed，同方案内容恒定、重排不变） */
export function createTopicLevel(n: number, topic: JigsawTopicId): JigsawLevelConfig {
  if (!isJigsawTopicId(topic)) throw new RangeError(`jigsaw: 非法专题 ${String(topic)}`)
  const list = schemesForTopic(topic)
  if (n < 1 || n > list.length) {
    throw new RangeError(`jigsaw: 非法关卡号 ${n}（专题 ${topic} 现有 ${list.length} 关）`)
  }
  const scheme = list[n - 1]!
  const config: JigsawLevelConfig = {
    gameId: 'jigsaw',
    n,
    track: topic,
    seed: scheme.params.seed,
    gridSize: scheme.params.rows,
    rows: scheme.params.rows,
    cols: scheme.params.cols,
    tabDepth: scheme.params.tabDepth,
    uniquenessThreshold: scheme.params.uniquenessThreshold,
    schemeId: scheme.id,
    imageId: scheme.source.kind === 'builtin' ? scheme.source.imageId : '',
  }
  if (scheme.source.kind === 'custom') config.assetId = scheme.source.assetId
  // AI 建议权重随方案透传（长度与 rows/cols 匹配时 instance 生效，M5）
  if (scheme.params.suggestion) config.suggestion = scheme.params.suggestion
  return config
}

/** 方案 id → 当前专题内序号（重试/下一关定位用；方案已删返回 null） */
export function schemeLevelNumber(schemeId: string): { topic: JigsawTopicId; n: number } | null {
  for (const { id } of JIGSAW_TOPICS) {
    const list = schemesForTopic(id)
    const idx = list.findIndex((s) => s.id === schemeId)
    if (idx >= 0) return { topic: id, n: idx + 1 }
  }
  return null
}
