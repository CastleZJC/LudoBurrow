// 选关页多轨进度测试（方案 B：键盘先选模式页签，各模式独立 50 关进度轨）
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { registerGame, unregisterGame } from '@/core/game-registry'
import { keygameModule } from '@/games/keygame'
import { stubModule } from '@/games/stub'
import LevelSelect from '@/components/LevelSelect.vue'
import { usePlatformStore } from '@/stores/platform'
import { recordResult, progressSlotKey } from '@/core/level-manager'
import { mountWithApp } from './helpers'

describe('LevelSelect 多轨进度（键盘四模式页签）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    registerGame(keygameModule)
  })
  afterEach(() => {
    unregisterGame('keygame')
  })

  it('键盘渲染四个模式页签，默认选中首轨（全键盘）', () => {
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'keygame' } })
    const tabs = wrapper.findAll('[data-track]')
    expect(tabs.map((t) => t.attributes('data-track'))).toEqual([
      'full-random', 'compact-random', 'english', 'pinyin',
    ])
    expect(wrapper.find('[data-track="full-random"]').classes()).toContain('is-active')
    wrapper.unmount()
  })

  it('切换模式页签展示该轨独立进度（解锁数互不影响）', async () => {
    // 全键盘轨通到第 3 关
    const full = progressSlotKey('keygame', 'full-random')
    recordResult(full, { gameId: 'keygame', n: 1, elapsedMs: 9_000, mistakes: 0, stars: 3 })
    recordResult(full, { gameId: 'keygame', n: 2, elapsedMs: 9_000, mistakes: 0, stars: 3 })

    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'keygame' } })
    // 默认全键盘轨：第 3 关已解锁
    expect(wrapper.find('[data-level="3"]').classes()).not.toContain('is-locked')
    // 切到拼音轨：仅第 1 关解锁，第 3 关锁定
    await wrapper.find('[data-track="pinyin"]').trigger('click')
    expect(wrapper.find('[data-track="pinyin"]').classes()).toContain('is-active')
    expect(wrapper.find('[data-level="3"]').classes()).toContain('is-locked')
    expect(wrapper.find('[data-level="1"]').classes()).not.toContain('is-locked')
    wrapper.unmount()
  })

  it('点击关卡以选中模式为 track 打开关卡（写入 currentLevelConfig.track）', async () => {
    const platform = usePlatformStore()
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'keygame' } })
    await wrapper.find('[data-track="english"]').trigger('click')
    await wrapper.find('[data-level="1"]').trigger('click')
    expect(platform.view).toBe('game')
    expect(platform.currentLevelConfig?.gameId).toBe('keygame')
    expect(platform.currentLevelConfig?.track).toBe('english')
    wrapper.unmount()
  })

  it('单轨游戏（无 tracks）不渲染模式页签', () => {
    registerGame(stubModule)
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'stub' } })
    expect(wrapper.findAll('[data-track]')).toHaveLength(0)
    wrapper.unmount()
    unregisterGame('stub')
  })
})
