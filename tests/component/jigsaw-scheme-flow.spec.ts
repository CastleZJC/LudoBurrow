// 拼图专题轨平台链路测试（方案 = 关卡模型：选关页先选专题再选关，成绩按方案 id 记专题轨）
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import LevelSelect from '@/components/LevelSelect.vue'
import GameContainer from '@/components/GameContainer.vue'
import { registerGame, unregisterGame } from '@/core/game-registry'
import { stubModule, createStubLevel } from '@/games/stub'
import { jigsawModule } from '@/games/jigsaw'
import { usePlatformStore } from '@/stores/platform'
import { createScheme } from '@/games/jigsaw/schemes'
import { recordResult, getUnlockedCount, getLevelRecord } from '@/core/level-manager'
import { mountWithApp } from './helpers'

const PARAMS = { rows: 4, cols: 6, tabDepth: 0.16, uniquenessThreshold: 18, seed: 42 }

describe('LevelSelect 专题轨分流（拼图先选专题，方案 = 关卡）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    registerGame(jigsawModule)
  })
  afterEach(() => unregisterGame('jigsaw'))

  it('渲染 5 个专题页签，默认动物专题 6 关（每图一内置方案），管理入口在位', () => {
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'jigsaw' } })
    const tabs = wrapper.findAll('[data-track]')
    expect(tabs.map((t) => t.attributes('data-track'))).toEqual([
      'animals', 'space', 'scenery', 'cartoon', 'custom',
    ])
    expect(wrapper.find('[data-track="animals"]').classes()).toContain('is-active')
    // 标题展示专题标签；图库 6 张/专题 → 6 关，无第 7 关
    expect(wrapper.find('.select-title').text()).toContain('动物')
    expect(wrapper.find('[data-level="6"]').exists()).toBe(true)
    expect(wrapper.find('[data-level="7"]').exists()).toBe(false)
    expect(wrapper.find('.progress-line').text()).toContain('6')
    // 第 1 关解锁、第 2 关锁定（专题轨独立进度）
    expect(wrapper.find('[data-level="2"]').attributes('disabled')).toBeDefined()
    // 方案管理入口仅在拼图选关页展示
    expect(wrapper.find('[data-nav="schemes"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('规格预热不阻断关卡格（无像素能力环境回落兜底网格，提示行随预热完成消失）', async () => {
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'jigsaw' } })
    // 分析中也不锁关卡：异常环境恒回落兜底，锁死反而进不了关
    expect(wrapper.find('[data-level="1"]').attributes('disabled')).toBeUndefined()
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('[data-role="analyzing"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('切换 custom 专题（无方案）展示空态，不渲染关卡格', async () => {
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'jigsaw' } })
    await wrapper.find('[data-track="custom"]').trigger('click')
    expect(wrapper.find('[data-role="empty-topic"]').exists()).toBe(true)
    expect(wrapper.find('[data-level="1"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('custom 空态直达导入：按钮仅空态展示，点击进方案页并携带自动批量标志（验收返工三）', async () => {
    const platform = usePlatformStore()
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'jigsaw' } })
    await wrapper.find('[data-track="custom"]').trigger('click')
    const btn = wrapper.find('[data-role="empty-import"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('导入')

    await btn.trigger('click')
    expect(platform.view).toBe('schemes')
    expect(platform.schemesAutoBatch).toBe(true)
    wrapper.unmount()
  })

  it('custom 已有方案（非空态）：不展示直达导入按钮', async () => {
    createScheme('我的本地图', { kind: 'custom', assetId: 'asset-x' }, PARAMS)
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'jigsaw' } })
    await wrapper.find('[data-track="custom"]').trigger('click')
    expect(wrapper.find('[data-role="empty-topic"]').exists()).toBe(false)
    expect(wrapper.find('[data-role="empty-import"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('进关配置携带专题与内置方案标记（第 1 关 = bs-animals-05，内置切片调整后块数最少居首）', async () => {
    const platform = usePlatformStore()
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'jigsaw' } })
    await wrapper.find('[data-level="1"]').trigger('click')
    expect(platform.view).toBe('game')
    const cfg = platform.currentLevelConfig as { track?: string; schemeId?: string; imageId?: string }
    expect(cfg.track).toBe('animals')
    expect(cfg.schemeId).toBe('bs-animals-05')
    expect(cfg.imageId).toBe('animals-05')
    wrapper.unmount()
  })

  it('新建用户方案追加为专题末关：第 7 格出现且可进关（config = 方案规格）', async () => {
    // 9×9=81 块 > 内置最大 72 块 → 块数升序排在末位（第 7 关）
    const scheme = createScheme('我的 9×9', { kind: 'builtin', imageId: 'animals-01' }, { ...PARAMS, rows: 9, cols: 9 })
    // 通第 6 关（成绩键 = 内置方案 id）解锁第 7 关
    recordResult('jigsaw:animals', { gameId: 'jigsaw', n: 6, elapsedMs: 60_000, mistakes: 0, stars: 3 }, { total: 7, recordKey: 'bs-animals-06' })
    const platform = usePlatformStore()
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'jigsaw' } })
    expect(wrapper.find('[data-level="7"]').exists()).toBe(true)
    expect(wrapper.find('[data-level="7"]').attributes('disabled')).toBeUndefined()

    await wrapper.find('[data-level="7"]').trigger('click')
    expect(platform.view).toBe('game')
    const cfg = platform.currentLevelConfig as { track?: string; schemeId?: string; rows?: number; cols?: number }
    expect(cfg.track).toBe('animals')
    expect(cfg.schemeId).toBe(scheme.id)
    expect(cfg.rows).toBe(9)
    expect(cfg.cols).toBe(9)
    wrapper.unmount()
  })

  it('方案成绩按方案 id 键渲染星标（第 1 关 = bs-animals-05 的成绩）', () => {
    recordResult('jigsaw:animals', { gameId: 'jigsaw', n: 1, elapsedMs: 30_000, mistakes: 0, stars: 3 }, { total: 6, recordKey: 'bs-animals-05' })
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'jigsaw' } })
    const stars = wrapper.find('[data-level="1"] .level-stars')
    expect(stars.exists()).toBe(true)
    expect(stars.attributes('data-stars')).toBe('3')
    wrapper.unmount()
  })
})

describe('GameContainer 方案成绩分流（方案 id 键写专题轨）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    registerGame(stubModule)
  })
  afterEach(() => unregisterGame('stub'))

  it('schemeId 关卡过关 → 成绩写 track 专题轨的方案 id 键，单轨槽零影响', async () => {
    // 81 块 = animals 末关（第 7 关）：验证「下一关」从末关回选关页
    const scheme = createScheme('S', { kind: 'builtin', imageId: 'animals-01' }, { ...PARAMS, rows: 9, cols: 9 })
    const platform = usePlatformStore()
    const level = { ...createStubLevel(1), track: 'animals', schemeId: scheme.id }
    platform.openLevel(level)

    const wrapper = mountWithApp(GameContainer, { props: { level }, attachTo: document.body })
    const tapBtn = document.querySelector('[data-stub="tap"]') as HTMLButtonElement
    for (let i = 0; i < 5; i++) {
      tapBtn.click()
      await Promise.resolve()
    }
    await new Promise((r) => setTimeout(r, 0))

    expect(platform.settleInfo?.isFail).toBe(false)
    // 专题轨槽：解锁 +1，成绩键 = 方案 id
    expect(getUnlockedCount('stub:animals')).toBe(2)
    expect(getLevelRecord('stub:animals', scheme.id)?.stars).toBe(3)
    // 单轨槽未动（多轨隔离）
    expect(getUnlockedCount('stub')).toBe(1)

    // 方案关「下一关」：该方案为 animals 末关（第 7 关）→ 回选关页
    const nextBtn = document.querySelector('[data-nav="next"]') as HTMLButtonElement
    nextBtn.click()
    await Promise.resolve()
    expect(platform.view).toBe('select')
    wrapper.unmount()
  })
})
