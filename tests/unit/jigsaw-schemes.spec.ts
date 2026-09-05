// 拼图方案业务层单测（开发计划 3.7：版本与进度隔离 / 回滚续玩 / F-17 F-18 语义）
import { describe, it, expect, beforeEach } from 'vitest'
import {
  listSchemes, getScheme, activeScheme, createScheme, deleteScheme,
  activateScheme, deactivateSchemes,
  getSchemeUnlockedCount, isSchemeLevelUnlocked,
  getSchemeLevelRecord, getSchemeLevelRecords, recordSchemeResult,
  schemeLevel, schemeGridFor, SCHEME_TOTAL_LEVELS,
} from '@/games/jigsaw/schemes'
import type { JigsawSchemeParams, JigsawSchemeSource } from '@/core/save'
import { loadSave } from '@/core/save'
import { recordResult, getUnlockedCount } from '@/core/level-manager'
import type { LevelResult } from '@/core/types'

const PARAMS: JigsawSchemeParams = { rows: 4, cols: 4, tabDepth: 0.16, uniquenessThreshold: 18, seed: 42 }
const BUILTIN: JigsawSchemeSource = { kind: 'builtin', imageId: 'animals-01' }
const CUSTOM: JigsawSchemeSource = { kind: 'custom', assetId: 'asset-9' }

function result(n: number, stars: 1 | 2 | 3 = 3): LevelResult {
  return { gameId: 'jigsaw', n, elapsedMs: 60_000, mistakes: 1, stars, meta: {} }
}

describe('schemes 生命周期', () => {
  beforeEach(() => localStorage.clear())

  it('createScheme：创建即激活、独立进度槽从第 1 关开始、参数原样保存', () => {
    const s = createScheme('我的方案', BUILTIN, PARAMS)
    expect(s.id).toMatch(/^js-/)
    expect(activeScheme()?.id).toBe(s.id)
    expect(s.progress.unlockedCount).toBe(1)
    expect(s.progress.levels).toEqual({})
    expect(s.params).toEqual(PARAMS)
    expect(s.source).toEqual(BUILTIN)
  })

  it('连续创建：id 互不相同、均为合法档（校验器通过）', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    const b = createScheme('B', CUSTOM, { ...PARAMS, rows: 6 })
    expect(a.id).not.toBe(b.id)
    expect(listSchemes().map((s) => s.id)).toEqual([a.id, b.id])
    // loadSave 内部经 validateSaveData（persistSave 强校验），能读回即合法
    expect(loadSave().jigsawSchemes).toHaveLength(2)
  })

  it('空名方案使用默认名（方案 N）', () => {
    const s = createScheme('   ', BUILTIN, PARAMS)
    expect(s.name).toBe('方案 1')
  })

  it('deleteScheme：其他方案进度零影响；删激活方案则回到内置曲线', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    const b = createScheme('B', CUSTOM, PARAMS)
    recordSchemeResult(b.id, result(1))
    activateScheme(a.id)

    deleteScheme(a.id)

    expect(listSchemes().map((s) => s.id)).toEqual([b.id])
    expect(activeScheme()?.id ?? null).toBeNull() // 回内置
    expect(getSchemeUnlockedCount(b.id)).toBe(2) // B 进度保留
  })

  it('deleteScheme 删除非激活方案：激活位不变', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    const b = createScheme('B', CUSTOM, PARAMS)
    activateScheme(b.id)
    deleteScheme(a.id)
    expect(activeScheme()?.id).toBe(b.id)
  })

  it('deleteScheme 未知 id 抛错', () => {
    expect(() => deleteScheme('js-missing')).toThrow(RangeError)
  })

  it('activateScheme 未知 id 抛错（不产生悬空激活位）', () => {
    expect(() => activateScheme('js-missing')).toThrow(RangeError)
    expect(activeScheme()?.id ?? null).toBeNull()
    expect(loadSave().activeJigsawSchemeId).toBeNull()
  })

  it('deactivateSchemes：全部方案进度保留、随时可切回', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    recordSchemeResult(a.id, result(1))
    deactivateSchemes()
    expect(activeScheme()?.id ?? null).toBeNull()
    activateScheme(a.id)
    expect(getSchemeUnlockedCount(a.id)).toBe(2)
  })
})

describe('schemes 进度隔离（F-17 核心语义）', () => {
  beforeEach(() => localStorage.clear())

  it('recordSchemeResult 只写方案槽：games.jigsaw 与其他方案零影响', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    const b = createScheme('B', CUSTOM, PARAMS)
    recordSchemeResult(a.id, result(1, 2))

    expect(getUnlockedCount('jigsaw')).toBe(1) // 内置曲线未动
    expect(getSchemeUnlockedCount(b.id)).toBe(1) // B 未动
    expect(getSchemeUnlockedCount(a.id)).toBe(2) // A 推进
    expect(getSchemeLevelRecord(a.id, 1)).toEqual({ stars: 2, bestMs: 60_000, bestMistakes: 1 })
    expect(getSchemeLevelRecord(b.id, 1)).toBeUndefined()
    expect(getSchemeLevelRecords(b.id)).toEqual({})
  })

  it('内置 recordResult 不写任何方案槽', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    recordResult('jigsaw', result(1))
    expect(getSchemeUnlockedCount(a.id)).toBe(1)
    expect(getSchemeLevelRecord(a.id, 1)).toBeUndefined()
  })

  it('方案 A/B 进度互不影响；回滚 A 续玩 A 进度（F-17 字面语义）', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    const b = createScheme('B', CUSTOM, PARAMS)
    recordSchemeResult(a.id, result(1))
    recordSchemeResult(a.id, result(2))

    activateScheme(b.id) // 切到 B
    recordSchemeResult(b.id, result(1, 1))
    expect(getSchemeUnlockedCount(a.id)).toBe(3)
    expect(getSchemeUnlockedCount(b.id)).toBe(2)

    activateScheme(a.id) // 回滚 A：进度原样
    expect(getSchemeUnlockedCount(a.id)).toBe(3)
    expect(getSchemeLevelRecord(a.id, 2)?.stars).toBe(3)
    expect(isSchemeLevelUnlocked(a.id, 3)).toBe(true)
  })

  it('成绩合并口径与内置一致：星级取高/用时取低/失误取低', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    recordSchemeResult(a.id, { ...result(1, 2), elapsedMs: 90_000, mistakes: 3 })
    recordSchemeResult(a.id, { ...result(1, 3), elapsedMs: 60_000, mistakes: 1 })
    expect(getSchemeLevelRecord(a.id, 1)).toEqual({ stars: 3, bestMs: 60_000, bestMistakes: 1 })
  })

  it('解锁推进与封顶：过关解锁 n+1，第 50 关封顶', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    recordSchemeResult(a.id, result(50))
    expect(getSchemeUnlockedCount(a.id)).toBe(SCHEME_TOTAL_LEVELS)
    expect(isSchemeLevelUnlocked(a.id, 50)).toBe(true)
  })

  it('未玩过的关卡锁定；第 1 关始终可玩', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    expect(isSchemeLevelUnlocked(a.id, 1)).toBe(true)
    expect(isSchemeLevelUnlocked(a.id, 2)).toBe(false)
  })

  it('recordSchemeResult 未知方案抛错', () => {
    expect(() => recordSchemeResult('js-missing', result(1))).toThrow(RangeError)
  })
})

describe('schemeLevel 方案关卡', () => {
  beforeEach(() => localStorage.clear())

  it('网格阶梯：方案规格起步 + 每 5 关进阶，封顶 12', () => {
    const scheme = createScheme('A', BUILTIN, { ...PARAMS, rows: 4, cols: 6 })
    expect(schemeGridFor(scheme, 1, 'rows')).toBe(4)
    expect(schemeGridFor(scheme, 1, 'cols')).toBe(6)
    expect(schemeGridFor(scheme, 5, 'rows')).toBe(4) // floor(4/5)=0
    expect(schemeGridFor(scheme, 6, 'rows')).toBe(5) // floor(5/5)=1
    expect(schemeGridFor(scheme, 6, 'cols')).toBe(7)
    expect(schemeGridFor(scheme, 41, 'rows')).toBe(12) // 4+8=12
    expect(schemeGridFor(scheme, 50, 'cols')).toBe(12) // 6+9=15 → 钳 12
  })

  it('配置字段：rows/cols 独立、切参透传、schemeId 标记、seed 确定', () => {
    const scheme = createScheme('A', BUILTIN, { ...PARAMS, rows: 5, cols: 7, tabDepth: 0.2, uniquenessThreshold: 30 })
    const cfg = schemeLevel(scheme, 11) // 5+2=7, 7+2=9
    expect(cfg.gameId).toBe('jigsaw')
    expect(cfg.n).toBe(11)
    expect(cfg.rows).toBe(7)
    expect(cfg.cols).toBe(9)
    expect(cfg.gridSize).toBe(7)
    expect(cfg.tabDepth).toBe(0.2)
    expect(cfg.uniquenessThreshold).toBe(30)
    expect(cfg.schemeId).toBe(scheme.id)
    expect(cfg.imageId).toBe('animals-01')
    expect(cfg.assetId).toBeUndefined()
    // 确定性：同方案同关恒定
    expect(schemeLevel(scheme, 11).seed).toBe(cfg.seed)
  })

  it('seed 派生自方案 id：跨方案同关互不相同', () => {
    const a = createScheme('A', BUILTIN, PARAMS)
    const b = createScheme('B', BUILTIN, PARAMS)
    expect(schemeLevel(a, 1).seed).not.toBe(schemeLevel(b, 1).seed)
  })

  it('custom 来源：imageId 为空串、assetId 透传', () => {
    const scheme = createScheme('A', CUSTOM, PARAMS)
    const cfg = schemeLevel(scheme, 1)
    expect(cfg.imageId).toBe('')
    expect(cfg.assetId).toBe('asset-9')
  })

  it('非法关卡号抛错（0 / 51）', () => {
    const scheme = createScheme('A', BUILTIN, PARAMS)
    expect(() => schemeLevel(scheme, 0)).toThrow(RangeError)
    expect(() => schemeLevel(scheme, SCHEME_TOTAL_LEVELS + 1)).toThrow(RangeError)
  })
})

describe('schemes 与存档交互', () => {
  beforeEach(() => localStorage.clear())

  it('getScheme 对未知 id 返回 undefined（UI 兜底用）', () => {
    expect(getScheme('js-missing')).toBeUndefined()
    const a = createScheme('A', BUILTIN, PARAMS)
    expect(getScheme(a.id)?.name).toBe('A')
  })

  it('activeScheme：激活位悬空（外部改档）时安全回 null', () => {
    createScheme('A', BUILTIN, PARAMS)
    const save = loadSave()
    localStorage.setItem('ludoburrow/save', JSON.stringify({ ...save, activeJigsawSchemeId: 'js-gone' }))
    expect(activeScheme()?.id ?? null).toBeNull()
  })
})
