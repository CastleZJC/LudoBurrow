// i18n 装配 + SUPPORTED_LOCALES / LOCALE_OPTIONS 注册表（单一出处，技术架构 §13.5）
// 新增语言三步（仅加不改）：① 新增 <locale>.ts（键位与 zh-CN 1:1）② MESSAGE_LOCALES 加一项 ③ LOCALE_OPTIONS 加一项

import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN'
import enUS from './en-US'
import { getSettings } from '@/core/settings'

/** 已注册语言包（守卫 G-3 校验与 SUPPORTED_LOCALES 一致的唯一出处） */
export const MESSAGE_LOCALES = {
  'zh-CN': zhCN,
  'en-US': enUS,
} as const

export type SupportedLocale = keyof typeof MESSAGE_LOCALES

/** 支持的语言列表（顺序即设置页下拉顺序） */
export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as readonly SupportedLocale[]

/** 设置页语言下拉选项（labelKey 在 locale 段，语言名以自身语言显示） */
export const LOCALE_OPTIONS: ReadonlyArray<{ value: SupportedLocale; labelKey: string }> = [
  { value: 'zh-CN', labelKey: 'locale.zh-CN' },
  { value: 'en-US', labelKey: 'locale.en-US' },
]

export const DEFAULT_LOCALE: SupportedLocale = 'zh-CN'

/** 运行时语言值校验：非法/缺失回退 zh-CN（F-24） */
export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && value in MESSAGE_LOCALES
}

export function normalizeLocale(value: unknown): SupportedLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: MESSAGE_LOCALES,
})

/** 应用语言并同步 <html lang>（切换立即生效，不需重启） */
export function applyLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale
  document.documentElement.setAttribute('lang', locale)
}

/** 从持久化设置恢复语言（应用启动时调用；依赖链 i18n → core/settings → core/save 无循环） */
export function restoreLocaleFromSettings(): void {
  applyLocale(normalizeLocale(getSettings().locale))
}
