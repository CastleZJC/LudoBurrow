// 拼图切块方案管理（技术架构 §11.8 版本与进度隔离 / 开发计划 3.6-3.7）
// 方案 = 一套切块规格 + 独立存档槽：创建即隔离、互不删除、回滚即续玩（F-17）。
// 读写一律经 core/save（load → 改 → persist，不可变风格）；只存算法参数与图片引用，不存图体（F-16/§15.1）。

import { loadSave, persistSave, defaultGameSave } from '@/core/save'
import type { JigsawSchemeData, JigsawSchemeParams, JigsawSchemeSource, SaveData } from '@/core/save'
import { mergeLevelRecord, TOTAL_LEVELS } from '@/core/level-manager'
import type { LevelRecord, LevelResult } from '@/core/types'
import { levelSeed } from '@/engines/rng'
import type { JigsawLevelConfig } from './level'

/** 方案模式总关数（与内置曲线一致 50 关：方案规格起步 + 每 5 关进阶一档） */
export const SCHEME_TOTAL_LEVELS = TOTAL_LEVELS

/** 方案网格阶梯：方案规格起步 + floor((n-1)/5)，封顶 12（引擎钳制上限） */
export function schemeGridFor(scheme: JigsawSchemeData, n: number, axis: 'rows' | 'cols'): number {
  return Math.min(scheme.params[axis] + Math.floor((n - 1) / 5), 12)
}

function readScheme(save: SaveData, schemeId: string): JigsawSchemeData {
  const scheme = save.jigsawSchemes.find((s) => s.id === schemeId)
  if (!scheme) throw new RangeError(`jigsaw: 未知方案 ${schemeId}`)
  return scheme
}

function writeSchemes(save: SaveData, schemes: JigsawSchemeData[], activeId: string | null): void {
  persistSave({ ...save, jigsawSchemes: schemes, activeJigsawSchemeId: activeId })
}

// ---- 查询 ----

export function listSchemes(): JigsawSchemeData[] {
  return loadSave().jigsawSchemes
}

export function getScheme(schemeId: string): JigsawSchemeData | undefined {
  return loadSave().jigsawSchemes.find((s) => s.id === schemeId)
}

/** 当前激活方案（null = 内置 50 关曲线） */
export function activeScheme(): JigsawSchemeData | null {
  const save = loadSave()
  if (save.activeJigsawSchemeId === null) return null
  return save.jigsawSchemes.find((s) => s.id === save.activeJigsawSchemeId) ?? null
}

// ---- 方案生命周期 ----

let idSeq = 0

/** 新方案 id：js-<时间戳36>-<序号>（同毫秒创建不碰撞） */
function newSchemeId(): string {
  idSeq = (idSeq + 1) % 0x10000
  return `js-${Date.now().toString(36)}-${idSeq.toString(36)}`
}

/** 创建方案并激活：新方案独立进度槽从第 1 关开始（切换方案 = 切换存档槽，§11.8） */
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
    progress: defaultGameSave(),
    createdAt: now,
    updatedAt: now,
  }
  const save = loadSave()
  writeSchemes(save, [...save.jigsawSchemes, scheme], scheme.id)
  return scheme
}

/** 删除方案：其他方案与内置进度零影响；删的是激活方案则回到内置曲线 */
export function deleteScheme(schemeId: string): void {
  const save = loadSave()
  const rest = save.jigsawSchemes.filter((s) => s.id !== schemeId)
  if (rest.length === save.jigsawSchemes.length) throw new RangeError(`jigsaw: 未知方案 ${schemeId}`)
  writeSchemes(save, rest, save.activeJigsawSchemeId === schemeId ? null : save.activeJigsawSchemeId)
}

/** 激活方案（回滚即续玩：方案进度槽原样保留） */
export function activateScheme(schemeId: string): void {
  const save = loadSave()
  readScheme(save, schemeId) // 校验存在，不存在抛错
  writeSchemes(save, save.jigsawSchemes, schemeId)
}

/** 回到内置 50 关曲线（全部方案进度保留，随时可切回） */
export function deactivateSchemes(): void {
  const save = loadSave()
  writeSchemes(save, save.jigsawSchemes, null)
}

// ---- 方案进度槽读写（与 games.jigsaw 及其他方案完全隔离） ----

export function getSchemeUnlockedCount(schemeId: string): number {
  const scheme = getScheme(schemeId)
  if (!scheme) return 1
  return Math.min(Math.max(1, scheme.progress.unlockedCount), SCHEME_TOTAL_LEVELS)
}

export function isSchemeLevelUnlocked(schemeId: string, n: number): boolean {
  return n >= 1 && n <= getSchemeUnlockedCount(schemeId)
}

export function getSchemeLevelRecord(schemeId: string, n: number): LevelRecord | undefined {
  return getScheme(schemeId)?.progress.levels[String(n)]
}

export function getSchemeLevelRecords(schemeId: string): Record<string, LevelRecord> {
  return getScheme(schemeId)?.progress.levels ?? {}
}

/** 记录方案内一次过关：只写方案进度槽（星级取高/用时取低/失误取低，与内置口径一致） */
export function recordSchemeResult(schemeId: string, result: LevelResult): LevelRecord {
  const save = loadSave()
  const scheme = readScheme(save, schemeId)
  const key = String(result.n)
  const next = mergeLevelRecord(scheme.progress.levels[key], result)
  const nextUnlocked = Math.min(Math.max(scheme.progress.unlockedCount, result.n + 1), SCHEME_TOTAL_LEVELS)
  const updated: JigsawSchemeData = {
    ...scheme,
    progress: { unlockedCount: nextUnlocked, levels: { ...scheme.progress.levels, [key]: next } },
    updatedAt: Date.now(),
  }
  writeSchemes(save, save.jigsawSchemes.map((s) => (s.id === schemeId ? updated : s)), save.activeJigsawSchemeId)
  return next
}

// ---- 方案关卡 ----

/** 方案模式关卡配置（seed 派生自方案 id：同方案同关恒定，跨方案互不相同） */
export function schemeLevel(scheme: JigsawSchemeData, n: number): JigsawLevelConfig {
  if (n < 1 || n > SCHEME_TOTAL_LEVELS) throw new RangeError(`jigsaw: 非法关卡号 ${n}`)
  const config: JigsawLevelConfig = {
    gameId: 'jigsaw',
    n,
    seed: levelSeed(`jigsaw-scheme-${scheme.id}`, n),
    gridSize: schemeGridFor(scheme, n, 'rows'),
    rows: schemeGridFor(scheme, n, 'rows'),
    cols: schemeGridFor(scheme, n, 'cols'),
    tabDepth: scheme.params.tabDepth,
    uniquenessThreshold: scheme.params.uniquenessThreshold,
    schemeId: scheme.id,
    imageId: scheme.source.kind === 'builtin' ? scheme.source.imageId : '',
  }
  if (scheme.source.kind === 'custom') config.assetId = scheme.source.assetId
  // AI 建议权重随方案透传（网格阶梯进阶后长度不匹配时 instance 自动回退本地算法，M5）
  if (scheme.params.suggestion) config.suggestion = scheme.params.suggestion
  return config
}
