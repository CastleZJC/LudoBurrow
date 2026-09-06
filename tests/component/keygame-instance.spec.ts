// 键盘游戏实例测试（渲染 / keydown 比对 / 进度失误 / 反馈 / 生命周期）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mountKeygame } from '@/games/keygame/instance'
import { createKeygameLevel, type KeygameLevelConfig } from '@/games/keygame/level'
import type { GameHooks } from '@/core/types'
import { i18n } from '@/i18n'

/** 手工关卡工厂：绕过难度曲线，精确控制序列与布局 */
function makeLevel(patch: Partial<KeygameLevelConfig> = {}): KeygameLevelConfig {
  return {
    gameId: 'keygame',
    n: 1,
    seed: 42,
    mode: 'full-random',
    layout: 'full',
    sequence: ['A', 'B', 'C'],
    segments: [{ chars: 'ABC', hint: '' }],
    ...patch,
  }
}

function pressKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }))
}

function makeHooks() {
  return {
    onProgress: vi.fn(),
    onComplete: vi.fn(),
    onAbandon: vi.fn(),
  } satisfies GameHooks
}

let container: HTMLElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

describe('渲染', () => {
  it('大键盘：主区 61 键 + 数字小键盘区 17 键 = 78 键，布局标记 full', () => {
    const inst = mountKeygame(container, makeLevel(), makeHooks())
    inst.start()
    const kb = container.querySelector('.kg-kb') as HTMLElement
    expect(kb.dataset.layout).toBe('full')
    expect(container.querySelectorAll('.kg-key')).toHaveLength(78)
    expect(container.querySelector('.kg-kb-num')).not.toBeNull()
    inst.destroy()
  })

  it('小键盘：61 键、无数字小键盘区，布局标记 compact', () => {
    const inst = mountKeygame(container, makeLevel({ layout: 'compact', mode: 'compact-random' }), makeHooks())
    inst.start()
    const kb = container.querySelector('.kg-kb') as HTMLElement
    expect(kb.dataset.layout).toBe('compact')
    expect(container.querySelectorAll('.kg-key')).toHaveLength(61)
    expect(container.querySelector('.kg-kb-num')).toBeNull()
    inst.destroy()
  })

  it('HUD 展示模式名（经 i18n）、失误与进度初值', () => {
    const hooks = makeHooks()
    const inst = mountKeygame(container, makeLevel(), hooks)
    expect(container.querySelector('[data-kg="mode"]')?.textContent).toBe(
      i18n.global.t('keygame.modeFull'),
    )
    expect(container.querySelector('[data-kg="mistakes"]')?.textContent).toContain('0')
    expect(container.querySelector('[data-kg="progress"]')?.textContent).toBe('0/3')
    inst.destroy()
  })

  it('目标字符逐个渲染，拼音模式展示汉字提示', () => {
    const hooks = makeHooks()
    const inst = mountKeygame(
      container,
      makeLevel({ mode: 'pinyin', sequence: ['D', 'A'], segments: [{ chars: 'DA', hint: '大' }] }),
      hooks,
    )
    const chars = [...container.querySelectorAll('.kg-ch')].map((el) => el.textContent)
    expect(chars).toEqual(['D', 'A'])
    expect(container.querySelector('.kg-hint')?.textContent).toBe('大')
    inst.destroy()
  })
})

describe('输入比对与进度', () => {
  it('正确键依次推进，进度/字符状态实时刷新，完成上报', () => {
    const hooks = makeHooks()
    const inst = mountKeygame(container, makeLevel(), hooks)
    inst.start()

    pressKey('a')
    expect(container.querySelector('[data-kg="progress"]')?.textContent).toBe('1/3')
    expect(container.querySelectorAll('.kg-ch.done')).toHaveLength(1)
    expect(hooks.onProgress).toHaveBeenCalledWith({ gameId: 'keygame', n: 1, done: 1, total: 3 })

    pressKey('b')
    pressKey('c')
    expect(container.querySelector('[data-kg="progress"]')?.textContent).toBe('3/3')
    expect(hooks.onProgress).toHaveBeenCalledTimes(3)
    expect(hooks.onComplete).toHaveBeenCalledTimes(1)
    expect(hooks.onComplete).toHaveBeenCalledWith({
      gameId: 'keygame',
      n: 1,
      elapsedMs: 0,
      mistakes: 0,
      stars: 3,
    })
    inst.destroy()
  })

  it('错误键计入失误、不推进进度、不触发 onProgress', () => {
    const hooks = makeHooks()
    const inst = mountKeygame(container, makeLevel(), hooks)
    inst.start()

    pressKey('z')
    expect(container.querySelector('[data-kg="mistakes"]')?.textContent).toContain('1')
    expect(container.querySelector('[data-kg="progress"]')?.textContent).toBe('0/3')
    expect(hooks.onProgress).not.toHaveBeenCalled()
    expect(hooks.onComplete).not.toHaveBeenCalled()

    pressKey('a')
    pressKey('b')
    pressKey('c')
    expect(hooks.onComplete).toHaveBeenCalledWith({
      gameId: 'keygame',
      n: 1,
      elapsedMs: 0,
      mistakes: 1,
      stars: 1,
    })
    inst.destroy()
  })

  it('错误键在虚拟键盘上给出目标键红闪提示', () => {
    const hooks = makeHooks()
    const inst = mountKeygame(container, makeLevel(), hooks)
    inst.start()
    pressKey('z')
    expect(container.querySelector('.kg-key[data-key="A"]')?.classList.contains('kg-key-err')).toBe(true)
    inst.destroy()
  })

  it('命中键有绿闪反馈', () => {
    const hooks = makeHooks()
    const inst = mountKeygame(container, makeLevel(), hooks)
    inst.start()
    pressKey('a')
    expect(container.querySelector('.kg-key[data-key="A"]')?.classList.contains('kg-key-hit')).toBe(true)
    inst.destroy()
  })

  it('当前目标键高亮（呼吸提示），数字目标同时高亮主行与小键盘数字键', () => {
    const hooks = makeHooks()
    const inst = mountKeygame(
      container,
      makeLevel({ sequence: ['5'], segments: [{ chars: '5', hint: '' }] }),
      hooks,
    )
    inst.start()
    expect(container.querySelector('.kg-key[data-key="5"]')?.classList.contains('kg-key-next')).toBe(true)
    expect(container.querySelector('.kg-key[data-key="numpad5"]')?.classList.contains('kg-key-next')).toBe(true)
    inst.destroy()
  })
})

describe('生命周期', () => {
  it('start 前不响应输入', () => {
    const hooks = makeHooks()
    const inst = mountKeygame(container, makeLevel(), hooks)
    pressKey('a')
    expect(hooks.onProgress).not.toHaveBeenCalled()
    expect(container.querySelector('[data-kg="progress"]')?.textContent).toBe('0/3')
    inst.destroy()
  })

  it('pause 期间忽略输入，resume 后恢复', () => {
    const hooks = makeHooks()
    const inst = mountKeygame(container, makeLevel(), hooks)
    inst.start()
    inst.pause()
    pressKey('a')
    expect(container.querySelector('[data-kg="progress"]')?.textContent).toBe('0/3')
    inst.resume()
    pressKey('a')
    expect(container.querySelector('[data-kg="progress"]')?.textContent).toBe('1/3')
    inst.destroy()
  })

  it('完成后继续按键不重复结算', () => {
    const hooks = makeHooks()
    const inst = mountKeygame(container, makeLevel(), hooks)
    inst.start()
    for (const ch of ['a', 'b', 'c']) pressKey(ch)
    pressKey('a')
    expect(hooks.onComplete).toHaveBeenCalledTimes(1)
    inst.destroy()
  })

  it('destroy 清空容器并移除全局监听（按键无副作用）', () => {
    const hooks = makeHooks()
    const inst = mountKeygame(container, makeLevel(), hooks)
    inst.start()
    inst.destroy()
    expect(container.querySelector('.kg-root')).toBeNull()
    expect(() => pressKey('a')).not.toThrow()
    expect(hooks.onProgress).not.toHaveBeenCalled()
  })
})

describe('真实关卡集成（四模式难度曲线产物可直接游玩）', () => {
  const MODES = ['full-random', 'compact-random', 'english', 'pinyin'] as const
  it.each([...MODES])('%s 模式第 1/25/50 关：全序列输入完成，0 失误 3 星', (mode) => {
    for (const n of [1, 25, 50]) {
      const level = createKeygameLevel(n, mode)
      const hooks = makeHooks()
      const inst = mountKeygame(container, level, hooks)
      inst.start()
      for (const ch of level.sequence) {
        pressKey(ch.toLowerCase())
      }
      const total = level.sequence.length
      expect(hooks.onProgress).toHaveBeenCalledTimes(total)
      expect(hooks.onComplete).toHaveBeenCalledWith({
        gameId: 'keygame',
        n,
        elapsedMs: 0,
        mistakes: 0,
        stars: 3,
      })
      inst.destroy()
    }
  })
})
