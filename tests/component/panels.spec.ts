import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlatformStore } from '@/stores/platform'
import { recordResult } from '@/core/level-manager'
import { exportJson } from '@/core/save'
import { resetEnvAdapter } from '@/services'
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

describe('SettingsPanel 词汇表配置', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    resetEnvAdapter()
  })
  afterEach(() => applyLocale('zh-CN'))

  it('默认显示引擎默认词表（英文桶 3 含 cat）；切类别显示对应默认（拼音一级含 大|da）', async () => {
    const wrapper = mountWithApp(SettingsPanel)

    const text = wrapper.find('[data-role="wb-text"]')
    expect((text.element as HTMLTextAreaElement).value).toContain('cat')

    await wrapper.find('[data-role="wb-category"]').setValue('py-1')
    expect((wrapper.find('[data-role="wb-text"]').element as HTMLTextAreaElement).value).toContain('大|da')

    wrapper.unmount()
  })

  it('编辑英文词表入档：wordbank.english 桶 3 写入存档；切类别再切回显示覆盖', async () => {
    const wrapper = mountWithApp(SettingsPanel)

    await wrapper.find('[data-role="wb-text"]').setValue('dog, fox, owl, bee, ant, hen, yak, elk, ibis, emu')
    const saved = JSON.parse(localStorage.getItem('ludoburrow/save') ?? '{}')
    expect(saved.wordbank).toEqual({
      english: { '3': ['dog', 'fox', 'owl', 'bee', 'ant', 'hen', 'yak', 'elk', 'ibis', 'emu'] },
    })

    // 切走再切回：文本 = 覆盖词表（规范化后逗号分隔）
    await wrapper.find('[data-role="wb-category"]').setValue('en-4')
    await wrapper.find('[data-role="wb-category"]').setValue('en-3')
    expect((wrapper.find('[data-role="wb-text"]').element as HTMLTextAreaElement).value).toBe(
      'dog, fox, owl, bee, ant, hen, yak, elk, ibis, emu',
    )

    wrapper.unmount()
  })

  it('拼音「汉字|拼音」行解析入档：非法行丢弃；恢复本类默认移除覆盖（空配置归一后段整体移除）', async () => {
    const wrapper = mountWithApp(SettingsPanel)

    await wrapper.find('[data-role="wb-category"]').setValue('py-2')
    await wrapper.find('[data-role="wb-text"]').setValue('星星|xing xing\n月亮|YUE Liang\n坏行没有分隔符')
    const saved = JSON.parse(localStorage.getItem('ludoburrow/save') ?? '{}')
    expect(saved.wordbank.pinyin).toEqual({
      '2': [
        { word: '星星', pinyin: 'xing xing' },
        { word: '月亮', pinyin: 'yue liang' }, // 小写归一
      ],
    })

    // 恢复本类默认 → 覆盖移除；仅此一类覆盖时 wordbank 段整体移除，文本回默认
    await wrapper.find('[data-role="wb-reset-category"]').trigger('click')
    const saved2 = JSON.parse(localStorage.getItem('ludoburrow/save') ?? '{}')
    expect(saved2.wordbank).toBeUndefined()
    expect((wrapper.find('[data-role="wb-text"]').element as HTMLTextAreaElement).value).toContain('学校|xue xiao')

    wrapper.unmount()
  })

  it('全部恢复默认：多类别覆盖一次性清空', async () => {
    const wrapper = mountWithApp(SettingsPanel)

    await wrapper.find('[data-role="wb-text"]').setValue('dog, fox')
    await wrapper.find('[data-role="wb-category"]').setValue('py-1')
    await wrapper.find('[data-role="wb-text"]').setValue('雪|xue')
    const saved = JSON.parse(localStorage.getItem('ludoburrow/save') ?? '{}')
    expect(saved.wordbank.english).toBeDefined()
    expect(saved.wordbank.pinyin).toBeDefined()

    await wrapper.find('[data-role="wb-reset-all"]').trigger('click')
    const saved2 = JSON.parse(localStorage.getItem('ludoburrow/save') ?? '{}')
    expect(saved2.wordbank).toBeUndefined()
    // 当前类别（py-1）文本回默认
    expect((wrapper.find('[data-role="wb-text"]').element as HTMLTextAreaElement).value).toContain('大|da')

    wrapper.unmount()
  })
})
