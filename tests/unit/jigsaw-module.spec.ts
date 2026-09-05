// jigsaw GameModule 契约测试（注册单元形状 + 图标资产存在 + 语言包键齐备 + 50 关配置合法）
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { jigsawModule } from '@/games/jigsaw'
import { GALLERY } from '@/games/jigsaw/gallery'
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
      for (const key of ['help', 'abandon', 'grid', 'helps', 'loadError', 'topicAnimals', 'topicSpace', 'topicScenery', 'topicCartoon']) {
        expect(messages.jigsaw[key], `${locale} 缺少 jigsaw.${key}`).toBeTruthy()
      }
    }
  })

  it('createLevel 覆盖 1-50 关（gridSize 阶梯 + imageId 恒为图库条目）', () => {
    for (let n = 1; n <= 50; n++) {
      const level = jigsawModule.createLevel(n)
      expect(level.gameId).toBe('jigsaw')
      expect(level.n).toBe(n)
      const cfg = level as JigsawLevelConfig
      expect(cfg.gridSize).toBeGreaterThanOrEqual(3)
      expect(cfg.gridSize).toBeLessThanOrEqual(9)
      expect(GALLERY.some((e) => e.id === cfg.imageId)).toBe(true)
    }
  })

  it('mount 挂载返回完整生命周期实例并可销毁（资产未就绪走错误条路径不崩溃）', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const hooks = { onProgress: () => {}, onComplete: () => {}, onAbandon: () => {} }
    const inst = jigsawModule.mount(container, jigsawModule.createLevel(1), hooks)
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
