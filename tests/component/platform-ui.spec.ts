import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlatformStore } from '@/stores/platform'
import { registerGame, unregisterGame } from '@/core/game-registry'
import { stubModule, createStubLevel } from '@/games/stub'
import GameContainer from '@/components/GameContainer.vue'
import { getUnlockedCount, getLevelRecord } from '@/core/level-manager'
import { mountWithApp } from './helpers'
import { applyLocale, i18n } from '@/i18n'

describe('GameContainer + stub 插件全链路（M1 验收：可玩可结算）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    registerGame(stubModule)
  })
  afterEach(() => {
    unregisterGame('stub')
    applyLocale('zh-CN')
  })

  it('挂载 → 点击 5 次 → onComplete → 结算面板 + 写档解锁', async () => {
    const platform = usePlatformStore()
    const level = createStubLevel(1)
    platform.openLevel(level)

    const wrapper = mountWithApp(GameContainer, {
      props: { level },
      attachTo: document.body,
    })

    // stub 游戏按钮存在于挂载宿主中
    const tapBtn = document.querySelector('[data-stub="tap"]') as HTMLButtonElement
    expect(tapBtn).not.toBeNull()

    // 点击 5 次过关
    for (let i = 0; i < 5; i++) {
      tapBtn.click()
      await Promise.resolve()
    }
    await new Promise((r) => setTimeout(r, 0))

    // 结算面板出现且为成功态
    expect(platform.settleInfo).not.toBeNull()
    expect(platform.settleInfo?.isFail).toBe(false)
    expect(platform.settleInfo?.result.stars).toBe(3)

    // 存档写入：解锁第 2 关 + 星级记录
    expect(getUnlockedCount('stub')).toBe(2)
    expect(getLevelRecord('stub', '1')?.stars).toBe(3)

    // 结算面板渲染
    const settle = wrapper.find('[data-role="settle"]')
    expect(settle.exists()).toBe(true)

    wrapper.unmount()
  })

  it('暂停覆盖层：暂停/继续切换', async () => {
    const platform = usePlatformStore()
    const level = createStubLevel(1)
    platform.openLevel(level)
    const wrapper = mountWithApp(GameContainer, { props: { level } })

    expect(wrapper.find('[data-role="pause"]').exists()).toBe(false)
    await wrapper.find('[data-nav="pause"]').trigger('click')
    expect(wrapper.find('[data-role="pause"]').exists()).toBe(true)
    // 继续游戏：覆盖层消失
    await wrapper.find('[data-nav="resume"]').trigger('click')
    expect(wrapper.find('[data-role="pause"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('destroy 后挂载宿主清空（无残留 DOM）', async () => {
    const platform = usePlatformStore()
    const level = createStubLevel(1)
    platform.openLevel(level)
    const wrapper = mountWithApp(GameContainer, { props: { level }, attachTo: document.body })

    expect(document.querySelector('[data-stub="tap"]')).not.toBeNull()
    wrapper.unmount()
    expect(document.querySelector('[data-stub="tap"]')).toBeNull()
  })

  it('退出关卡：经暂停菜单回选关视图', async () => {
    const platform = usePlatformStore()
    const level = createStubLevel(1)
    platform.openLevel(level)
    const wrapper = mountWithApp(GameContainer, { props: { level } })

    await wrapper.find('[data-nav="pause"]').trigger('click')
    await wrapper.find('[data-nav="exit"]').trigger('click')
    expect(platform.view).toBe('select')

    wrapper.unmount()
  })
})

describe('MainMenu', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    registerGame(stubModule)
  })
  afterEach(() => unregisterGame('stub'))

  it('渲染已注册游戏入口并进入选关', async () => {
    const platform = usePlatformStore()
    const { default: MainMenu } = await import('@/components/MainMenu.vue')
    const wrapper = mountWithApp(MainMenu, { attachTo: document.body })

    const entry = wrapper.find('[data-game="stub"]')
    expect(entry.exists()).toBe(true)
    expect(entry.text()).toContain('示例游戏')

    await entry.trigger('click')
    expect(platform.view).toBe('select')
    expect(platform.currentGameId).toBe('stub')

    wrapper.unmount()
  })

  it('设置入口进入设置视图', async () => {
    const platform = usePlatformStore()
    const { default: MainMenu } = await import('@/components/MainMenu.vue')
    const wrapper = mountWithApp(MainMenu)

    await wrapper.find('[data-menu="settings"]').trigger('click')
    expect(platform.view).toBe('settings')

    wrapper.unmount()
  })

  it('底部居中渲染创建声明（castle.zhang，i18n 单一出处）', async () => {
    const { default: MainMenu } = await import('@/components/MainMenu.vue')
    const wrapper = mountWithApp(MainMenu)

    const credit = wrapper.find('[data-menu="credit"]')
    expect(credit.exists()).toBe(true)
    expect(credit.text()).toBe(i18n.global.t('app.credit'))

    wrapper.unmount()
  })
})
