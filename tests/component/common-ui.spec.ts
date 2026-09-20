// 公共 UI 组件契约测试（2026-09 重构抽出：ModalOverlay / FilePickButton / ConfirmButton / PageHeader / FeedbackLine）
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ModalOverlay from '@/components/ModalOverlay.vue'
import FilePickButton from '@/components/FilePickButton.vue'
import ConfirmButton from '@/components/ConfirmButton.vue'
import PageHeader from '@/components/PageHeader.vue'
import FeedbackLine from '@/components/FeedbackLine.vue'
import { mountWithApp } from './helpers'

describe('ModalOverlay（遮罩 + 居中卡片）', () => {
  it('默认：absolute 遮罩 + 卡片包裹插槽内容', () => {
    const wrapper = mount(ModalOverlay, { slots: { default: '<p data-role="inner">x</p>' } })
    const overlay = wrapper.find('.modal-overlay')
    expect(overlay.exists()).toBe(true)
    expect(overlay.classes()).not.toContain('is-fixed')
    expect(wrapper.find('.modal-card').exists()).toBe(true)
    expect(wrapper.find('[data-role="inner"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('fixed / z：切 fixed 定位并应用层叠顺序', () => {
    const wrapper = mount(ModalOverlay, { props: { fixed: true, z: 100 } })
    expect(wrapper.find('.modal-overlay').classes()).toContain('is-fixed')
    expect((wrapper.find('.modal-overlay').element as HTMLElement).style.zIndex).toBe('100')
    wrapper.unmount()
  })

  it('card=false：无卡片容器，插槽直落遮罩（休息锁定等纯文本浮层）', () => {
    const wrapper = mount(ModalOverlay, { props: { card: false }, slots: { default: '<p>y</p>' } })
    expect(wrapper.find('.modal-card').exists()).toBe(false)
    expect(wrapper.find('.modal-overlay p').exists()).toBe(true)
    wrapper.unmount()
  })

  it('class/data-role 归并到根元素（消费方作用域样式与锚点）', () => {
    const wrapper = mount(ModalOverlay, { attrs: { class: 'rest-lock', 'data-role': 'rest-lock' } })
    const el = wrapper.find('.modal-overlay')
    expect(el.classes()).toContain('rest-lock')
    expect(el.attributes('data-role')).toBe('rest-lock')
    wrapper.unmount()
  })
})

describe('FilePickButton（伪装按钮 + 隐藏 file input）', () => {
  it('data-role/data-field 透传到内部 input；class 归并到根 label', () => {
    const wrapper = mount(FilePickButton, {
      attrs: { 'data-role': 'batch-input', class: 'extra-cls' },
      slots: { default: '选图' },
    })
    const input = wrapper.find('input[type="file"]')
    expect(input.attributes('data-role')).toBe('batch-input')
    expect(input.classes()).not.toContain('extra-cls')
    expect(wrapper.find('label.file-btn').classes()).toContain('extra-cls')
    expect(wrapper.find('label.file-btn').classes()).toContain('secondary-btn')
    wrapper.unmount()
  })

  it('variant=primary 用主按钮样式；accept/multiple/disabled 落 input', () => {
    const wrapper = mount(FilePickButton, {
      props: { variant: 'primary', accept: 'image/*', multiple: true, disabled: true },
    })
    expect(wrapper.find('label.file-btn').classes()).toContain('primary-btn')
    const input = wrapper.find('input[type="file"]')
    expect(input.attributes('accept')).toBe('image/*')
    expect(input.attributes('multiple')).toBeDefined()
    expect((input.element as HTMLInputElement).disabled).toBe(true)
    wrapper.unmount()
  })

  it('选择后 emit files 数组并清空 input.value（可重复选同一文件）', async () => {
    const wrapper = mount(FilePickButton)
    const input = wrapper.find('input[type="file"]')
    const file = new File(['a'], 'a.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')

    expect(wrapper.emitted('files')).toHaveLength(1)
    expect(wrapper.emitted('files')![0]![0]).toEqual([file])
    expect((input.element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
  })

  it('open() 程序化点击 input；disabled 时不触发', () => {
    const wrapper = mount(FilePickButton)
    const clickSpy = vi.spyOn(wrapper.find('input[type="file"]').element as HTMLInputElement, 'click')
    wrapper.vm.open()
    expect(clickSpy).toHaveBeenCalledTimes(1)
    clickSpy.mockClear()

    // disabled 模式：open() 无副作用（批量导入进行中防重入）
    const busy = mount(FilePickButton, { props: { disabled: true } })
    const busySpy = vi.spyOn(busy.find('input[type="file"]').element as HTMLInputElement, 'click')
    busy.vm.open()
    expect(busySpy).not.toHaveBeenCalled()
    wrapper.unmount()
    busy.unmount()
  })
})

describe('ConfirmButton（首击武装 / 超时复原 / 二击执行）', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('autoArm：首击换确认文案与锚点（不触发），二击触发 confirm(true) 并复位', async () => {
    const wrapper = mount(ConfirmButton, {
      props: {
        label: '删除',
        confirmLabel: '确认删除？',
        role: 'delete-scheme',
        confirmRole: 'delete-confirm',
      },
    })
    const btn = wrapper.find('button')
    await btn.trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined() // 仅武装未执行
    expect(btn.attributes('data-role')).toBe('delete-confirm')
    expect(btn.text()).toBe('确认删除？')

    await btn.trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[true]])
    expect(btn.attributes('data-role')).toBe('delete-scheme') // 已复位
    wrapper.unmount()
  })

  it('武装 3 秒未确认自动复原（定时器兜底）', async () => {
    const wrapper = mount(ConfirmButton, { props: { label: 'A', confirmLabel: 'B' } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.find('button').text()).toBe('B')
    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.find('button').text()).toBe('A')
    wrapper.unmount()
  })

  it('autoArm=false：每次点击都回调，由调用方决定 arm（F-18 校验门模式）', async () => {
    const wrapper = mount(ConfirmButton, {
      props: { label: '保存', confirmLabel: '确认新建？', autoArm: false },
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[false]])

    wrapper.vm.arm() // 调用方判定需要确认
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[false], [true]])
    wrapper.unmount()
  })

  it('reset() 主动退出确认态并取消定时器；卸载清理定时器', async () => {
    const wrapper = mount(ConfirmButton, { props: { label: 'A', confirmLabel: 'B' } })
    await wrapper.find('button').trigger('click')
    expect(vi.getTimerCount()).toBe(1)

    wrapper.vm.reset()
    await nextTick()
    expect(wrapper.find('button').text()).toBe('A')
    expect(vi.getTimerCount()).toBe(0)

    await wrapper.find('button').trigger('click')
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount() // 卸载须清定时器（防泄漏回调）
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('PageHeader（返回 + 标题 + 右侧动作区）', () => {
  it('渲染标题与返回按钮（i18n 文案），点击 emit back', async () => {
    const wrapper = mountWithApp(PageHeader, { props: { title: '拼图方案' } })
    expect(wrapper.find('h2').text()).toBe('拼图方案')
    expect(wrapper.find('[data-nav="back"]').text()).toBe('返回')
    await wrapper.find('[data-nav="back"]').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
    wrapper.unmount()
  })

  it('actions 插槽渲染在标题右侧动作区', () => {
    const wrapper = mountWithApp(PageHeader, {
      props: { title: 'T' },
      slots: { actions: '<button data-role="act">动作</button>' },
    })
    expect(wrapper.find('.page-actions [data-role="act"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('FeedbackLine（一句话反馈行）', () => {
  it('渲染插槽内容；attrs 归并到根 p', () => {
    const wrapper = mount(FeedbackLine, {
      attrs: { 'data-role': 'feedback' },
      slots: { default: '已导入 2 张' },
    })
    const p = wrapper.find('p.feedback-line')
    expect(p.exists()).toBe(true)
    expect(p.attributes('data-role')).toBe('feedback')
    expect(p.text()).toBe('已导入 2 张')
    wrapper.unmount()
  })
})
