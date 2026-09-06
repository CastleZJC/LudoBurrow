// 存档：localStorage 单一 key + schema version + migration 链 + JSON 导入导出（技术架构 §13.2）
// 健壮性原则：损坏拒绝并提示（不静默清空）；导入非法数据整体拒绝，不部分应用。

import type { LevelRecord } from './types'

export const SAVE_KEY = 'ludoburrow/save'
export const SCHEMA_VERSION = 7

/** AI Provider 配置（设置页录入，存本机；导出默认脱敏） */
export interface AiConfig {
  provider: 'qwen' | 'glm' | 'custom'
  baseURL: string
  model: string
  apiKey: string
}

export interface TimeLimitData {
  mode: 'off' | 'competition' | 'antiAddiction'
  limitMs: number
  lockMs: number
}

/** 设置段（settings.ts 为唯一读写口） */
export interface SettingsData {
  locale: 'zh-CN' | 'en-US'
  timeLimit: TimeLimitData
  ai?: AiConfig
  /** 迷宫瓦片主题（HUD 内切换写入；缺省 = 城堡。字面量与 games/maze/level.ts MAZE_THEMES 同构，存档自持形状） */
  mazeTheme?: 'castle' | 'garden' | 'snow' | 'volcano' | 'ocean' | 'jungle' | 'station' | 'mine'
}

/** 自定义拼音词条（结构同引擎 PinyinEntry；存档自持形状，不反向依赖 engines） */
export interface WordbankPinyinEntry {
  word: string
  /** 音节空格分隔的小写拼音串，如 'xue xiao' */
  pinyin: string
}

/**
 * 自定义词表配置（键盘「英文单词 / 中文拼音」模式消费）。
 * 缺省 / 空级别回退引擎内嵌默认词表；本地单机共享一份（无权限分割），
 * 服务器版按用户隔离（二期，经 services wordbankRepo 分叉）。
 */
export interface WordbankConfig {
  /** 英文词表覆盖：键 = 词长 '3'..'8'（≥8 归 '8'）；值 = 该级词表（纯字母） */
  english?: Record<string, string[]>
  /** 拼音词表覆盖：键 = 等级 '1'..'3'；值 = 词条列表 */
  pinyin?: Record<string, WordbankPinyinEntry[]>
}

/** 单游戏进度段 */
export interface GameSaveData {
  /** 已解锁关数（顺序解锁：通过第 n 关解锁 n+1） */
  unlockedCount: number
  /** 各关最佳成绩，key = 关卡号字符串 */
  levels: Record<string, LevelRecord>
}

/** 拼图切块方案参数（§11.6 引擎入参；方案 = 一套切块规格 + 独立进度槽） */
export interface JigsawSchemeParams {
  rows: number
  cols: number
  tabDepth: number
  uniquenessThreshold: number
  seed: number
  /** AI 切块建议权重（M5 §14.5；归一化正数，长度与起步 rows/cols 匹配；缺省 = 纯本地算法） */
  suggestion?: {
    rowWeights: number[]
    colWeights: number[]
  }
}

/** 方案图片来源：内置图库条目 / 自定义素材仓库引用（只存引用不存图体，§15.1） */
export type JigsawSchemeSource =
  | { kind: 'builtin'; imageId: string }
  | { kind: 'custom'; assetId: string }

/** 拼图切块方案（v6 起「方案 = 关卡」：进度统一记在专题轨 games['jigsaw:<topic>'].levels[<方案id>]） */
export interface JigsawSchemeData {
  id: string
  name: string
  source: JigsawSchemeSource
  params: JigsawSchemeParams
  createdAt: number
  updatedAt: number
}

/** 存档根结构 */
export interface SaveData {
  version: number
  settings: SettingsData
  games: Record<string, GameSaveData>
  /** 拼图用户自建方案列表（v6；进度不随方案走，统一记在专题轨） */
  jigsawSchemes: JigsawSchemeData[]
  /** 自定义词表配置（v5；缺省 = 全部用引擎默认词表） */
  wordbank?: WordbankConfig
}

/** 迁移步骤：把 from 版本数据升到 from+1（链式追赶到当前版本） */
interface Migration {
  from: number
  migrate(data: Record<string, unknown>): Record<string, unknown>
}

// MIGRATIONS 追加规则：新版本只加不改——push { from: n, migrate }，迁移用例同步入 tests/unit/save.spec.ts
const MIGRATIONS: Migration[] = [
  {
    // v1 → v2：新增拼图方案段（M3.7 版本与进度隔离）；旧档方案列表为空、激活位归零（内置曲线）
    from: 1,
    migrate(data) {
      return { ...data, version: 2, jigsawSchemes: [], activeJigsawSchemeId: null }
    },
  },
  {
    // v2 → v3：移除音效开关（音效未实现，移入二期规划；字段从设置段删除）
    from: 2,
    migrate(data) {
      const settings = { ...(data.settings as Record<string, unknown>) }
      delete settings.soundEnabled
      return { ...data, version: 3, settings }
    },
  },
  {
    // v3 → v4：键盘改多轨模型（方案 B：四模式各独立 1-50 进度轨，槽键 `keygame:<mode>`）。
    // 旧单轨 `games.keygame`（按关卡号段派生模式）与新模型语义不兼容，删除旧槽；各模式轨首次记录时按需新建。
    from: 3,
    migrate(data) {
      const games = { ...(data.games as Record<string, unknown>) }
      delete games.keygame
      return { ...data, version: 4, games }
    },
  },
  {
    // v4 → v5：新增自定义词表配置段（键盘英文/拼音模式可覆盖默认词表）。
    // 纯附加可选字段：旧档无 wordbank 即「全用默认词表」，迁移仅升版本号，不改数据形状。
    from: 4,
    migrate(data) {
      return { ...data, version: 5 }
    },
  },
  {
    // v5 → v6：拼图改「方案 = 关卡」模型（验收返工：关卡数按切片方案动态生成）。
    // - games.jigsaw（旧 1-50 曲线槽）退役：旧第 n 关与新模型方案无对应关系，进度不可映射，诚实丢弃
    // - 方案 progress 字段退役：第 1 关成绩搬到专题轨 games['jigsaw:<topic>'].levels[<方案id>]；
    //   第 2 关起属旧「50 关阶梯」模型不再兼容，丢弃；专题已搬 k 条 → unlockedCount = k + 1
    // - activeJigsawSchemeId 退役（激活方案概念取消：所有方案直接是专题轨内关卡）
    from: 5,
    migrate(data) {
      const games = { ...(data.games as Record<string, unknown>) }
      delete games.jigsaw
      const moved: Record<string, { unlockedCount: number; levels: Record<string, unknown> }> = {}
      const nextSchemes: unknown[] = []
      for (const scheme of Array.isArray(data.jigsawSchemes) ? data.jigsawSchemes : []) {
        if (!isRecord(scheme)) continue
        const progress = isRecord(scheme.progress) ? scheme.progress : null
        const first = progress && isRecord(progress.levels) ? progress.levels['1'] : undefined
        if (first !== undefined) {
          const slot = `jigsaw:${legacyTopicOf(scheme.source)}`
          const slotData = moved[slot] ?? { unlockedCount: 1, levels: {} }
          slotData.levels[scheme.id as string] = first
          slotData.unlockedCount = Object.keys(slotData.levels).length + 1
          moved[slot] = slotData
        }
        const rest = { ...scheme }
        delete rest.progress
        nextSchemes.push(rest)
      }
      const out: Record<string, unknown> = {
        ...data,
        version: 6,
        games: { ...games, ...moved },
        jigsawSchemes: nextSchemes,
      }
      delete out.activeJigsawSchemeId
      return out
    },
  },
  {
    // v6 → v7：新增迷宫主题设置（验收返工 F-20：HUD 内切换并记住上次，所有关共享单一进度）。
    // 纯附加可选字段：旧档无 mazeTheme 即默认城堡，迁移仅升版本号，不改数据形状。
    from: 6,
    migrate(data) {
      return { ...data, version: 7 }
    },
  },
]

/** v5→v6 迁移专用：方案归属专题推断（builtin imageId 约定 `<topic>-NN`，与 gallery.ts 一致；其余归 custom） */
const LEGACY_TOPICS = ['animals', 'space', 'scenery', 'cartoon']
function legacyTopicOf(source: unknown): string {
  if (isRecord(source) && source.kind === 'builtin' && typeof source.imageId === 'string') {
    const prefix = source.imageId.split('-')[0] ?? ''
    if (LEGACY_TOPICS.includes(prefix)) return prefix
  }
  return 'custom'
}

export function defaultSave(): SaveData {
  return {
    version: SCHEMA_VERSION,
    settings: defaultSettings(),
    games: {},
    jigsawSchemes: [],
  }
}

/** 默认设置（单一出处定义；settings.ts re-export 供设置域使用，避免循环依赖） */
export function defaultSettings(): SettingsData {
  return {
    locale: 'zh-CN',
    timeLimit: { mode: 'off', limitMs: 120_000, lockMs: 300_000 },
  }
}

/** 无档游戏段默认值（level-manager 首次记录时用） */
export function defaultGameSave(): GameSaveData {
  return { unlockedCount: 1, levels: {} }
}

// ---- 结构校验（导入与加载共用；严格形状校验，非法即整体拒绝） ----

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validateLevelRecord(v: unknown): v is LevelRecord {
  return (
    isRecord(v) &&
    typeof v.stars === 'number' && Number.isFinite(v.stars) &&
    typeof v.bestMs === 'number' && Number.isFinite(v.bestMs) &&
    typeof v.bestMistakes === 'number' && Number.isFinite(v.bestMistakes)
  )
}

/** 迷宫主题合法值（与 games/maze/level.ts MAZE_THEMES 同构；验收返工二轮扩至 8 主题） */
const MAZE_THEME_IDS = [
  'castle', 'garden', 'snow', 'volcano', 'ocean', 'jungle', 'station', 'mine',
] as const

function validateGameSave(v: unknown): v is GameSaveData {
  if (!isRecord(v)) return false
  if (typeof v.unlockedCount !== 'number' || !Number.isFinite(v.unlockedCount)) return false
  if (!isRecord(v.levels)) return false
  return Object.values(v.levels).every(validateLevelRecord)
}

function validateAi(v: unknown): v is AiConfig {
  return (
    isRecord(v) &&
    (v.provider === 'qwen' || v.provider === 'glm' || v.provider === 'custom') &&
    typeof v.baseURL === 'string' &&
    typeof v.model === 'string' &&
    typeof v.apiKey === 'string'
  )
}

function validateTimeLimit(v: unknown): v is TimeLimitData {
  return (
    isRecord(v) &&
    (v.mode === 'off' || v.mode === 'competition' || v.mode === 'antiAddiction') &&
    typeof v.limitMs === 'number' && Number.isFinite(v.limitMs) && v.limitMs > 0 &&
    typeof v.lockMs === 'number' && Number.isFinite(v.lockMs) && v.lockMs > 0
  )
}

function validateSettings(v: unknown): v is SettingsData {
  return (
    isRecord(v) &&
    (v.locale === 'zh-CN' || v.locale === 'en-US') &&
    validateTimeLimit(v.timeLimit) &&
    (v.ai === undefined || validateAi(v.ai)) &&
    (v.mazeTheme === undefined || (typeof v.mazeTheme === 'string' && (MAZE_THEME_IDS as readonly string[]).includes(v.mazeTheme)))
  )
}

function validateWordbankPinyinEntry(v: unknown): v is WordbankPinyinEntry {
  return (
    isRecord(v) &&
    typeof v.word === 'string' && v.word.length > 0 &&
    typeof v.pinyin === 'string' && /^[a-z]+( [a-z]+)*$/.test(v.pinyin)
  )
}

/** 词表配置校验：键限于合法分级，值为纯字母词 / 合法拼音词条（空对象合法 = 全用默认） */
function validateWordbank(v: unknown): v is WordbankConfig {
  if (!isRecord(v)) return false
  if (v.english !== undefined) {
    if (!isRecord(v.english)) return false
    for (const [key, words] of Object.entries(v.english)) {
      if (!/^[3-8]$/.test(key)) return false
      if (!Array.isArray(words)) return false
      if (!words.every((w) => typeof w === 'string' && /^[A-Za-z]+$/.test(w))) return false
    }
  }
  if (v.pinyin !== undefined) {
    if (!isRecord(v.pinyin)) return false
    for (const [key, entries] of Object.entries(v.pinyin)) {
      if (!/^[1-3]$/.test(key)) return false
      if (!Array.isArray(entries)) return false
      if (!entries.every(validateWordbankPinyinEntry)) return false
    }
  }
  return true
}

/** 建议权重数组：有限正数且长度匹配网格数（归一化由写入方保证，校验容差不检查和值） */
function suggestionWeightsOk(v: unknown, len: number): v is number[] {
  return (
    Array.isArray(v) &&
    v.length === len &&
    v.every((w) => typeof w === 'number' && Number.isFinite(w) && w > 0)
  )
}

function validateJigsawSchemeParams(v: unknown): v is JigsawSchemeParams {
  return (
    isRecord(v) &&
    Number.isInteger(v.rows) && typeof v.rows === 'number' && v.rows >= 2 && v.rows <= 12 &&
    Number.isInteger(v.cols) && typeof v.cols === 'number' && v.cols >= 2 && v.cols <= 12 &&
    typeof v.tabDepth === 'number' && Number.isFinite(v.tabDepth) && v.tabDepth >= 0.08 && v.tabDepth <= 0.25 &&
    typeof v.uniquenessThreshold === 'number' && Number.isFinite(v.uniquenessThreshold) &&
    v.uniquenessThreshold >= 0 && v.uniquenessThreshold <= 100 &&
    Number.isInteger(v.seed) && typeof v.seed === 'number' && v.seed >= 0 && v.seed <= 0xffffffff &&
    (v.suggestion === undefined ||
      (isRecord(v.suggestion) &&
        suggestionWeightsOk(v.suggestion.rowWeights, v.rows) &&
        suggestionWeightsOk(v.suggestion.colWeights, v.cols)))
  )
}

function validateJigsawSchemeSource(v: unknown): v is JigsawSchemeSource {
  return (
    isRecord(v) &&
    ((v.kind === 'builtin' && typeof v.imageId === 'string') ||
      (v.kind === 'custom' && typeof v.assetId === 'string'))
  )
}

function validateJigsawScheme(v: unknown): v is JigsawSchemeData {
  return (
    isRecord(v) &&
    typeof v.id === 'string' && v.id.length > 0 &&
    typeof v.name === 'string' &&
    validateJigsawSchemeSource(v.source) &&
    validateJigsawSchemeParams(v.params) &&
    Number.isFinite(v.createdAt) && typeof v.createdAt === 'number' &&
    Number.isFinite(v.updatedAt) && typeof v.updatedAt === 'number'
  )
}

/** 完整存档形状校验（迁移完成后调用） */
export function validateSaveData(v: unknown): v is SaveData {
  return (
    isRecord(v) &&
    v.version === SCHEMA_VERSION &&
    validateSettings(v.settings) &&
    isRecord(v.games) &&
    Object.values(v.games).every(validateGameSave) &&
    Array.isArray(v.jigsawSchemes) &&
    v.jigsawSchemes.every(validateJigsawScheme) &&
    new Set(v.jigsawSchemes.map((s) => (isRecord(s) ? s.id : '?'))).size === v.jigsawSchemes.length &&
    (v.wordbank === undefined || validateWordbank(v.wordbank))
  )
}

// ---- 迁移链：按 from 版本链式升级 ----

function migrateToCurrent(raw: Record<string, unknown>): Record<string, unknown> {
  let data = raw
  let version = typeof data.version === 'number' ? data.version : -1
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === version)
    if (!step) {
      // 无可用迁移步骤（如 version 非法）→ 上抛由调用方按损坏处理
      throw new Error(`save: 无法从版本 ${version} 迁移（无迁移步骤）`)
    }
    data = step.migrate(data)
    version = typeof data.version === 'number' ? data.version : -1
  }
  return data
}

// ---- 读取路径 ----

export type LoadResult =
  | { ok: true; data: SaveData }
  | { ok: false; reason: 'corrupt' }

/**
 * 解析并校验存档原始文本（加载与导入共用）。
 * JSON 非法 / 版本未知（含更高版本）/ 迁移失败 / 形状校验失败 → corrupt，不静默清空。
 */
export function parseSaveText(text: string): LoadResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
  if (!isRecord(raw)) return { ok: false, reason: 'corrupt' }
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) {
    return { ok: false, reason: 'corrupt' }
  }
  if (raw.version > SCHEMA_VERSION) {
    // 未来版本：当前程序无法理解，拒绝（不降级写回避免破坏）
    return { ok: false, reason: 'corrupt' }
  }
  let migrated: Record<string, unknown>
  try {
    migrated = raw.version === SCHEMA_VERSION ? raw : migrateToCurrent(raw)
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
  if (!validateSaveData(migrated)) return { ok: false, reason: 'corrupt' }
  return { ok: true, data: migrated as SaveData }
}

/**
 * 读取存档：无档返回默认档；损坏返回默认档并 console.warn（UI 层经 hasCorruptSave 提示恢复）。
 * 本函数永不抛错、永不写回（避免损坏被覆盖后不可恢复）。
 */
export function loadSave(): SaveData {
  const text = localStorage.getItem(SAVE_KEY)
  if (text === null) return defaultSave()
  const result = parseSaveText(text)
  if (result.ok) return result.data
  // WHY console.warn：降级/异常路径保留带上下文警告（代码规范 §九），生产可查
  console.warn('[save] 存档损坏，回退默认档（原始数据保留在 localStorage，可经导入恢复）')
  return defaultSave()
}

/** 启动时检测：本地是否存在损坏存档（用于提示用户从导出备份恢复或确认重置） */
export function hasCorruptSave(): boolean {
  const text = localStorage.getItem(SAVE_KEY)
  if (text === null) return false
  return !parseSaveText(text).ok
}

/** 用户显式确认后重置存档（损坏恢复路径；非静默清空） */
export function resetSave(): SaveData {
  localStorage.removeItem(SAVE_KEY)
  return defaultSave()
}

// ---- 写入路径 ----

export function persistSave(save: SaveData): void {
  if (!validateSaveData(save)) {
    throw new Error('save: 拒绝写入未通过校验的存档数据')
  }
  localStorage.setItem(SAVE_KEY, JSON.stringify(save))
}

// ---- 导入导出 ----

export interface ExportOptions {
  /** AI Key 等敏感字段默认脱敏；用户显式勾选才包含（发布原则 F-16） */
  includeSecrets?: boolean
}

/** 导出 JSON 文本（设置页下载 .json 用） */
export function exportJson(save: SaveData = loadSave(), options: ExportOptions = {}): string {
  const { includeSecrets = false } = options
  const data: SaveData = includeSecrets && save.settings.ai
    ? save
    : {
        ...save,
        settings: save.settings.ai
          ? { ...save.settings, ai: { ...save.settings.ai, apiKey: '' } }
          : save.settings,
      }
  return JSON.stringify(data, null, 2)
}

export type ImportResult =
  | { ok: true; data: SaveData }
  | { ok: false; error: string }

/** 导入 JSON 文本：整体校验（含迁移链），非法拒绝且不部分应用；成功即持久化 */
export function importJson(text: string): ImportResult {
  const result = parseSaveText(text)
  if (!result.ok) {
    return { ok: false, error: 'save.import.corrupt' }
  }
  persistSave(result.data)
  return { ok: true, data: result.data }
}
