// 拼图方案模式平台链路测试（开发计划 3.10：方案隔离/回滚在选关与结算链路的端到端表现）
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import LevelSelect from '@/components/LevelSelect.vue'
import GameContainer from '@/components/GameContainer.vue'
import { registerGame, unregisterGame } from '@/core/game-registry'
import { stubModule, createStubLevel } from '@/games/stub'
import { jigsawModule } from '@/games/jigsaw'
import { usePlatformStore } from '@/stores/platform'
import {
  createScheme,
  recordSchemeResult,
  deactivateSchemes,
  getSchemeUnlockedCount,
  getSchemeLevelRecord,
} from '@/games/jigsaw/schemes'
import { getUnlockedCount } from '@/core/level-manager'
import { mountWithApp } from './helpers'

const PARAMS = { rows: 4, cols: 6, tabDepth: 0.16, uniquenessThreshold: 18, seed: 42 }

describe('LevelSelect 方案模式分流（§11.8 切方案 = 切存档槽）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    registerGame(jigsawModule)
  })
  afterEach(() => unregisterGame('jigsaw'))

  it('激活方案：标题/星标/锁定态/进关配置全部走方案槽，内置槽零影响', async () => {
    const scheme = createScheme('B 图 4×6', { kind: 'builtin', imageId: 'animals-01' }, PARAMS)
    recordSchemeResult(scheme.id, { gameId: 'jigsaw', n: 1, elapsedMs: 30_000, mistakes: 0, stars: 3, meta: {} })
    const platform = usePlatformStore()
    platform.openGameSelect('jigsaw')

    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'jigsaw' } })
    expect(wrapper.find('.select-title').text()).toContain('B 图 4×6')
    // 第 1 关显示方案成绩星标
    expect(wrapper.find('[data-level="1"] .level-stars').exists()).toBe(true)
    // 方案进度解锁 2 关；第 3 关锁定
    expect(wrapper.find('[data-level="2"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-level="3"]').attributes('disabled')).toBeDefined()
    // 内置槽未动（仍只解锁第 1 关）
    expect(getUnlockedCount('jigsaw')).toBe(1)
    // 方案管理入口仅在拼图选关页展示
    expect(wrapper.find('[data-nav="schemes"]').exists()).toBe(true)

    // 进关：config 携带方案标记与规格（n=2 → floor(1/5)=0 → 4×6 原规格）
    await wrapper.find('[data-level="2"]').trigger('click')
    expect(platform.view).toBe('game')
    const cfg = platform.currentLevelConfig as { schemeId?: string; rows?: number; cols?: number; seed: number }
    expect(cfg.schemeId).toBe(scheme.id)
    expect(cfg.rows).toBe(4)
    expect(cfg.cols).toBe(6)
    wrapper.unmount()
  })

  it('未激活方案：走内置曲线（无方案名、第 2 关锁定、config 无 schemeId）', async () => {
    createScheme('闲置方案', { kind: 'builtin', imageId: 'animals-01' }, PARAMS)
    deactivateSchemes()
    const platform = usePlatformStore()
    platform.openGameSelect('jigsaw')

    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'jigsaw' } })
    expect(wrapper.find('.select-title').text()).not.toContain('闲置方案')
    expect(wrapper.find('[data-level="2"]').attributes('disabled')).toBeDefined()

    await wrapper.find('[data-level="1"]').trigger('click')
    expect((platform.currentLevelConfig as { schemeId?: string }).schemeId ?? null).toBeNull()
    wrapper.unmount()
  })
})

describe('GameContainer 方案成绩分流（方案槽写入闭环）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    registerGame(stubModule)
  })
  afterEach(() => unregisterGame('stub'))

  it('schemeId 关卡过关 → 只写方案进度槽，内置槽零影响', async () => {
    const scheme = createScheme('S', { kind: 'builtin', imageId: 'animals-01' }, PARAMS)
    const platform = usePlatformStore()
    const level = { ...createStubLevel(1), schemeId: scheme.id }
    platform.openLevel(level)

    const wrapper = mountWithApp(GameContainer, { props: { level }, attachTo: document.body })
    const tapBtn = document.querySelector('[data-stub="tap"]') as HTMLButtonElement
    for (let i = 0; i < 5; i++) {
      tapBtn.click()
      await Promise.resolve()
    }
    await new Promise((r) => setTimeout(r, 0))

    expect(platform.settleInfo?.isFail).toBe(false)
    expect(getSchemeUnlockedCount(scheme.id)).toBe(2)
    expect(getSchemeLevelRecord(scheme.id, 1)?.stars).toBe(3)
    expect(getUnlockedCount('stub')).toBe(1) // 内置槽未动（§11.8 隔离）
    wrapper.unmount()
  })
})
