// stub 示例游戏：验证 GameModule 插件链路（技术架构 §8 场景 B 示范）
// M1 用于平台链路与浏览器手工验证；正式游戏（keygame/jigsaw/maze）就位后不再注册

import type { BaseLevelConfig, GameHooks, GameInstance, GameModule } from '@/core/types'
import { levelSeed } from '@/engines/rng'

interface StubLevelConfig extends BaseLevelConfig {
  gameId: 'stub'
  /** 需要点击的次数 */
  targetClicks: number
}

const TARGET_CLICKS = 5

export function createStubLevel(n: number): StubLevelConfig {
  return { gameId: 'stub', n, seed: levelSeed('stub', n), targetClicks: TARGET_CLICKS }
}

export function mountStub(container: HTMLElement, level: BaseLevelConfig, hooks: GameHooks): GameInstance {
  const cfg = level as StubLevelConfig
  let clicks = 0
  let state: 'idle' | 'running' | 'paused' | 'destroyed' = 'idle'
  let startedAt = 0

  const btn = document.createElement('button')
  btn.setAttribute('data-stub', 'tap')
  btn.className = 'stub-btn'
  const render = () => {
    btn.textContent = `${clicks} / ${cfg.targetClicks}`
  }
  render()
  container.appendChild(btn)

  const onClick = () => {
    if (state !== 'running') return
    clicks++
    hooks.onProgress({ gameId: 'stub', n: cfg.n, done: clicks, total: cfg.targetClicks })
    render()
    if (clicks >= cfg.targetClicks) {
      const elapsedMs = Date.now() - startedAt
      hooks.onComplete({ gameId: 'stub', n: cfg.n, elapsedMs, mistakes: 0, stars: 3 })
    }
  }
  btn.addEventListener('click', onClick)

  return {
    start() {
      state = 'running'
      startedAt = Date.now()
    },
    pause() {
      state = 'paused'
    },
    resume() {
      state = 'running'
    },
    destroy() {
      state = 'destroyed'
      btn.removeEventListener('click', onClick)
      btn.remove()
    },
  }
}

export const stubModule: GameModule = {
  id: 'stub',
  name: 'game.stub',
  icon: 'assets/icons/stub.svg',
  createLevel: createStubLevel,
  mount: mountStub,
}
