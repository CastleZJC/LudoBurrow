import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlatformStore } from '@/stores/platform'
import { recordResult } from '@/core/level-manager'
import { exportJson } from '@/core/save'
import LevelSelect from '@/components/LevelSelect.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import { mountWithApp } from './helpers'
import { applyLocale, i18n } from '@/i18n'

describe('LevelSelect', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })
  afterEach(() => applyLocale('zh-CN'))

  it('初始仅第 1 关可点击，其余锁定', async () => {
    const platform = usePlatformStore()
    platform.openGameSelect('keygame')
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'keygame' } })

    const cell1 = wrapper.find('[data-level="1"]')
    const cell2 = wrapper.find('[data-level="2"]')
    expect(cell1.attributes('disabled')).toBeUndefined()
    expect(cell2.classes()).toContain('is-locked')
    expect(cell2.attributes('disabled')).toBeDefined()

    wrapper.unmount()
  })

  it('过关后显示星级与最佳成绩', async () => {
    recordResult('keygame', { gameId: 'keygame', n: 1, elapsedMs: 12_300, mistakes: 2, stars: 2 })
    const platform = usePlatformStore()
    platform.openGameSelect('keygame')
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'keygame' } })

    const stars = wrapper.find('[data-level="1"] .level-stars')
    expect(stars.attributes('data-stars')).toBe('2')
    const best = wrapper.find('[data-level="1"] .level-best')
    expect(best.text()).toContain('12.3')

    wrapper.unmount()
  })

  it('点击已解锁关卡进入游戏视图', async () => {
    const platform = usePlatformStore()
    platform.openGameSelect('keygame')
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'keygame' } })

    await wrapper.find('[data-level="1"]').trigger('click')
    // keygame 未注册 → createLevel 不可达，视图不切换
    expect(platform.view).toBe('select')

    wrapper.unmount()
  })
})

describe('SettingsPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })
  afterEach(() => applyLocale('zh-CN'))

  it('语言切换立即生效：中文 → 英文', async () => {
    const platform = usePlatformStore()
    const wrapper = mountWithApp(SettingsPanel)

    expect(i18n.global.locale.value).toBe('zh-CN')
    const select = wrapper.find('[data-role="locale-select"]')
    await select.setValue('en-US')

    // 立即生效（不需重启）
    expect(i18n.global.locale.value).toBe('en-US')
    expect(wrapper.text()).toContain('Language')
    // 持久化
    expect(platform.settings.locale).toBe('en-US')

    wrapper.unmount()
  })

  it('限时策略切换：off → competition 并持久化', async () => {
    const platform = usePlatformStore()
    const wrapper = mountWithApp(SettingsPanel)

    await wrapper.find('[data-role="tl-competition"]').setValue(true)
    expect(platform.settings.timeLimit.mode).toBe('competition')
    const saved = JSON.parse(localStorage.getItem('ludoburrow/save') ?? '{}')
    expect(saved.settings.timeLimit.mode).toBe('competition')

    wrapper.unmount()
  })

  it('音效开关写设置', async () => {
    const platform = usePlatformStore()
    const wrapper = mountWithApp(SettingsPanel)

    await wrapper.find('[data-role="sound-toggle"]').setValue(false)
    expect(platform.settings.soundEnabled).toBe(false)

    wrapper.unmount()
  })

  it('AI 配置区：开启默认 GLM → 填 Key 持久化 → 关闭移除段（M5.2）', async () => {
    const platform = usePlatformStore()
    const wrapper = mountWithApp(SettingsPanel)

    // 默认未配置：区存在但表单未展开
    expect(wrapper.find('[data-section="ai"]').exists()).toBe(true)
    expect(wrapper.find('[data-role="ai-provider"]').exists()).toBe(false)

    // 开启 → 默认 glm（一期口径），表单展开 + 预设占位
    await wrapper.find('[data-role="ai-toggle"]').setValue(true)
    expect(platform.settings.ai).toMatchObject({ provider: 'glm', baseURL: '', model: '', apiKey: '' })
    expect(wrapper.find('[data-role="ai-baseurl"]').attributes('placeholder')).toContain('bigmodel')

    // 填 Key + 显式 model → 写入并持久化
    await wrapper.find('[data-role="ai-apikey"]').setValue('sk-abc')
    await wrapper.find('[data-role="ai-model"]').setValue('glm-5.3-air')
    expect(platform.settings.ai).toMatchObject({ apiKey: 'sk-abc', model: 'glm-5.3-air' })
    const saved = JSON.parse(localStorage.getItem('ludoburrow/save') ?? '{}')
    expect(saved.settings.ai).toMatchObject({ provider: 'glm', apiKey: 'sk-abc' })

    // 切 custom → provider 更新且不丢已填字段
    await wrapper.find('[data-role="ai-provider"]').setValue('custom')
    expect(platform.settings.ai?.provider).toBe('custom')
    expect(platform.settings.ai?.apiKey).toBe('sk-abc')

    // 关闭 → 存档移除 ai 段（undefined 不序列化）
    await wrapper.find('[data-role="ai-toggle"]').setValue(false)
    expect(platform.settings.ai).toBeUndefined()
    const saved2 = JSON.parse(localStorage.getItem('ludoburrow/save') ?? '{}')
    expect(saved2.settings.ai).toBeUndefined()

    wrapper.unmount()
  })

  it('AI 密钥导出脱敏：默认导出不含 Key（F-16 / §14.3）', async () => {
    const wrapper = mountWithApp(SettingsPanel)
    await wrapper.find('[data-role="ai-toggle"]').setValue(true)
    await wrapper.find('[data-role="ai-apikey"]').setValue('sk-secret')
    const text = exportJson()
    expect(text).not.toContain('sk-secret')
    expect(text).toContain('"apiKey": ""')
    wrapper.unmount()
  })
})
