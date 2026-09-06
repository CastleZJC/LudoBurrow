// 键盘多轨全链路（方案 B）：GameContainer 按 level.track 把成绩写入对应模式进度槽
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { registerGame, unregisterGame } from '@/core/game-registry'
import { keygameModule, createKeygameLevel } from '@/games/keygame'
import GameContainer from '@/components/GameContainer.vue'
import { usePlatformStore } from '@/stores/platform'
import { getUnlockedCount, getLevelRecord, getLevelRecords, progressSlotKey } from '@/core/level-manager'
import { mountWithApp } from './helpers'

describe('GameContainer 键盘多轨进度路由', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    registerGame(keygameModule)
  })
  afterEach(() => {
    unregisterGame('keygame')
  })

  it('过关成绩写入 level.track 对应的模式槽（keygame:<mode>），旧单轨槽不受影响', async () => {
    const level = createKeygameLevel(1, 'pinyin')
    const platform = usePlatformStore()
    platform.openLevel(level)

    const wrapper = mountWithApp(GameContainer, { props: { level }, attachTo: document.body })
    for (const ch of level.sequence) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ch.toLowerCase(), cancelable: true }))
      await Promise.resolve()
    }
    await new Promise((r) => setTimeout(r, 0))

    const slot = progressSlotKey('keygame', 'pinyin')
    expect(getUnlockedCount(slot)).toBe(2)
    expect(getLevelRecord(slot, '1')?.stars).toBe(3)
    // 单轨旧槽 keygame 未被写入（多轨模型下不再使用）
    expect(getLevelRecords('keygame')).toEqual({})
    expect(platform.settleInfo?.isFail).toBe(false)
    wrapper.unmount()
  })
})
