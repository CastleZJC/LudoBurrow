import { describe, it, expect, beforeEach } from 'vitest'
import { getSettings, updateSettings, defaultSettings } from '@/core/settings'

describe('settings', () => {
  beforeEach(() => localStorage.clear())

  it('无档时返回默认设置（中文、音效开、无限时）', () => {
    const s = getSettings()
    expect(s).toEqual(defaultSettings())
    expect(s.locale).toBe('zh-CN')
    expect(s.timeLimit.mode).toBe('off')
  })

  it('patch 更新立即生效并持久化', () => {
    updateSettings({ soundEnabled: false })
    expect(getSettings().soundEnabled).toBe(false)
    // 其余字段保持
    expect(getSettings().locale).toBe('zh-CN')
  })

  it('timeLimit 整体替换更新', () => {
    updateSettings({ timeLimit: { mode: 'competition', limitMs: 60_000, lockMs: 300_000 } })
    expect(getSettings().timeLimit).toEqual({ mode: 'competition', limitMs: 60_000, lockMs: 300_000 })
  })

  it('locale 可切换为 en-US 并持久化', () => {
    updateSettings({ locale: 'en-US' })
    expect(getSettings().locale).toBe('en-US')
  })

  it('AI 配置可选段：写入后随档持久化', () => {
    updateSettings({ ai: { provider: 'qwen', baseURL: 'https://x', model: 'm', apiKey: 'k' } })
    expect(getSettings().ai?.provider).toBe('qwen')
  })
})
