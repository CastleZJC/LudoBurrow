// keygame GameModule 契约测试（注册单元形状 + 图标资产存在 + 语言包键齐备）
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { keygameModule } from '@/games/keygame'
import { createKeygameLevel } from '@/games/keygame/level'
import { MESSAGE_LOCALES } from '@/i18n'

describe('keygameModule 契约（GameModule 接口）', () => {
  it('id / name / icon 字段符合约定', () => {
    expect(keygameModule.id).toBe('keygame')
    expect(keygameModule.name).toBe('game.keygame')
    expect(keygameModule.icon).toBe('assets/icons/keygame.svg')
  })

  it('图标资产真实存在（public 分发音资产，相对路径）', () => {
    const iconPath = resolve(process.cwd(), 'public/assets/icons/keygame.svg')
    expect(existsSync(iconPath), `缺少图标文件 ${iconPath}`).toBe(true)
  })

  it('name 键在全部语言包中齐备（t() 可取值）', () => {
    for (const locale of Object.keys(MESSAGE_LOCALES)) {
      const game = (MESSAGE_LOCALES as Record<string, { game: Record<string, string> }>)[locale].game
      expect(game.keygame, `${locale} 缺少 game.keygame`).toBeTruthy()
    }
  })

  it('createLevel 覆盖 1-50 关（合法关卡配置）', () => {
    for (let n = 1; n <= 50; n++) {
      const level = keygameModule.createLevel(n)
      expect(level.gameId).toBe('keygame')
      expect(level.n).toBe(n)
    }
  })

  it('mount 挂载返回完整生命周期实例并可销毁', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const hooks = { onProgress: () => {}, onComplete: () => {}, onAbandon: () => {} }
    const inst = keygameModule.mount(container, createKeygameLevel(1), hooks)
    expect(typeof inst.start).toBe('function')
    expect(typeof inst.pause).toBe('function')
    expect(typeof inst.resume).toBe('function')
    expect(typeof inst.destroy).toBe('function')
    inst.start()
    inst.destroy()
    expect(container.querySelector('.kg-root')).toBeNull()
    container.remove()
  })
})
