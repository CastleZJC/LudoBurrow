import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlatformStore } from '@/stores/platform'
import { applyLocale } from '@/i18n'

describe('platform store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('初始视图为 menu，无当前游戏', () => {
    const platform = usePlatformStore()
    expect(platform.view).toBe('menu')
    expect(platform.currentGameId).toBeNull()
    expect(platform.settleInfo).toBeNull()
  })

  it('openGameSelect 切换到选关视图并记录游戏', () => {
    const platform = usePlatformStore()
    platform.openGameSelect('stub')
    expect(platform.view).toBe('select')
    expect(platform.currentGameId).toBe('stub')
  })

  it('openLevel 携带关卡配置进入游戏视图', () => {
    const platform = usePlatformStore()
    const config = { gameId: 'stub', n: 3, seed: 1 }
    platform.openLevel(config)
    expect(platform.view).toBe('game')
    expect(platform.currentLevelConfig).toEqual(config)
    expect(platform.currentLevelN).toBe(3)
  })

  it('changeLocale 写设置并立即生效 i18n locale', () => {
    const platform = usePlatformStore()
    platform.changeLocale('en-US')
    expect(platform.settings.locale).toBe('en-US')
    // 持久化经 core/settings（loadSave 校验）
    expect(JSON.parse(localStorage.getItem('ludoburrow/save') ?? '{}').settings.locale).toBe('en-US')
    // 恢复默认语言，避免污染其它测试
    platform.changeLocale('zh-CN')
    applyLocale('zh-CN')
  })

  it('exitToSelect 从结算回到选关并清空结算数据', () => {
    const platform = usePlatformStore()
    platform.openGameSelect('stub')
    platform.setSettle({
      result: { gameId: 'stub', n: 1, elapsedMs: 1000, mistakes: 0, stars: 3 },
      isNewBest: false,
      isFail: false,
    })
    platform.exitToSelect()
    expect(platform.view).toBe('select')
    expect(platform.settleInfo).toBeNull()
  })
})
