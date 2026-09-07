// 拼图方案与专题关卡目录单测（验收返工「方案 = 关卡」：动态关数 / 新增方案=新增关卡 / 成绩挂方案id）
import { describe, it, expect, beforeEach } from 'vitest'
import {
  listSchemes, getScheme, createScheme, deleteScheme, updateScheme,
  builtinSchemes, schemesForTopic, topicLevelCount,
  createTopicLevel, schemeLevelNumber, JIGSAW_TOPICS, BUILTIN_SCHEME_PREFIX,
} from '@/games/jigsaw/schemes'
import { GALLERY } from '@/games/jigsaw/gallery'
import { rememberSpec, resetSpecCache } from '@/games/jigsaw/optimize'
import { levelSeed } from '@/engines/rng'
import { recordResult, getLevelRecord, getUnlockedCount } from '@/core/level-manager'
import type { JigsawSchemeParams, JigsawSchemeSource } from '@/core/save'
import type { LevelResult } from '@/core/types'

const PARAMS: JigsawSchemeParams = { rows: 4, cols: 4, tabDepth: 0.16, uniquenessThreshold: 18, seed: 42 }
const BUILTIN: JigsawSchemeSource = { kind: 'builtin', imageId: 'animals-01' }
const CUSTOM: JigsawSchemeSource = { kind: 'custom', assetId: 'asset-9' }

/** 内置切片调整（人工覆盖表镜像）：四主题 24 图行×列，锯齿深度统一 0.25 */
const SPEC_OVERRIDES: Record<string, { rows: number; cols: number }> = {
  'animals-01': { rows: 6, cols: 8 },
  'animals-02': { rows: 5, cols: 6 },
  'animals-03': { rows: 5, cols: 6 },
  'animals-04': { rows: 6, cols: 6 },
  'animals-05': { rows: 4, cols: 6 },
  'animals-06': { rows: 5, cols: 5 },
  'space-01': { rows: 7, cols: 6 },
  'space-02': { rows: 6, cols: 5 },
  'space-03': { rows: 3, cols: 5 },
  'space-04': { rows: 6, cols: 5 },
  'space-05': { rows: 5, cols: 5 },
  'space-06': { rows: 5, cols: 5 },
  'scenery-01': { rows: 5, cols: 6 },
  'scenery-02': { rows: 5, cols: 5 },
  'scenery-03': { rows: 4, cols: 5 },
  'scenery-04': { rows: 4, cols: 5 },
  'scenery-05': { rows: 4, cols: 5 },
  'scenery-06': { rows: 4, cols: 5 },
  'cartoon-01': { rows: 4, cols: 3 },
  'cartoon-02': { rows: 5, cols: 4 },
  'cartoon-03': { rows: 5, cols: 4 },
  'cartoon-04': { rows: 5, cols: 4 },
  'cartoon-05': { rows: 4, cols: 4 },
  'cartoon-06': { rows: 4, cols: 4 },
}

function result(n: number, stars: 1 | 2 | 3 = 3): LevelResult {
  return { gameId: 'jigsaw', n, elapsedMs: 60_000, mistakes: 1, stars, meta: {} }
}

describe('内置方案目录（每图一个，确定性派生）', () => {
  beforeEach(() => resetSpecCache()) // 规格缓存清空：占位断言不被其他用例的预热污染

  it('24 张图各派生一个内置方案：id = bs-<imageId>，与图库一一对齐', () => {
    const all = builtinSchemes()
    expect(all).toHaveLength(GALLERY.length)
    for (const entry of GALLERY) {
      const scheme = all.find((s) => s.id === `${BUILTIN_SCHEME_PREFIX}${entry.id}`)
      expect(scheme, `缺少内置方案 ${entry.id}`).toBeTruthy()
      expect(scheme!.topic).toBe(entry.topic)
      expect(scheme!.source).toEqual({ kind: 'builtin', imageId: entry.id })
      expect(scheme!.builtin).toBe(true)
    }
  })

  it('全部 24 图人工覆盖规格（内置切片调整：四主题逐图行×列 + 锯齿深度 0.25），seed 口径不变', () => {
    for (const entry of GALLERY) {
      const spec = SPEC_OVERRIDES[entry.id]
      expect(spec, `${entry.id} 缺人工覆盖条目`).toBeTruthy() // 图库扩图须补表（或显式决策回落自动优选）
      const scheme = builtinSchemes().find((x) => x.id === `${BUILTIN_SCHEME_PREFIX}${entry.id}`)!
      expect(scheme.params.rows, `${entry.id} rows`).toBe(spec!.rows)
      expect(scheme.params.cols, `${entry.id} cols`).toBe(spec!.cols)
      expect(scheme.params.tabDepth, `${entry.id} tabDepth`).toBe(0.25)
      expect(scheme.params.seed).toBe(levelSeed(`jigsaw-builtin:${entry.id}`, 1))
    }
  })

  it('不入档：空档 listSchemes 为空，但专题关数仍含内置方案', () => {
    localStorage.clear()
    expect(listSchemes()).toEqual([])
    expect(topicLevelCount('animals')).toBe(6)
  })
})

describe('内置方案规格人工覆盖（内置切片调整：覆盖表 > 内容分析 > 占位兜底）', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSpecCache()
  })

  it('人工覆盖优先于内容分析：预热缓存不改变覆盖图的行×列与锯齿深度', () => {
    rememberSpec('animals-01', { rows: 5, cols: 4 })
    rememberSpec('space-01', { rows: 5, cols: 4 })
    const a = builtinSchemes().find((x) => x.id === 'bs-animals-01')!
    const s = builtinSchemes().find((x) => x.id === 'bs-space-01')!
    expect(a.params.rows).toBe(SPEC_OVERRIDES['animals-01']!.rows)
    expect(a.params.cols).toBe(SPEC_OVERRIDES['animals-01']!.cols)
    expect(a.params.tabDepth).toBe(0.25)
    expect(s.params.rows).toBe(SPEC_OVERRIDES['space-01']!.rows)
    expect(s.params.cols).toBe(SPEC_OVERRIDES['space-01']!.cols)
    expect(s.params.tabDepth).toBe(0.25)
  })

  it('createTopicLevel 透传覆盖规格（gridSize 兼容字段跟 rows）', () => {
    const cfg = createTopicLevel(1, 'cartoon') // cartoon-01 = 4×3 = 12 块全库最少
    expect(cfg.rows).toBe(4)
    expect(cfg.cols).toBe(3)
    expect(cfg.gridSize).toBe(4)
    expect(cfg.tabDepth).toBe(0.25)
  })
})

describe('专题目录与动态关数（新增方案 = 自动新增关卡）', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSpecCache() // 规格缓存同为模块级状态，与存档同步隔离
  })

  it('5 个专题页签：4 内置专题 + custom', () => {
    expect(JIGSAW_TOPICS.map((t) => t.id)).toEqual(['animals', 'space', 'scenery', 'cartoon', 'custom'])
  })

  it('块数升序（反馈三轮「从少到多」）：用户方案按块数插入、同数内置在前；同图二次切片追加同专题', () => {
    const a = createScheme('小狗再切', BUILTIN, PARAMS) // 4×4=16 块 → 少于动物覆盖最小 24 → 居首
    const b = createScheme('太空加切', { kind: 'builtin', imageId: 'space-03' }, PARAMS)
    const list = schemesForTopic('animals')
    expect(list).toHaveLength(7)
    expect(list.map((s) => s.params.rows * s.params.cols)).toEqual([16, 24, 25, 30, 30, 36, 48])
    expect(list[0]).toMatchObject({ id: a.id, name: '小狗再切', builtin: false })
    expect(list.filter((s) => s.builtin)).toHaveLength(6)
    // 其他专题互不混入
    expect(schemesForTopic('space').some((s) => s.id === a.id)).toBe(false)
    expect(schemesForTopic('space').some((s) => s.id === b.id)).toBe(true)
  })

  it('四主题按难易度重排（内置切片调整：块数升序，同块数保持图库稳定序）', () => {
    // animals 24/25/30/30/36/48；space 15/25/25/30/30/42；scenery 20/20/20/20/25/30；cartoon 12/16/16/20/20/20
    expect(schemesForTopic('animals').map((s) => s.name)).toEqual([
      'animals-05', 'animals-06', 'animals-02', 'animals-03', 'animals-04', 'animals-01',
    ])
    expect(schemesForTopic('space').map((s) => s.name)).toEqual([
      'space-03', 'space-05', 'space-06', 'space-02', 'space-04', 'space-01',
    ])
    expect(schemesForTopic('scenery').map((s) => s.name)).toEqual([
      'scenery-03', 'scenery-04', 'scenery-05', 'scenery-06', 'scenery-02', 'scenery-01',
    ])
    expect(schemesForTopic('cartoon').map((s) => s.name)).toEqual([
      'cartoon-01', 'cartoon-05', 'cartoon-06', 'cartoon-02', 'cartoon-03', 'cartoon-04',
    ])
  })

  it('custom 上传图方案归 custom 专题（初始 0 关 = 空态）', () => {
    expect(topicLevelCount('custom')).toBe(0)
    const c = createScheme('我的猫', CUSTOM, PARAMS)
    expect(topicLevelCount('custom')).toBe(1)
    expect(schemesForTopic('custom')[0]!.id).toBe(c.id)
  })

  it('删除方案：该专题关数收敛、其余方案与成绩零影响', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    recordResult('jigsaw:animals', result(7, 2), { total: 7, recordKey: a.id })
    deleteScheme(a.id)
    expect(topicLevelCount('animals')).toBe(6)
    // 成绩仍挂方案 id（方案已删，记录留存不影响渲染）
    expect(getLevelRecord('jigsaw:animals', a.id)?.stars).toBe(2)
  })

  it('deleteScheme 未知 id 抛错', () => {
    expect(() => deleteScheme('js-missing')).toThrow(RangeError)
  })
})

describe('createTopicLevel（专题第 n 关 = 第 n 个方案）', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSpecCache() // 规格缓存同为模块级状态，与存档同步隔离
  })

  it('内置关配置：参数透传、track = 专题、schemeId 标记、seed = 方案固有（确定性）', () => {
    const cfg = createTopicLevel(1, 'animals')
    expect(cfg.gameId).toBe('jigsaw')
    expect(cfg.n).toBe(1)
    expect(cfg.track).toBe('animals')
    expect(cfg.imageId).toBe('animals-05')
    expect(cfg.schemeId).toBe('bs-animals-05')
    expect(cfg.rows).toBe(4) // 人工覆盖 4×6=24 全专题最少 → 重排为第 1 关
    expect(cfg.cols).toBe(6)
    expect(cfg.gridSize).toBe(4)
    expect(cfg.tabDepth).toBe(0.25)
    expect(cfg.assetId).toBeUndefined()
    // 同方案内容恒定（seed 不随重排变化）
    expect(createTopicLevel(1, 'animals').seed).toBe(cfg.seed)
  })

  it('用户方案追加为专题末关：自定义参数与 custom 素材引用透传', () => {
    const scheme = createScheme('我的 9×9', BUILTIN, { ...PARAMS, rows: 9, cols: 9, tabDepth: 0.2, uniquenessThreshold: 30 })
    const custom = createScheme('我的猫', CUSTOM, { ...PARAMS, suggestion: { rowWeights: [1, 1, 1, 1], colWeights: [1, 1, 1, 1] } })

    const cfg = createTopicLevel(7, 'animals')
    expect(cfg.schemeId).toBe(scheme.id)
    expect(cfg.rows).toBe(9)
    expect(cfg.cols).toBe(9)
    expect(cfg.tabDepth).toBe(0.2)
    expect(cfg.uniquenessThreshold).toBe(30)
    expect(cfg.imageId).toBe('animals-01')

    const customCfg = createTopicLevel(1, 'custom')
    expect(customCfg.schemeId).toBe(custom.id)
    expect(customCfg.imageId).toBe('')
    expect(customCfg.assetId).toBe('asset-9')
    expect(customCfg.suggestion).toEqual({ rowWeights: [1, 1, 1, 1], colWeights: [1, 1, 1, 1] })
  })

  it('越界 / 非法专题抛 RangeError', () => {
    expect(() => createTopicLevel(0, 'animals')).toThrow(RangeError)
    expect(() => createTopicLevel(7, 'animals')).toThrow(RangeError) // 现有 6 关
    expect(() => createTopicLevel(1, 'custom')).toThrow(RangeError) // 空专题
    expect(() => createTopicLevel(1, 'nope' as never)).toThrow(RangeError)
  })

  it('schemeLevelNumber：方案 id → 当前专题内序号；已删/未知返回 null', () => {
    const a = createScheme('A', BUILTIN, PARAMS) // 4×4=16 块 → animals 第 1 关（块数升序居首）
    expect(schemeLevelNumber('bs-animals-01')).toEqual({ topic: 'animals', n: 7 }) // 48 块最多 → 末关（含 a 共 7 关）
    expect(schemeLevelNumber(a.id)).toEqual({ topic: 'animals', n: 1 })
    deleteScheme(a.id)
    expect(schemeLevelNumber(a.id)).toBeNull()
    expect(schemeLevelNumber('js-missing')).toBeNull()
  })
})

describe('专题轨进度（levels 键 = 方案 id，删除重排不错位）', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSpecCache() // 规格缓存同为模块级状态，与存档同步隔离
  })

  it('过关写方案 id 键并推进解锁；内置关与用户关同轨', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    recordResult('jigsaw:animals', result(1), { total: 7, recordKey: 'bs-animals-01' })
    expect(getUnlockedCount('jigsaw:animals', 7)).toBe(2)
    recordResult('jigsaw:animals', result(7), { total: 7, recordKey: a.id })

    expect(getLevelRecord('jigsaw:animals', 'bs-animals-01')?.stars).toBe(3)
    expect(getLevelRecord('jigsaw:animals', a.id)?.stars).toBe(3)
    // 通关末关（n=7）→ 解锁数推满封顶 total
    expect(getUnlockedCount('jigsaw:animals', 7)).toBe(7)
  })

  it('成绩合并口径与全局一致：星级取高/用时取低/失误取低', () => {
    recordResult('jigsaw:animals', { ...result(1, 2), elapsedMs: 90_000, mistakes: 3 }, { recordKey: 'bs-animals-01' })
    recordResult('jigsaw:animals', { ...result(1, 3), elapsedMs: 60_000, mistakes: 1 }, { recordKey: 'bs-animals-01' })
    expect(getLevelRecord('jigsaw:animals', 'bs-animals-01')).toEqual({ stars: 3, bestMs: 60_000, bestMistakes: 1 })
  })
})

describe('用户方案 CRUD', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSpecCache() // 规格缓存同为模块级状态，与存档同步隔离
  })

  it('createScheme：id js- 前缀、参数原样入档', () => {
    const s = createScheme('我的方案', BUILTIN, PARAMS)
    expect(s.id).toMatch(/^js-/)
    expect(s.params).toEqual(PARAMS)
    expect(s.source).toEqual(BUILTIN)
    expect(getScheme(s.id)?.name).toBe('我的方案')
  })

  it('空名默认「方案 N」（N = 现有方案数 + 1）', () => {
    expect(createScheme('   ', CUSTOM, PARAMS).name).toBe('方案 1')
    createScheme('我的方案', BUILTIN, PARAMS)
    expect(createScheme('', CUSTOM, PARAMS).name).toBe('方案 3')
  })

  it('连续创建 id 互不相同、均为合法档（校验器通过）', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    const b = createScheme('B', CUSTOM, { ...PARAMS, rows: 6 })
    expect(a.id).not.toBe(b.id)
    expect(listSchemes().map((s) => s.id)).toEqual([a.id, b.id])
  })

  it('getScheme 未知 id 返回 undefined（UI 兜底用）', () => {
    expect(getScheme('js-missing')).toBeUndefined()
  })
})

describe('updateScheme（反馈三轮：方案原位调整，id/进度键不变）', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSpecCache()
  })

  it('更新名称/参数/模式：id 与 createdAt 不变、成绩仍挂原 id 可读', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    recordResult('jigsaw:animals', result(2, 2), { total: 7, recordKey: a.id })
    const next = updateScheme(a.id, { name: 'A2', params: { ...PARAMS, rows: 6, cols: 5 }, mode: 'auto' })
    expect(next.id).toBe(a.id)
    expect(next.name).toBe('A2')
    expect(next.params.rows).toBe(6)
    expect(next.params.cols).toBe(5)
    expect(next.mode).toBe('auto')
    expect(next.createdAt).toBe(a.createdAt)
    // 成绩挂方案 id：原位调整不丢进度
    expect(getLevelRecord('jigsaw:animals', a.id)?.stars).toBe(2)
    expect(listSchemes().find((s) => s.id === a.id)?.params.rows).toBe(6)
  })

  it('空名回落原名；仅传 name 时其余字段原样保持', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    const next = updateScheme(a.id, { name: '   ' })
    expect(next.name).toBe('A')
    expect(next.params).toEqual(PARAMS)
    expect(next.source).toEqual(BUILTIN)
  })

  it('未知 id 抛 RangeError', () => {
    expect(() => updateScheme('js-missing', { name: 'x' })).toThrow(RangeError)
  })
})
