import { describe, it, expect, afterEach } from 'vitest'
import { registerGame, listGames, getGame, unregisterGame } from '@/core/game-registry'
import type { GameModule } from '@/core/types'

function stubModule(id: string): GameModule {
  return {
    id,
    name: `game.${id}`,
    icon: `assets/icons/${id}.svg`,
    createLevel: (n: number) => ({ gameId: id, n, seed: n }),
    mount: () => ({ start() {}, pause() {}, resume() {}, destroy() {} }),
  }
}

describe('game-registry', () => {
  afterEach(() => {
    unregisterGame('alpha')
    unregisterGame('beta')
  })

  it('注册后可按 id 获取同一模块', () => {
    const mod = stubModule('alpha')
    registerGame(mod)
    expect(getGame('alpha')).toBe(mod)
  })

  it('listGames 返回全部已注册游戏', () => {
    registerGame(stubModule('alpha'))
    registerGame(stubModule('beta'))
    const ids = listGames().map((m) => m.id)
    expect(ids).toContain('alpha')
    expect(ids).toContain('beta')
  })

  it('重复 id 注册被拒绝（抛错）', () => {
    registerGame(stubModule('alpha'))
    expect(() => registerGame(stubModule('alpha'))).toThrow(/重复/)
  })

  it('未注册 id 返回 undefined', () => {
    expect(getGame('nonexistent')).toBeUndefined()
  })
})
