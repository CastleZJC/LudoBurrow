import { describe, it, expect, beforeEach } from 'vitest'
import {
  SAVE_KEY, SCHEMA_VERSION, defaultSave, defaultGameSave,
  loadSave, persistSave, parseSaveText, hasCorruptSave, resetSave,
  exportJson, importJson, validateSaveData,
} from '@/core/save'
import type { SaveData, JigsawSchemeData } from '@/core/save'
import { MAZE_THEMES } from '@/games/maze/level'

function sampleScheme(id = 'js-test-1'): JigsawSchemeData {
  return {
    id,
    name: '测试方案',
    source: { kind: 'builtin', imageId: 'animals-01' },
    params: { rows: 4, cols: 5, tabDepth: 0.16, uniquenessThreshold: 18, seed: 12345 },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  }
}

function sampleSave(): SaveData {
  return {
    version: SCHEMA_VERSION,
    settings: {
      locale: 'zh-CN',
      timeLimit: { mode: 'off', limitMs: 120_000, lockMs: 300_000 },
    },
    games: {
      // 键盘多轨模型（方案 B）：进度槽键 = `keygame:<mode>`
      'keygame:full-random': {
        unlockedCount: 3,
        levels: { '1': { stars: 3, bestMs: 12_000, bestMistakes: 0 } },
      },
    },
    jigsawSchemes: [],
  }
}

describe('save 基础读写', () => {
  beforeEach(() => localStorage.clear())

  it('无档时 loadSave 返回默认档（version 正确、设置默认、games 空）', () => {
    const save = loadSave()
    expect(save.version).toBe(SCHEMA_VERSION)
    expect(save.settings.locale).toBe('zh-CN')
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

  it('v1 旧档经迁移链升级至当前版本：非键盘进度保留、方案段初始化为空（M3.7）', () => {
    const v1 = {
      version: 1,
      settings: { locale: 'zh-CN', soundEnabled: true, timeLimit: { mode: 'off', limitMs: 120_000, lockMs: 300_000 } },
      games: { maze: { unlockedCount: 3, levels: { '1': { stars: 3, bestMs: 12_000, bestMistakes: 0 } } } },
    }
    const result = parseSaveText(JSON.stringify(v1))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.version).toBe(SCHEMA_VERSION)
      expect(result.data.jigsawSchemes).toEqual([])
      // v6 起激活位字段退役（方案 = 关卡，无需激活）
      expect('activeJigsawSchemeId' in result.data).toBe(false)
      expect(result.data.games.maze?.unlockedCount).toBe(3)
    }
  })

  it('v2 旧档（含 soundEnabled）升级至当前版本：音效字段移除、非键盘进度保留', () => {
    const v2 = {
      version: 2,
      settings: { locale: 'zh-CN', soundEnabled: true, timeLimit: { mode: 'off', limitMs: 120_000, lockMs: 300_000 } },
      games: { maze: { unlockedCount: 3, levels: {} } },
      jigsawSchemes: [],
      activeJigsawSchemeId: null,
    }
    const result = parseSaveText(JSON.stringify(v2))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.version).toBe(SCHEMA_VERSION)
      expect('soundEnabled' in result.data.settings).toBe(false)
      expect(result.data.games.maze?.unlockedCount).toBe(3)
    }
  })

  it('v3 旧档升级至当前版本：键盘单轨槽 games.keygame 删除（改多轨模型），其他游戏进度保留', () => {
    const v3 = {
      version: 3,
      settings: { locale: 'zh-CN', timeLimit: { mode: 'off', limitMs: 120_000, lockMs: 300_000 } },
      games: {
        keygame: { unlockedCount: 3, levels: { '1': { stars: 3, bestMs: 12_000, bestMistakes: 0 } } },
        maze: { unlockedCount: 5, levels: {} },
      },
      jigsawSchemes: [],
      activeJigsawSchemeId: null,
    }
    const result = parseSaveText(JSON.stringify(v3))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.version).toBe(SCHEMA_VERSION)
      expect(result.data.games.keygame).toBeUndefined()
      expect(result.data.games.maze?.unlockedCount).toBe(5)
    }
  })

  it('v4 旧档升级 v5：仅升版本号，wordbank 缺省（= 全用默认词表），其余数据原样保留', () => {
    const v4 = {
      version: 4,
      settings: { locale: 'zh-CN', timeLimit: { mode: 'off', limitMs: 120_000, lockMs: 300_000 } },
      games: { 'keygame:full-random': { unlockedCount: 3, levels: {} } },
      jigsawSchemes: [],
      activeJigsawSchemeId: null,
    }
    const result = parseSaveText(JSON.stringify(v4))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.version).toBe(SCHEMA_VERSION)
      expect(result.data.wordbank).toBeUndefined()
      expect(result.data.games['keygame:full-random']?.unlockedCount).toBe(3)
    }
  })

  it('v5 旧档升级 v6：方案第 1 关成绩搬到专题轨（键=方案id），旧 1-50 曲线槽/方案 progress/激活位退役', () => {
    const record = { stars: 3, bestMs: 90_000, bestMistakes: 0 }
    const v5 = {
      version: 5,
      settings: { locale: 'zh-CN', timeLimit: { mode: 'off', limitMs: 120_000, lockMs: 300_000 } },
      games: { jigsaw: { unlockedCount: 7, levels: { '1': record } } },
      jigsawSchemes: [
        {
          id: 'js-a',
          name: 'A',
          source: { kind: 'builtin', imageId: 'animals-01' },
          params: { rows: 4, cols: 5, tabDepth: 0.16, uniquenessThreshold: 18, seed: 12345 },
          progress: { unlockedCount: 2, levels: { '1': record, '2': { stars: 2, bestMs: 80_000, bestMistakes: 1 } } },
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
        },
        {
          id: 'js-b',
          name: 'B',
          source: { kind: 'custom', assetId: 'asset-9' },
          params: { rows: 4, cols: 5, tabDepth: 0.16, uniquenessThreshold: 18, seed: 6 },
          progress: { unlockedCount: 1, levels: {} },
          createdAt: 1_700_000_000_001,
          updatedAt: 1_700_000_000_001,
        },
      ],
      activeJigsawSchemeId: 'js-a',
    }
    const result = parseSaveText(JSON.stringify(v5))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.version).toBe(SCHEMA_VERSION)
      // 旧 1-50 曲线槽退役（新模型无对应关系，诚实丢弃）
      expect(result.data.games.jigsaw).toBeUndefined()
      // A 第 1 关成绩搬到 animals 专题轨（键 = 方案 id，解锁 = 1 + 1）；
      // 第 2 关属旧阶梯模型，丢弃
      expect(result.data.games['jigsaw:animals']).toEqual({ unlockedCount: 2, levels: { 'js-a': record } })
      // B 无成绩：不建 custom 槽
      expect(result.data.games['jigsaw:custom']).toBeUndefined()
      // 方案 progress 字段退役；激活位字段退役
      expect(result.data.jigsawSchemes.map((s) => 'progress' in s)).toEqual([false, false])
      expect('activeJigsawSchemeId' in result.data).toBe(false)
    }
  })

  it('v6 旧档升级 v7：仅升版本号，mazeTheme 缺省（= 城堡兜底），其余数据原样保留', () => {
    const v6 = {
      version: 6,
      settings: { locale: 'zh-CN', timeLimit: { mode: 'off', limitMs: 120_000, lockMs: 300_000 } },
      games: { maze: { unlockedCount: 3, levels: {} } },
      jigsawSchemes: [],
    }
    const result = parseSaveText(JSON.stringify(v6))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.version).toBe(SCHEMA_VERSION)
      expect(result.data.settings.mazeTheme).toBeUndefined()
      expect(result.data.games.maze?.unlockedCount).toBe(3)
      expect(result.data.jigsawSchemes).toEqual([])
    }
  })

  it('缺 version 字段的档被拒绝', () => {
    const noVersion = sampleSave() as unknown as Record<string, unknown>
    delete noVersion.version
    expect(parseSaveText(JSON.stringify(noVersion)).ok).toBe(false)
  })
})

describe('save v2 拼图方案段（方案 = 关卡模型，进度统一在专题轨）', () => {
  beforeEach(() => localStorage.clear())

  it('带方案档持久化往返一致', () => {
    const save: SaveData = { ...sampleSave(), jigsawSchemes: [sampleScheme()] }
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

  it('导出含方案档 → 导入完整恢复（迁移链与校验对当前版本直通）', () => {
    const save: SaveData = { ...sampleSave(), jigsawSchemes: [sampleScheme()] }
    persistSave(save)
    const text = exportJson()
    localStorage.clear()
    const result = importJson(text)
    expect(result.ok).toBe(true)
    expect(loadSave()).toEqual(save)
  })
})

describe('save v5 词表配置段（键盘英文/拼音词表自定义）', () => {
  beforeEach(() => localStorage.clear())

  it('合法词表配置（英文按词长桶 + 拼音按等级）持久化往返一致', () => {
    const wordbank = {
      english: { '3': ['cat', 'dog'], '8': ['sunflower'] },
      pinyin: { '1': [{ word: '山', pinyin: 'shan' }], '2': [{ word: '学校', pinyin: 'xue xiao' }] },
    }
    const save = { ...sampleSave(), wordbank }
    persistSave(save)
    expect(loadSave().wordbank).toEqual(wordbank)
  })

  it('空配置对象合法（= 全用引擎默认词表）', () => {
    expect(validateSaveData({ ...sampleSave(), wordbank: {} })).toBe(true)
  })

  it('wordbank 缺省合法（v4 及更早旧档迁移后的常态）', () => {
    expect(validateSaveData(sampleSave())).toBe(true)
  })

  it.each([
    ['english 键越界（词长 2）', { english: { '2': ['hi'] } }],
    ['english 含非字母词', { english: { '3': ['ca1t'] } }],
    ['english 非对象', { english: ['cat'] }],
    ['pinyin 键越界（等级 4）', { pinyin: { '4': [{ word: '词', pinyin: 'ci' }] } }],
    ['拼音串含数字', { pinyin: { '1': [{ word: '山', pinyin: 'sha1n' }] } }],
    ['拼音串大写', { pinyin: { '1': [{ word: '山', pinyin: 'Shan' }] } }],
    ['拼音词条缺 word', { pinyin: { '1': [{ pinyin: 'shan' }] } }],
  ])('词表配置非法被拒：%s', (_label, wordbank) => {
    const save = { ...sampleSave(), wordbank }
    expect(validateSaveData(save)).toBe(false)
    expect(parseSaveText(JSON.stringify(save)).ok).toBe(false)
  })

  it('导出含词表档 → 导入完整恢复', () => {
    const wordbank = { english: { '3': ['cat'] } }
    persistSave({ ...sampleSave(), wordbank })
    const text = exportJson()
    localStorage.clear()
    const result = importJson(text)
    expect(result.ok).toBe(true)
    expect(loadSave().wordbank).toEqual(wordbank)
  })
})

describe('save v7 迷宫主题设置段（HUD 切换记住上次，验收返工 F-20）', () => {
  beforeEach(() => localStorage.clear())

  it('合法主题持久化往返一致', () => {
    const settings = { ...sampleSave().settings, mazeTheme: 'garden' as const }
    persistSave({ ...sampleSave(), settings })
    expect(loadSave().settings.mazeTheme).toBe('garden')
  })

  it.each(MAZE_THEMES)('八主题全量合法（校验+持久化+导入导出往返）：%s', (theme) => {
    const settings = { ...sampleSave().settings, mazeTheme: theme }
    persistSave({ ...sampleSave(), settings })
    expect(validateSaveData(loadSave())).toBe(true)
    expect(loadSave().settings.mazeTheme).toBe(theme)
    localStorage.clear()
    const result = importJson(exportJson({ ...sampleSave(), settings }))
    expect(result.ok).toBe(true)
    expect(loadSave().settings.mazeTheme).toBe(theme)
  })

  it('mazeTheme 缺省合法（v6 及更早旧档迁移后的常态，读取方兜底城堡）', () => {
    expect(validateSaveData(sampleSave())).toBe(true)
  })

  it.each([
    ['未知主题', 'palace'],
    ['非字符串', 123],
  ])('mazeTheme 非法被拒：%s', (_label, mazeTheme) => {
    const settings = { ...sampleSave().settings, mazeTheme } as unknown as SaveData['settings']
    const save = { ...sampleSave(), settings }
    expect(validateSaveData(save)).toBe(false)
    expect(parseSaveText(JSON.stringify(save)).ok).toBe(false)
  })

  it('导出含主题档 → 导入完整恢复', () => {
    const settings = { ...sampleSave().settings, mazeTheme: 'garden' as const }
    persistSave({ ...sampleSave(), settings })
    const text = exportJson()
    localStorage.clear()
    const result = importJson(text)
    expect(result.ok).toBe(true)
    expect(loadSave().settings.mazeTheme).toBe('garden')
  })
})

describe('方案 mode 字段（反馈 2 三分类）', () => {
  beforeEach(() => localStorage.clear())

  it('mode 可选：auto/ai 入档往返保留，缺省合法（旧档 = 自定义）', () => {
    const a = { ...sampleScheme('js-a'), mode: 'auto' as const }
    const b = { ...sampleScheme('js-b'), mode: 'ai' as const }
    persistSave({ ...sampleSave(), jigsawSchemes: [a, b, sampleScheme('js-c')] })
    const loaded = loadSave()
    expect(loaded.jigsawSchemes[0]!.mode).toBe('auto')
    expect(loaded.jigsawSchemes[1]!.mode).toBe('ai')
    expect(loaded.jigsawSchemes[2]!.mode).toBeUndefined()
  })

  it('非法 mode 整档拒绝（corrupt，不静默清空）', () => {
    const raw = JSON.stringify({ ...sampleSave(), jigsawSchemes: [{ ...sampleScheme(), mode: 'wrong' }] })
    expect(parseSaveText(raw).ok).toBe(false)
  })
})
