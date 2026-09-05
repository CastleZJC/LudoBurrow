// 全局设置：默认值 + patch 更新；并入存档单一 key（技术架构 §13.4）
// settings.ts 是设置域的唯一读写口，组件/store 一律经此访问。

import { loadSave, persistSave } from './save'
import type { SaveData, SettingsData } from './save'

export type TimeLimitMode = SettingsData['timeLimit']['mode']

export type Settings = SettingsData

export { defaultSettings } from './save'

/** 读取当前设置（无档时返回默认值） */
export function getSettings(): Settings {
  const save = loadSave()
  return save.settings
}

/**
 * patch 更新设置并立即持久化；返回更新后的完整设置。
 * patch 为浅合并（timeLimit 整体替换），类型不匹配由 TS 静态保证。
 */
export function updateSettings(patch: Partial<Settings>): Settings {
  const save = loadSave()
  const next: SaveData = { ...save, settings: { ...save.settings, ...patch } }
  persistSave(next)
  return next.settings
}
