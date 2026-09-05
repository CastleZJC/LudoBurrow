// SchemeManager 组件测试（开发计划 3.6 预切块工作流 / 3.7 确认与隔离 / 3.11 上传闭环）
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import SchemeManager from '@/components/SchemeManager.vue'
import { mountWithApp } from './helpers'
import { usePlatformStore } from '@/stores/platform'
import {
  listSchemes, createScheme, recordSchemeResult, activeScheme, deactivateSchemes,
} from '@/games/jigsaw/schemes'
import type { LevelResult } from '@/core/types'

// services 适配层 mock：素材仓库走内存假实现（真实 IndexedDB 仓库由 services.spec 覆盖）
const { saveImageMock } = vi.hoisted(() => ({ saveImageMock: vi.fn() }))
vi.mock('@/services', () => ({
  getEnvAdapter: () => ({
    auth: { getCurrentUser: () => ({ id: 'local', name: 'local', anonymous: true }) },
    assetRepo: {
      saveImage: saveImageMock,
      listImages: async () => [],
      loadImage: async () => {
        throw new Error('unused in this spec')
      },
      deleteImage: async () => {},
    },
  }),
}))

// AI 建议链路 mock（M5.5）：降级链编排在 ai-suggest.spec 覆盖，此处只验 UI 接线与入档
const { suggestMock, loadSourceImageMock, downscaleMock } = vi.hoisted(() => ({
  suggestMock: vi.fn(),
  loadSourceImageMock: vi.fn(),
  downscaleMock: vi.fn(),
}))
vi.mock('@/ai/suggest', () => ({ suggestCutPlan: suggestMock }))
vi.mock('@/games/jigsaw/gallery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/games/jigsaw/gallery')>()
  return { ...actual, loadSourceImage: loadSourceImageMock, downscaleToAnalysis: downscaleMock }
})

function result(n: number): LevelResult {
  return { gameId: 'jigsaw', n, elapsedMs: 60_000, mistakes: 0, stars: 3, meta: {} }
}

beforeAll(() => {
  // happy-dom 无 blob URL 实现时兜底（预览路径非关键）
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:mock', configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true })
})

describe('SchemeManager 渲染与新建', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    saveImageMock.mockReset()
  })

  it('默认态：内置行激活、空列表提示、新建按钮', () => {
    const wrapper = mountWithApp(SchemeManager)
    expect(wrapper.find('[data-role="builtin-track"].is-active').exists()).toBe(true)
    expect(wrapper.text()).toContain('还没有自定义方案')
    expect(wrapper.find('[data-role="new-scheme"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('新建内置方案全流程：填名保存 → 卡片出现并激活、内置行让位', async () => {
    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-field="name"]').setValue('小狗 6×6')
    await wrapper.find('[data-role="save-scheme"]').trigger('click')

    const schemes = listSchemes()
    expect(schemes).toHaveLength(1)
    expect(schemes[0]!.name).toBe('小狗 6×6')
    expect(schemes[0]!.source).toEqual({ kind: 'builtin', imageId: 'animals-01' })
    expect(activeScheme()?.id).toBe(schemes[0]!.id)

    // 面板关闭 + 列表镜像刷新
    expect(wrapper.find('[data-role="scheme-editor"]').exists()).toBe(false)
    expect(wrapper.find('[data-role="builtin-track"].is-active').exists()).toBe(false)
    expect(wrapper.find('[data-role="use-builtin"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('小狗 6×6')
    wrapper.unmount()
  })

  it('非法参数（行数 15）：显示错误且不创建', async () => {
    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-field="rows"]').setValue(15)
    await wrapper.find('[data-role="save-scheme"]').trigger('click')

    expect(wrapper.find('[data-role="scheme-error"]').text()).toBe('参数超出范围')
    expect(listSchemes()).toHaveLength(0)
    wrapper.unmount()
  })

  it('custom 来源未上传图片：提示需先上传', async () => {
    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-role="source-custom"]').trigger('click')
    await wrapper.find('[data-role="save-scheme"]').trigger('click')

    expect(wrapper.find('[data-role="scheme-error"]').text()).toBe('请先上传图片')
    expect(listSchemes()).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('SchemeManager 上传闭环（M3.11）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    saveImageMock.mockReset().mockResolvedValue({ id: 'asset-1' })
  })

  it('上传 → 素材入库 → 保存方案只存引用', async () => {
    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-role="source-custom"]').trigger('click')

    const upload = wrapper.find('[data-field="upload"]')
    const file = new File(['fake-image'], 'cat.png', { type: 'image/png' })
    Object.defineProperty(upload.element, 'files', { value: [file], configurable: true })
    await upload.trigger('change')
    await new Promise((r) => setTimeout(r, 0))

    expect(saveImageMock).toHaveBeenCalledTimes(1)
    expect(saveImageMock.mock.calls[0]![0]).toBe(file)
    expect(wrapper.find('[data-role="upload-ok"]').exists()).toBe(true)

    await wrapper.find('[data-role="save-scheme"]').trigger('click')
    const schemes = listSchemes()
    expect(schemes).toHaveLength(1)
    expect(schemes[0]!.source).toEqual({ kind: 'custom', assetId: 'asset-1' })
    wrapper.unmount()
  })

  it('非图片文件被前端拒绝，不入库', async () => {
    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-role="source-custom"]').trigger('click')

    const upload = wrapper.find('[data-field="upload"]')
    const file = new File(['text'], 'note.txt', { type: 'text/plain' })
    Object.defineProperty(upload.element, 'files', { value: [file], configurable: true })
    await upload.trigger('change')
    await new Promise((r) => setTimeout(r, 0))

    expect(saveImageMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-role="upload-error"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('SchemeManager 确认与隔离（F-17 / F-18）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    saveImageMock.mockReset()
  })

  it('F-18：同图已有方案在玩 → 首次保存进确认态，二次点击才新建（历史方案保留）', async () => {
    const existing = createScheme('原图方案', { kind: 'builtin', imageId: 'animals-01' }, {
      rows: 4, cols: 4, tabDepth: 0.16, uniquenessThreshold: 18, seed: 42,
    })
    recordSchemeResult(existing.id, result(1)) // unlocked=2 > 1 → 在玩

    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-field="name"]').setValue('重新切块')
    await wrapper.find('[data-role="save-scheme"]').trigger('click')

    // 首次：进入确认态（按钮文案切换 + 未创建）
    expect(wrapper.find('[data-role="save-confirm"]').exists()).toBe(true)
    expect(listSchemes()).toHaveLength(1)

    // 二次：确认新建平行方案
    await wrapper.find('[data-role="save-confirm"]').trigger('click')
    expect(listSchemes()).toHaveLength(2)
    expect(activeScheme()?.name).toBe('重新切块')
    // 历史方案进度不受影响
    expect(listSchemes().find((s) => s.id === existing.id)?.progress.unlockedCount).toBe(2)
    wrapper.unmount()
  })

  it('同图方案未在玩（仅解锁第 1 关）：无需确认直接创建', async () => {
    createScheme('刚建的', { kind: 'builtin', imageId: 'animals-01' }, {
      rows: 4, cols: 4, tabDepth: 0.16, uniquenessThreshold: 18, seed: 42,
    })
    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-role="save-scheme"]').trigger('click')
    expect(listSchemes()).toHaveLength(2)
    wrapper.unmount()
  })

  it('删除二次确认：首次弹确认文案，二次执行且其他进度隔离', async () => {
    const a = createScheme('A', { kind: 'builtin', imageId: 'animals-01' }, {
      rows: 4, cols: 4, tabDepth: 0.16, uniquenessThreshold: 18, seed: 42,
    })
    const b = createScheme('B', { kind: 'builtin', imageId: 'space-01' }, {
      rows: 5, cols: 5, tabDepth: 0.16, uniquenessThreshold: 18, seed: 43,
    })
    recordSchemeResult(b.id, result(1))

    const wrapper = mountWithApp(SchemeManager)
    const delBtn = wrapper.find(`[data-scheme="${a.id}"] [data-role="delete-scheme"]`)
    await delBtn.trigger('click')
    // 首次：确认态、未删除
    expect(wrapper.find(`[data-scheme="${a.id}"] [data-role="delete-confirm"]`).exists()).toBe(true)
    expect(listSchemes()).toHaveLength(2)

    await wrapper.find(`[data-scheme="${a.id}"] [data-role="delete-confirm"]`).trigger('click')
    expect(listSchemes().map((s) => s.id)).toEqual([b.id])
    // B 进度隔离保留
    expect(listSchemes()[0]!.progress.unlockedCount).toBe(2)
    wrapper.unmount()
  })
})

describe('SchemeManager 导航', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    saveImageMock.mockReset()
  })

  it('开玩：激活方案并跳转拼图选关', async () => {
    const scheme = createScheme('A', { kind: 'builtin', imageId: 'animals-01' }, {
      rows: 4, cols: 4, tabDepth: 0.16, uniquenessThreshold: 18, seed: 42,
    })
    deactivateSchemes()
    const platform = usePlatformStore()

    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find(`[data-scheme="${scheme.id}"] [data-role="play-scheme"]`).trigger('click')

    expect(activeScheme()?.id).toBe(scheme.id)
    expect(platform.view).toBe('select')
    expect(platform.currentGameId).toBe('jigsaw')
    wrapper.unmount()
  })

  it('返回按钮：回选关视图', async () => {
    const platform = usePlatformStore()
    platform.openGameSelect('jigsaw')
    platform.openSchemes()
    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-nav="back"]').trigger('click')
    expect(platform.view).toBe('select')
    wrapper.unmount()
  })

  it('回到内置：激活位归零、方案保留', async () => {
    createScheme('A', { kind: 'builtin', imageId: 'animals-01' }, {
      rows: 4, cols: 4, tabDepth: 0.16, uniquenessThreshold: 18, seed: 42,
    })
    const wrapper = mountWithApp(SchemeManager)
    expect(wrapper.find('[data-role="use-builtin"]').exists()).toBe(true)
    await wrapper.find('[data-role="use-builtin"]').trigger('click')
    expect(activeScheme()?.id ?? null).toBeNull()
    expect(listSchemes()).toHaveLength(1)
    expect(wrapper.find('[data-role="builtin-track"].is-active').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('SchemeManager AI 建议链路（M5.5 / §14.4 非阻断降级）', () => {
  const PLAN_STUB = { pieces: [] }

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    saveImageMock.mockReset()
    suggestMock.mockReset()
    loadSourceImageMock.mockReset().mockResolvedValue({ width: 96, height: 96 })
    downscaleMock.mockReset().mockReturnValue({
      width: 96,
      height: 96,
      data: new Uint8ClampedArray(96 * 96 * 4).fill(128),
    })
  })

  it('内置图可直接请求；自定义来源未上传时按钮禁用', async () => {
    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')

    const btn = () => wrapper.find('[data-role="ai-suggest"]').element as HTMLButtonElement
    expect(btn().disabled).toBe(false)

    await wrapper.find('[data-role="source-custom"]').trigger('click')
    expect(btn().disabled).toBe(true)
    wrapper.unmount()
  })

  it('applied：建议回填表单 + 提示，保存 → suggestion 随方案入档', async () => {
    suggestMock.mockResolvedValue({
      kind: 'applied',
      plan: PLAN_STUB,
      suggestion: {
        rows: 3,
        cols: 5,
        rowWeights: [0.2, 0.3, 0.5],
        colWeights: [0.4, 0.2, 0.2, 0.1, 0.1],
      },
    })

    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-field="rows"]').setValue(4) // 建议将覆盖为 3
    await wrapper.find('[data-role="ai-suggest"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    // 请求参数：base 来自表单、图 = 内置缩略 data URI、ai 未配置（未开启）
    const call = suggestMock.mock.calls[0] as unknown[]
    expect(call[1]).toMatchObject({ rows: 4, cols: 4 })
    expect(String(call[3]).startsWith('data:image/png;base64,')).toBe(true)
    expect(call[4]).toBeUndefined()

    // 表单回填 + 非阻断提示
    const inputVal = (sel: string): string => (wrapper.find(sel).element as HTMLInputElement).value
    expect(inputVal('[data-field="rows"]')).toBe('3')
    expect(inputVal('[data-field="cols"]')).toBe('5')
    expect(wrapper.find('[data-role="ai-feedback"]').text()).toContain('3×5')

    // 保存 → 权重入档（长度与网格一致）
    await wrapper.find('[data-role="save-scheme"]').trigger('click')
    const scheme = listSchemes()[0]!
    expect(scheme.params.rows).toBe(3)
    expect(scheme.params.cols).toBe(5)
    expect(scheme.params.suggestion).toEqual({
      rowWeights: [0.2, 0.3, 0.5],
      colWeights: [0.4, 0.2, 0.2, 0.1, 0.1],
    })
    wrapper.unmount()
  })

  it('fallback（未配置）：非阻断提示去设置页，保存不带 suggestion', async () => {
    suggestMock.mockResolvedValue({ kind: 'fallback', reason: 'not-configured', plan: PLAN_STUB })

    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-role="ai-suggest"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    expect(wrapper.find('[data-role="ai-feedback"]').text()).toContain('设置')
    await wrapper.find('[data-role="save-scheme"]').trigger('click')
    expect(listSchemes()[0]!.params.suggestion).toBeUndefined()
    wrapper.unmount()
  })

  it('rejected（低质量）：提示保留本地切块，参数不变', async () => {
    suggestMock.mockResolvedValue({ kind: 'rejected', reason: 'low-quality', plan: PLAN_STUB })

    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-role="ai-suggest"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    expect(wrapper.find('[data-role="ai-feedback"]').text()).toContain('本地')
    expect((wrapper.find('[data-field="rows"]').element as HTMLInputElement).value).toBe('4')
    wrapper.unmount()
  })

  it('applied 后手动改网格数 → 建议失效（保存不带 suggestion）', async () => {
    suggestMock.mockResolvedValue({
      kind: 'applied',
      plan: PLAN_STUB,
      suggestion: { rows: 3, cols: 3, rowWeights: [0.2, 0.3, 0.5], colWeights: [0.4, 0.3, 0.3] },
    })

    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-role="ai-suggest"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.find('[data-field="rows"]').setValue(6) // 手动改 → 长度失效

    await wrapper.find('[data-role="save-scheme"]').trigger('click')
    const scheme = listSchemes()[0]!
    expect(scheme.params.rows).toBe(6)
    expect(scheme.params.suggestion).toBeUndefined()
    wrapper.unmount()
  })
})
