// SchemeManager 组件测试（验收返工「方案 = 关卡」：新建即入轨 / F-18 确认 / 3.11 上传闭环）
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { VueWrapper } from '@vue/test-utils'
import SchemeManager from '@/components/SchemeManager.vue'
import { mountWithApp } from './helpers'
import { usePlatformStore } from '@/stores/platform'
import { listSchemes, createScheme } from '@/games/jigsaw/schemes'
import { recordResult, getLevelRecord } from '@/core/level-manager'
import type { LevelResult } from '@/core/types'

// services 适配层 mock：素材仓库走内存假实现（真实 IndexedDB 仓库由 services.spec 覆盖）
const { saveImageMock, loadImageMock } = vi.hoisted(() => ({
  saveImageMock: vi.fn(),
  loadImageMock: vi.fn(),
}))
vi.mock('@/services', () => ({
  getEnvAdapter: () => ({
    auth: { getCurrentUser: () => ({ id: 'local', name: 'local', anonymous: true }) },
    assetRepo: {
      saveImage: saveImageMock,
      listImages: async () => [],
      loadImage: loadImageMock,
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

const PARAMS = { rows: 4, cols: 4, tabDepth: 0.16, uniquenessThreshold: 18, seed: 42 }

/** 纯色假图（自动最优链路：downscaleToAnalysis 已 mock，这里只喂像素） */
function flatImage(w: number, h: number, v = 128) {
  const data = new Uint8ClampedArray(w * h * 4).fill(v)
  for (let i = 3; i < data.length; i += 4) data[i] = 255
  return { width: w, height: h, data }
}

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

  it('默认态：空列表提示、新建按钮（无激活位概念）', () => {
    const wrapper = mountWithApp(SchemeManager)
    expect(wrapper.text()).toContain('还没有自定义方案')
    expect(wrapper.find('[data-role="new-scheme"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('新建内置方案全流程：填名保存 → 卡片出现，8×8=64 块按块数插入 animals 专题', async () => {
    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-field="name"]').setValue('小狗 6×6')
    await wrapper.find('[data-role="save-scheme"]').trigger('click')

    const schemes = listSchemes()
    expect(schemes).toHaveLength(1)
    expect(schemes[0]!.name).toBe('小狗 6×6')
    expect(schemes[0]!.source).toEqual({ kind: 'builtin', imageId: 'animals-01' })
    // 面板关闭 + 列表镜像刷新
    expect(wrapper.find('[data-role="scheme-editor"]').exists()).toBe(false)
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

  it('卡片 meta 显示类型标签（缺省=自定义/自动最优/AI 切块），不再显示种子尾号', async () => {
    createScheme('手动的', { kind: 'builtin', imageId: 'animals-01' }, PARAMS)
    createScheme('自动的', { kind: 'builtin', imageId: 'animals-01' }, PARAMS, 'auto')
    createScheme('AI的', { kind: 'builtin', imageId: 'animals-01' }, PARAMS, 'ai')
    const wrapper = mountWithApp(SchemeManager)
    const text = wrapper
      .findAll('[data-scheme]')
      .map((c) => c.text())
      .join(' | ')
    expect(text).toContain('自定义')
    expect(text).toContain('自动最优')
    expect(text).toContain('AI 切块')
    expect(wrapper.text()).not.toContain('#')
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

describe('SchemeManager 确认与隔离（F-18 / 方案 = 关卡）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    saveImageMock.mockReset()
  })

  it('F-18：同图方案在玩（专题轨有成绩）→ 首次保存进确认态，二次点击才新建（历史成绩保留）', async () => {
    const existing = createScheme('原图方案', { kind: 'builtin', imageId: 'animals-01' }, PARAMS)
    recordResult('jigsaw:animals', result(7), { total: 7, recordKey: existing.id }) // 专题轨有成绩 = 在玩

    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-field="name"]').setValue('重新切块')
    await wrapper.find('[data-role="save-scheme"]').trigger('click')

    // 首次：进入确认态（按钮文案切换 + 未创建）
    expect(wrapper.find('[data-role="save-confirm"]').exists()).toBe(true)
    expect(listSchemes()).toHaveLength(1)

    // 二次：确认新建平行关卡
    await wrapper.find('[data-role="save-confirm"]').trigger('click')
    expect(listSchemes()).toHaveLength(2)
    // 历史方案成绩不受影响
    expect(getLevelRecord('jigsaw:animals', existing.id)?.stars).toBe(3)
    wrapper.unmount()
  })

  it('同图方案未在玩（无成绩）：无需确认直接创建', async () => {
    createScheme('刚建的', { kind: 'builtin', imageId: 'animals-01' }, PARAMS)
    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-role="save-scheme"]').trigger('click')
    expect(listSchemes()).toHaveLength(2)
    wrapper.unmount()
  })

  it('删除二次确认：首次弹确认文案，二次执行且其他方案成绩隔离', async () => {
    const a = createScheme('A', { kind: 'builtin', imageId: 'animals-01' }, PARAMS)
    const b = createScheme('B', { kind: 'builtin', imageId: 'space-01' }, { ...PARAMS, seed: 43 })
    recordResult('jigsaw:space', result(1), { total: 6, recordKey: b.id })

    const wrapper = mountWithApp(SchemeManager)
    const delBtn = wrapper.find(`[data-scheme="${a.id}"] [data-role="delete-scheme"]`)
    await delBtn.trigger('click')
    // 首次：确认态、未删除
    expect(wrapper.find(`[data-scheme="${a.id}"] [data-role="delete-confirm"]`).exists()).toBe(true)
    expect(listSchemes()).toHaveLength(2)

    await wrapper.find(`[data-scheme="${a.id}"] [data-role="delete-confirm"]`).trigger('click')
    expect(listSchemes().map((s) => s.id)).toEqual([b.id])
    // B 成绩隔离保留
    expect(getLevelRecord('jigsaw:space', b.id)?.stars).toBe(3)
    wrapper.unmount()
  })
})

describe('SchemeManager 方案调整（反馈三轮：原位编辑，id/进度键不变）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    saveImageMock.mockReset()
  })

  it('调整按钮 → 面板预填 → 改行数保存：同 id 更新、进度保留', async () => {
    const a = createScheme('小狗 4×4', { kind: 'builtin', imageId: 'animals-01' }, PARAMS)
    recordResult('jigsaw:animals', result(2), { total: 7, recordKey: a.id })

    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find(`[data-scheme="${a.id}"] [data-role="edit-scheme"]`).trigger('click')

    // 面板预填：标题「调整方案」+ 名称与行数回显
    expect(wrapper.find('[data-role="scheme-editor"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('调整方案')
    expect((wrapper.find('[data-field="name"]').element as HTMLInputElement).value).toBe('小狗 4×4')
    expect((wrapper.find('[data-field="rows"]').element as HTMLInputElement).value).toBe('4')

    await wrapper.find('[data-field="rows"]').setValue(6)
    await wrapper.find('[data-role="save-scheme"]').trigger('click')

    // 原位更新：不新建、同 id、参数已改、面板关闭
    const all = listSchemes()
    expect(all).toHaveLength(1)
    expect(all[0]!.id).toBe(a.id)
    expect(all[0]!.params.rows).toBe(6)
    expect(all[0]!.params.cols).toBe(4)
    expect(wrapper.find('[data-role="scheme-editor"]').exists()).toBe(false)
    // 进度键不变：成绩仍可读
    expect(getLevelRecord('jigsaw:animals', a.id)?.stars).toBe(3)
    wrapper.unmount()
  })
})

describe('SchemeManager 导航', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    saveImageMock.mockReset()
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
})

describe('SchemeManager 批量导入（本地图片 → 解析像素 → 最优切块直接建档）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    saveImageMock.mockReset()
    loadImageMock.mockReset()
    suggestMock.mockReset()
    loadSourceImageMock.mockReset().mockResolvedValue({ width: 96, height: 96 })
    downscaleMock.mockReset().mockReturnValue(flatImage(96, 96))
  })

  function pickBatchInput(wrapper: VueWrapper): HTMLInputElement {
    return wrapper.find('[data-role="batch-input"]').element as HTMLInputElement
  }

  /** 批量导入是逐张 await 链（含 FileReader 异步），轮询等待直至完成条件 */
  async function flushUntil(done: () => boolean, tries = 50): Promise<void> {
    for (let i = 0; i < tries && !done(); i += 1) await new Promise((r) => setTimeout(r, 0))
  }

  it('多图一次导入：难度档随导入序轮转（档 1 → 5×3、档 2 → 6×3），文件名去扩展名为方案名', async () => {
    downscaleMock.mockReturnValue(flatImage(96, 192)) // 竖长图：c1 窗口 9-16 → 5×3（96 整除 3 列，均匀度+块形胜 5×2）；c2 窗口 17-24 → 6×3
    let seq = 0
    saveImageMock.mockImplementation(async () => ({ id: `asset-${(seq += 1)}` }))
    loadImageMock.mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'image/jpeg' }))
    const wrapper = mountWithApp(SchemeManager)
    const input = pickBatchInput(wrapper)
    Object.defineProperty(input, 'files', {
      value: [
        new File([new Uint8Array([1, 2, 3])], 'sample-photo-1.jpeg', { type: 'image/jpeg' }),
        new File([new Uint8Array([4, 5, 6])], 'sample-photo-2.jpeg', { type: 'image/jpeg' }),
      ],
      configurable: true,
    })
    await wrapper.find('[data-role="batch-input"]').trigger('change')
    await flushUntil(() => listSchemes().length === 2)

    const all = listSchemes()
    expect(all).toHaveLength(2)
    for (const s of all) {
      expect(s.source.kind).toBe('custom')
    }
    // 第 1 张档 1（导入序轮转）→ 5×3；第 2 张档 2 → 6×3（同图不同档 = 难度阶梯的批量入口）
    expect(all[0]).toMatchObject({ name: 'sample-photo-1' })
    expect(all[0]!.params.rows).toBe(5)
    expect(all[0]!.params.cols).toBe(3)
    expect(all[1]).toMatchObject({ name: 'sample-photo-2' })
    expect(all[1]!.params.rows).toBe(6)
    expect(all[1]!.params.cols).toBe(3)
    expect(wrapper.find('[data-role="batch-feedback"]').text()).toContain('2')
    wrapper.unmount()
  })

  it('单张解析失败：跳过不阻断整批，反馈部分成功', async () => {
    let seq = 0
    saveImageMock.mockImplementation(async () => ({ id: `asset-${(seq += 1)}` }))
    loadImageMock.mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'image/jpeg' }))
    loadSourceImageMock
      .mockRejectedValueOnce(new Error('bad image'))
      .mockResolvedValue({ width: 96, height: 96 })
    const wrapper = mountWithApp(SchemeManager)
    const input = pickBatchInput(wrapper)
    Object.defineProperty(input, 'files', {
      value: [
        new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }),
        new File([new Uint8Array([2])], 'b.jpg', { type: 'image/jpeg' }),
      ],
      configurable: true,
    })
    await wrapper.find('[data-role="batch-input"]').trigger('change')
    await flushUntil(() => listSchemes().length === 1)

    expect(listSchemes()).toHaveLength(1)
    expect(wrapper.find('[data-role="batch-feedback"]').text()).toContain('失败')
    wrapper.unmount()
  })

  it('空选择（取消）：不进入导入态、无反馈', async () => {
    const wrapper = mountWithApp(SchemeManager)
    const input = pickBatchInput(wrapper)
    Object.defineProperty(input, 'files', { value: [], configurable: true })
    await wrapper.find('[data-role="batch-input"]').trigger('change')
    await new Promise((r) => setTimeout(r, 0))
    expect(listSchemes()).toHaveLength(0)
    expect(wrapper.find('[data-role="batch-feedback"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('SchemeManager 自动最优模式（三分类，反馈 2）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    saveImageMock.mockReset()
    suggestMock.mockReset()
    loadSourceImageMock.mockReset().mockResolvedValue({ width: 96, height: 96 })
    downscaleMock.mockReset().mockReturnValue(flatImage(96, 96))
  })

  it('切到自动模式即按图选规格：竖长图 + 简单档 → 6×3，卡片入档 mode=auto', async () => {
    downscaleMock.mockReturnValue(flatImage(96, 192)) // 简单档(c2=复杂度2)窗口 17-24 综合最优 = 6×3（与批量导入档 2 同口径）
    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-role="mode-auto"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.find('[data-role="difficulty-easy"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('[data-role="auto-feedback"]').text()).toContain('6×3')
    await wrapper.find('[data-role="save-scheme"]').trigger('click')
    const scheme = listSchemes()[0]!
    expect(scheme.params.rows).toBe(6)
    expect(scheme.params.cols).toBe(3)
    expect(scheme.mode).toBe('auto')
    wrapper.unmount()
  })

  it('分析失败：回落难度占位网格（中等 6×7）仍可保存', async () => {
    loadSourceImageMock.mockRejectedValue(new Error('boom'))
    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-role="mode-auto"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('[data-role="auto-feedback"]').text()).toContain('无法分析')
    await wrapper.find('[data-role="save-scheme"]').trigger('click')
    const scheme = listSchemes()[0]!
    expect(scheme.params.rows).toBe(6)
    expect(scheme.params.cols).toBe(7)
    expect(scheme.mode).toBe('auto')
    wrapper.unmount()
  })

  it('难度切换在分析在途：latest-wins 旧结果丢弃，规格随最新难度', async () => {
    let releaseFirst!: (img: { width: number; height: number }) => void
    const first = new Promise<{ width: number; height: number }>((res) => (releaseFirst = res))
    loadSourceImageMock.mockImplementationOnce(() => first) // run#1（medium）挂起
    downscaleMock.mockImplementationOnce(() => flatImage(96, 192)) // run#2（easy）先完成 → 6×3
    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-role="mode-auto"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0)) // run#1 启动并挂起
    await wrapper.find('[data-role="difficulty-easy"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('[data-role="auto-feedback"]').text()).toContain('6×3')
    releaseFirst({ width: 96, height: 96 }) // 迟到的 run#1（medium + 96×96 分析）应被作废
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('[data-role="auto-feedback"]').text()).toContain('6×3')
    wrapper.unmount()
  })

  it('seed/threshold/换花样 不再外露（反馈 2 去内部参数）', async () => {
    const wrapper = mountWithApp(SchemeManager)
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    expect(wrapper.find('[data-field="seed"]').exists()).toBe(false)
    expect(wrapper.find('[data-field="threshold"]').exists()).toBe(false)
    expect(wrapper.find('[data-role="reroll"]').exists()).toBe(false)
    expect(wrapper.find('[data-role="mode-custom"]').exists()).toBe(true)
    expect(wrapper.find('[data-role="mode-auto"]').exists()).toBe(true)
    expect(wrapper.find('[data-role="mode-ai"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('SchemeManager 空态直达批量导入（验收返工三：选关空态 → 方案页自动开文件选择器）', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    saveImageMock.mockReset()
    loadImageMock.mockReset()
    // happy-dom 中 hidden input 的 click 无浏览器弹窗，mock 掉以断言触发链且无副作用
    clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
  })
  afterEach(() => clickSpy.mockRestore())

  it('schemesAutoBatch 标志在：挂载即消费并自动点击文件选择器（标志清零，仅一次）', async () => {
    const platform = usePlatformStore()
    platform.openSchemes(true)
    const wrapper = mountWithApp(SchemeManager)

    expect(clickSpy).toHaveBeenCalledTimes(1) // batch-input 被自动点击
    expect(platform.schemesAutoBatch).toBe(false) // 一次性标志已消费，不重复触发
    wrapper.unmount()
  })

  it('无标志（常规进入方案页）：挂载不自动触发文件选择器', () => {
    const platform = usePlatformStore()
    platform.openSchemes()
    const wrapper = mountWithApp(SchemeManager)
    expect(platform.schemesAutoBatch).toBe(false)
    expect(clickSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('SchemeManager AI 建议链路（三分类：applied 入档 / 非 applied 一律降级自动最优）', () => {
  const PLAN_STUB = { pieces: [] }

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    saveImageMock.mockReset()
    suggestMock.mockReset()
    loadSourceImageMock.mockReset().mockResolvedValue({ width: 96, height: 96 })
    downscaleMock.mockReset().mockReturnValue(flatImage(96, 96))
  })

  async function openAiMode(wrapper: VueWrapper): Promise<void> {
    await wrapper.find('[data-role="new-scheme"]').trigger('click')
    await wrapper.find('[data-role="mode-ai"]').trigger('click')
  }

  it('内置图可直接请求；自定义来源未上传时按钮禁用', async () => {
    const wrapper = mountWithApp(SchemeManager)
    await openAiMode(wrapper)
    const btn = () => wrapper.find('[data-role="ai-suggest"]').element as HTMLButtonElement
    expect(btn().disabled).toBe(false)
    await wrapper.find('[data-role="source-custom"]').trigger('click')
    expect(btn().disabled).toBe(true)
    wrapper.unmount()
  })

  it('applied：建议回填 + 提示，保存 → suggestion 与 mode=ai 入档', async () => {
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
    await openAiMode(wrapper)
    await wrapper.find('[data-role="ai-suggest"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    // 请求参数：base 来自表单默认 8×8、图 = 内置缩略 data URI、ai 未配置（未开启）
    const call = suggestMock.mock.calls[0] as unknown[]
    expect(call[1]).toMatchObject({ rows: 8, cols: 8, uniquenessThreshold: 18 })
    const img = String(call[3])
    expect(img.startsWith('data:image/jpeg;base64,') || img.startsWith('data:image/png;base64,')).toBe(true)
    expect(call[4]).toBeUndefined()

    expect(wrapper.find('[data-role="ai-feedback"]').text()).toContain('3×5')
    await wrapper.find('[data-role="save-scheme"]').trigger('click')
    const scheme = listSchemes()[0]!
    expect(scheme.params.rows).toBe(3)
    expect(scheme.params.cols).toBe(5)
    expect(scheme.params.suggestion).toEqual({
      rowWeights: [0.2, 0.3, 0.5],
      colWeights: [0.4, 0.2, 0.2, 0.1, 0.1],
    })
    expect(scheme.mode).toBe('ai')
    wrapper.unmount()
  })

  it('fallback（未配置）：自动降级为最优切块 + 提示，保存 mode=auto 不带 suggestion', async () => {
    suggestMock.mockResolvedValue({ kind: 'fallback', reason: 'not-configured', plan: PLAN_STUB })

    const wrapper = mountWithApp(SchemeManager)
    await openAiMode(wrapper)
    await wrapper.find('[data-role="ai-suggest"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(wrapper.find('[data-role="ai-feedback"]').text()).toContain('已自动按最优')
    await wrapper.find('[data-role="save-scheme"]').trigger('click')
    const scheme = listSchemes()[0]!
    expect(scheme.params.suggestion).toBeUndefined()
    expect(scheme.mode).toBe('auto') // 降级后 = 自动最优
    wrapper.unmount()
  })

  it('rejected（低质量）：同样降级自动最优（不再保留原参数）', async () => {
    suggestMock.mockResolvedValue({ kind: 'rejected', reason: 'low-quality', plan: PLAN_STUB })

    const wrapper = mountWithApp(SchemeManager)
    await openAiMode(wrapper)
    await wrapper.find('[data-role="ai-suggest"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(wrapper.find('[data-role="ai-feedback"]').text()).toContain('已自动按最优')
    wrapper.unmount()
  })

  it('AI 在途切回自定义：过期建议丢弃，保存不带 suggestion（mode=custom）', async () => {
    let release!: () => void
    const pending = new Promise<void>((res) => (release = res))
    suggestMock.mockImplementationOnce(() =>
      pending.then(() => ({
        kind: 'applied',
        plan: PLAN_STUB,
        suggestion: { rows: 3, cols: 5, rowWeights: [0.2, 0.3, 0.5], colWeights: [0.4, 0.2, 0.2, 0.1, 0.1] },
      })),
    )
    const wrapper = mountWithApp(SchemeManager)
    await openAiMode(wrapper)
    await wrapper.find('[data-role="ai-suggest"]').trigger('click')
    await wrapper.find('[data-role="mode-custom"]').trigger('click') // 在途切换：迟到建议须作废
    release()
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.find('[data-role="save-scheme"]').trigger('click')
    const scheme = listSchemes()[0]!
    expect(scheme.params.suggestion).toBeUndefined()
    expect(scheme.params.rows).toBe(8) // 表单未被过期建议改写
    expect(scheme.mode).toBe('custom')
    wrapper.unmount()
  })

  it('进 AI 模式未点按钮直接保存：无自动/ai 推导不误标 auto，mode=custom', async () => {
    const wrapper = mountWithApp(SchemeManager)
    await openAiMode(wrapper)
    await wrapper.find('[data-role="save-scheme"]').trigger('click')
    const scheme = listSchemes()[0]!
    expect(scheme.mode).toBe('custom')
    expect(scheme.params.rows).toBe(8) // 表单参数原样入档（默认 8×8 = 64 块，反馈三轮）
    wrapper.unmount()
  })

  it('AI 建议应用后切回自定义：建议清除，保存不带 suggestion（mode=custom）', async () => {
    suggestMock.mockResolvedValue({
      kind: 'applied',
      plan: PLAN_STUB,
      suggestion: { rows: 3, cols: 5, rowWeights: [0.2, 0.3, 0.5], colWeights: [0.4, 0.2, 0.2, 0.1, 0.1] },
    })

    const wrapper = mountWithApp(SchemeManager)
    await openAiMode(wrapper)
    await wrapper.find('[data-role="ai-suggest"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.find('[data-role="mode-custom"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    await wrapper.find('[data-role="save-scheme"]').trigger('click')
    const scheme = listSchemes()[0]!
    expect(scheme.params.suggestion).toBeUndefined()
    expect(scheme.mode).toBe('custom')
    wrapper.unmount()
  })
})
