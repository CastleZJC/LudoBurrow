// jigsaw GameModule 契约测试（专题轨 + 动态关卡数 + 图标资产存在 + 语言包键齐备 + 配置合法）
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { jigsawModule } from '@/games/jigsaw'
import { createScheme, deleteScheme } from '@/games/jigsaw/schemes'
import type { JigsawLevelConfig } from '@/games/jigsaw/level'
import { MESSAGE_LOCALES } from '@/i18n'

// Canvas 2D no-op mock（mount 冒烟需要；与 jigsaw-instance.spec 同策略）
const proto = HTMLCanvasElement.prototype as unknown as { getContext?: unknown }
const originalGetContext = proto.getContext

beforeAll(() => {
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () =>
    new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'canvas') return { width: 0, height: 0 }
        return () => undefined
      },
      set: () => true,
    })
})

afterAll(() => {
  ;(HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = originalGetContext
})

describe('jigsawModule 契约（GameModule 接口）', () => {
  beforeEach(() => localStorage.clear())

  it('id / name / icon 字段符合约定', () => {
    expect(jigsawModule.id).toBe('jigsaw')
    expect(jigsawModule.name).toBe('game.jigsaw')
    expect(jigsawModule.icon).toBe('assets/icons/jigsaw.svg')
  })

  it('图标资产真实存在（public 分发音资产，相对路径）', () => {
    const iconPath = resolve(process.cwd(), 'public/assets/icons/jigsaw.svg')
    expect(existsSync(iconPath), `缺少图标文件 ${iconPath}`).toBe(true)
  })

  it('游戏名与 jigsaw 段文案在全部语言包中齐备', () => {
    for (const locale of Object.keys(MESSAGE_LOCALES)) {
      const messages = (MESSAGE_LOCALES as Record<string, Record<string, Record<string, string>>>)[locale]
      expect(messages.game.jigsaw, `${locale} 缺少 game.jigsaw`).toBeTruthy()
      for (const key of ['help', 'abandon', 'grid', 'helps', 'loadError', 'topicAnimals', 'topicSpace', 'topicScenery', 'topicCartoon', 'topicCustom']) {
        expect(messages.jigsaw[key], `${locale} 缺少 jigsaw.${key}`).toBeTruthy()
      }
    }
  })

  it('专题轨：5 页签（4 内置 + custom），id 即进度轨后缀', () => {
    expect(jigsawModule.tracks?.map((t) => t.id)).toEqual(['animals', 'space', 'scenery', 'cartoon', 'custom'])
    for (const track of jigsawModule.tracks ?? []) {
      expect(track.labelKey.startsWith('jigsaw.topic')).toBe(true)
    }
  })

  it('levelCount 动态：内置每专题 6 关；新增方案 = 自动新增关卡', () => {
    expect(jigsawModule.levelCount?.('animals')).toBe(6)
    expect(jigsawModule.levelCount?.('custom')).toBe(0) // 空专题 = 空态
    const scheme = createScheme('再切一张', { kind: 'builtin', imageId: 'animals-02' }, {
      rows: 5, cols: 5, tabDepth: 0.16, uniquenessThreshold: 18, seed: 7,
    })
    expect(jigsawModule.levelCount?.('animals')).toBe(7)
    deleteScheme(scheme.id)
    expect(jigsawModule.levelCount?.('animals')).toBe(6)
  })

  it('createLevel(n, track)：全专题全关配置合法（imageId 恒为图库条目 / track 正确 / 参数在引擎范围内）', () => {
    for (const topic of ['animals', 'space', 'scenery', 'cartoon'] as const) {
      const count = jigsawModule.levelCount!(topic)
      expect(count).toBe(6)
      for (let n = 1; n <= count; n++) {
        const cfg = jigsawModule.createLevel(n, topic) as JigsawLevelConfig
        expect(cfg.gameId).toBe('jigsaw')
        expect(cfg.n).toBe(n)
        expect(cfg.track).toBe(topic)
        expect(cfg.rows).toBeGreaterThanOrEqual(3)
        expect(cfg.rows).toBeLessThanOrEqual(12)
        expect(cfg.imageId.startsWith(topic)).toBe(true)
        expect(cfg.schemeId?.startsWith('bs-')).toBe(true)
      }
    }
  })

  it('createLevel 非法 track 回落首专题（animals）', () => {
    const cfg = jigsawModule.createLevel(1, undefined) as JigsawLevelConfig
    expect(cfg.track).toBe('animals')
  })

  it('mount 挂载返回完整生命周期实例并可销毁（资产未就绪走错误条路径不崩溃）', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const hooks = { onProgress: () => {}, onComplete: () => {}, onAbandon: () => {} }
    const inst = jigsawModule.mount(container, jigsawModule.createLevel(1, 'animals'), hooks)
    expect(typeof inst.start).toBe('function')
    expect(typeof inst.pause).toBe('function')
    expect(typeof inst.resume).toBe('function')
    expect(typeof inst.destroy).toBe('function')
    inst.start()
    await Promise.resolve()
    await Promise.resolve()
    inst.destroy()
    expect(container.querySelector('.jg-root')).toBeNull()
    container.remove()
  })
})
