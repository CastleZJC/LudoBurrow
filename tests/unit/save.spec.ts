import { describe, it, expect, beforeEach } from 'vitest'
import {
  SAVE_KEY, SCHEMA_VERSION, defaultSave, defaultGameSave,
  loadSave, persistSave, parseSaveText, hasCorruptSave, resetSave,
  exportJson, importJson, validateSaveData,
} from '@/core/save'
import type { SaveData, JigsawSchemeData } from '@/core/save'

function sampleScheme(id = 'js-test-1'): JigsawSchemeData {
  return {
    id,
    name: '测试方案',
    source: { kind: 'builtin', imageId: 'animals-01' },
    params: { rows: 4, cols: 5, tabDepth: 0.16, uniquenessThreshold: 18, seed: 12345 },
    progress: { unlockedCount: 2, levels: { '1': { stars: 3, bestMs: 90_000, bestMistakes: 0 } } },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  }
}

function sampleSave(): SaveData {
  return {
    version: SCHEMA_VERSION,
    settings: {
      locale: 'zh-CN',
      soundEnabled: true,
      timeLimit: { mode: 'off', limitMs: 120_000, lockMs: 300_000 },
    },
    games: {
      keygame: {
        unlockedCount: 3,
        levels: { '1': { stars: 3, bestMs: 12_000, bestMistakes: 0 } },
      },
    },
    jigsawSchemes: [],
    activeJigsawSchemeId: null,
  }
}

describe('save 基础读写', () => {
  beforeEach(() => localStorage.clear())

  it('无档时 loadSave 返回默认档（version 正确、设置默认、games 空）', () => {
    const save = loadSave()
    expect(save.version).toBe(SCHEMA_VERSION)
    expect(save.settings.locale).toBe('zh-CN')
    expect(save.settings.soundEnabled).toBe(true)
    expect(save.games).toEqual({})
  })

  it('写入-读取往返：persistSave 后 loadSave 取回一致内容', () => {
    persistSave(sampleSave())
    expect(loadSave()).toEqual(sampleSave())
  })

  it('写入仅占用单一 key ludoburrow/save', () => {
    persistSave(sampleSave())
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull()
  })

  it('defaultGameSave 初始仅第 1 关解锁', () => {
    expect(defaultGameSave().unlockedCount).toBe(1)
  })
})

describe('save 损坏处理', () => {
  beforeEach(() => localStorage.clear())

  it('非法 JSON 被拒绝且不静默清空（原始数据保留）', () => {
    localStorage.setItem(SAVE_KEY, '{broken json!!')
    expect(hasCorruptSave()).toBe(true)
    // loadSave 回退默认档但不清除原始数据
    expect(loadSave().version).toBe(SCHEMA_VERSION)
    expect(localStorage.getItem(SAVE_KEY)).toBe('{broken json!!')
  })

  it('形状非法的 JSON（字段类型错误）被拒绝', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, settings: { locale: 'xx' }, games: {} }))
    expect(hasCorruptSave()).toBe(true)
  })

  it('更高版本的存档被拒绝（当前程序无法理解）', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...sampleSave(), version: SCHEMA_VERSION + 1 }))
    expect(hasCorruptSave()).toBe(true)
  })

  it('resetSave 仅在显式调用时清除（损坏恢复路径）', () => {
    localStorage.setItem(SAVE_KEY, 'garbage')
    resetSave()
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
    expect(loadSave()).toEqual(defaultSave())
  })
})

describe('save 导入导出', () => {
  beforeEach(() => localStorage.clear())

  it('导出 → 清存储 → 导入：完整恢复', () => {
    persistSave(sampleSave())
    const text = exportJson()
    localStorage.clear()
    const result = importJson(text)
    expect(result.ok).toBe(true)
    expect(loadSave()).toEqual(sampleSave())
  })

  it('导出默认脱敏 AI Key（空串），显式勾选才包含', () => {
    const save: SaveData = {
      ...sampleSave(),
      settings: {
        ...sampleSave().settings,
        ai: { provider: 'glm', baseURL: 'https://api.example.com', model: 'glm-4v', apiKey: 'sk-secret' },
      },
    }
    persistSave(save)
    const defaultExport = JSON.parse(exportJson()) as SaveData
    expect(defaultExport.settings.ai?.apiKey).toBe('')
    const withSecrets = JSON.parse(exportJson(loadSave(), { includeSecrets: true })) as SaveData
    expect(withSecrets.settings.ai?.apiKey).toBe('sk-secret')
  })

  it('导入非法 JSON 整体拒绝，不部分应用', () => {
    persistSave(sampleSave())
    const before = loadSave()
    const result = importJson('not-json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(typeof result.error).toBe('string')
    expect(loadSave()).toEqual(before)
  })

  it('导入形状非法数据整体拒绝', () => {
    const result = importJson(JSON.stringify({ version: 1, settings: {}, games: 'x' }))
    expect(result.ok).toBe(false)
  })
})

describe('save 校验与迁移框架', () => {
  beforeEach(() => localStorage.clear())

  it('validateSaveData 对合法档返回 true', () => {
    expect(validateSaveData(sampleSave())).toBe(true)
  })

  it('parseSaveText 对合法文本返回数据', () => {
    const result = parseSaveText(JSON.stringify(sampleSave()))
    expect(result.ok).toBe(true)
  })

  it('v1 旧档经迁移链升级 v2：进度保留、方案段初始化为空（M3.7）', () => {
    const v1 = {
      version: 1,
      settings: sampleSave().settings,
      games: sampleSave().games,
    }
    const result = parseSaveText(JSON.stringify(v1))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.version).toBe(2)
      expect(result.data.jigsawSchemes).toEqual([])
      expect(result.data.activeJigsawSchemeId).toBeNull()
      expect(result.data.games.keygame?.unlockedCount).toBe(3)
    }
  })

  it('缺 version 字段的档被拒绝', () => {
    const noVersion = sampleSave() as unknown as Record<string, unknown>
    delete noVersion.version
    expect(parseSaveText(JSON.stringify(noVersion)).ok).toBe(false)
  })
})

describe('save v2 拼图方案段（M3.7 版本与进度隔离）', () => {
  beforeEach(() => localStorage.clear())

  it('带方案档持久化往返一致', () => {
    const save: SaveData = { ...sampleSave(), jigsawSchemes: [sampleScheme()], activeJigsawSchemeId: 'js-test-1' }
    persistSave(save)
    expect(loadSave()).toEqual(save)
  })

  it.each([
    ['rows 过小', { rows: 1 }],
    ['rows 过大', { rows: 13 }],
    ['rows 非整数', { rows: 3.5 }],
    ['tabDepth 过小', { tabDepth: 0.05 }],
    ['tabDepth 过大', { tabDepth: 0.3 }],
    ['阈值越下界', { uniquenessThreshold: -1 }],
    ['阈值越上界', { uniquenessThreshold: 101 }],
    ['seed 负数', { seed: -1 }],
    ['seed 超 32 位', { seed: 0x1_0000_0000 }],
  ])('方案参数非法被拒：%s', (_label, patch) => {
    const scheme = { ...sampleScheme(), params: { ...sampleScheme().params, ...patch } }
    const save = { ...sampleSave(), jigsawSchemes: [scheme] }
    expect(validateSaveData(save)).toBe(false)
    expect(parseSaveText(JSON.stringify(save)).ok).toBe(false)
  })

  it('方案 id 重复被拒', () => {
    const save = { ...sampleSave(), jigsawSchemes: [sampleScheme('js-a'), sampleScheme('js-a')] }
    expect(validateSaveData(save)).toBe(false)
  })

  it('activeJigsawSchemeId 悬空引用被拒', () => {
    const save = { ...sampleSave(), jigsawSchemes: [sampleScheme('js-a')], activeJigsawSchemeId: 'js-missing' }
    expect(validateSaveData(save)).toBe(false)
  })

  it('source 非法（kind 未知 / builtin 缺 imageId）被拒', () => {
    const badKind = { ...sampleScheme(), source: { kind: 'web' } }
    const noImageId = { ...sampleScheme(), source: { kind: 'builtin' } }
    expect(validateSaveData({ ...sampleSave(), jigsawSchemes: [badKind] })).toBe(false)
    expect(validateSaveData({ ...sampleSave(), jigsawSchemes: [noImageId] })).toBe(false)
  })

  it('自定义素材引用（kind=custom）合法', () => {
    const scheme = { ...sampleScheme(), source: { kind: 'custom', assetId: 'asset-1' } }
    expect(validateSaveData({ ...sampleSave(), jigsawSchemes: [scheme] })).toBe(true)
  })

  it('AI 建议权重（suggestion）长度匹配且有限正数 → 合法（M5）', () => {
    const scheme = {
      ...sampleScheme(),
      params: {
        ...sampleScheme().params,
        suggestion: {
          rowWeights: [0.1, 0.2, 0.3, 0.4], // 长度 = rows(4)
          colWeights: [0.5, 0.125, 0.125, 0.125, 0.125], // 长度 = cols(5)
        },
      },
    }
    const save = { ...sampleSave(), jigsawSchemes: [scheme] }
    expect(validateSaveData(save)).toBe(true)
    persistSave(save)
    expect(loadSave().jigsawSchemes[0]!.params.suggestion).toEqual(scheme.params.suggestion)
  })

  it.each([
    ['长度不符', { rowWeights: [0.5, 0.5], colWeights: [0.2, 0.2, 0.2, 0.2, 0.2] }],
    ['含 0', { rowWeights: [0, 0.3, 0.3, 0.4], colWeights: [0.2, 0.2, 0.2, 0.2, 0.2] }],
    ['含负数', { rowWeights: [0.1, 0.3, 0.3, 0.3], colWeights: [-0.2, 0.3, 0.3, 0.3, 0.3] }],
    ['含非数字', { rowWeights: [0.1, 'x', 0.3, 0.3], colWeights: [0.2, 0.2, 0.2, 0.2, 0.2] }],
  ])('AI 建议权重非法被拒：%s', (_label, suggestion) => {
    const scheme = { ...sampleScheme(), params: { ...sampleScheme().params, suggestion } }
    const save = { ...sampleSave(), jigsawSchemes: [scheme] }
    expect(validateSaveData(save)).toBe(false)
    expect(parseSaveText(JSON.stringify(save)).ok).toBe(false)
  })

  it('导出含方案档 → 导入完整恢复（迁移链与校验对 v2 直通）', () => {
    const save: SaveData = { ...sampleSave(), jigsawSchemes: [sampleScheme()], activeJigsawSchemeId: 'js-test-1' }
    persistSave(save)
    const text = exportJson()
    localStorage.clear()
    const result = importJson(text)
    expect(result.ok).toBe(true)
    expect(loadSave()).toEqual(save)
  })
})
