// i18n 翻译齐备守卫测试 G-1~G-5（测试规范 §3.4，发布双门禁之一）
// 与 npm run check:i18n 双保险；新增语言自动纳入（遍历 SUPPORTED_LOCALES）
import { describe, it, expect } from 'vitest'
import { MESSAGE_LOCALES, SUPPORTED_LOCALES, LOCALE_OPTIONS } from '@/i18n'

/** 展平嵌套对象为 dot-key → value 映射 */
function flatten(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of flatten(value as Record<string, unknown>, path)) out.set(k, v)
    } else if (typeof value === 'string') {
      out.set(path, value)
    } else {
      out.set(path, String(value))
    }
  }
  return out
}

const zhKeys = flatten(MESSAGE_LOCALES['zh-CN'] as Record<string, unknown>)
const enKeys = flatten(MESSAGE_LOCALES['en-US'] as Record<string, unknown>)

describe('i18n 守卫 G-1：键位镜像', () => {
  it('zh-CN 与 en-US 键集合双向差集为空（1:1）', () => {
    const onlyZh = [...zhKeys.keys()].filter((k) => !enKeys.has(k))
    const onlyEn = [...enKeys.keys()].filter((k) => !zhKeys.has(k))
    expect(onlyZh, `仅 zh-CN 有的键: ${onlyZh.join(', ')}`).toEqual([])
    expect(onlyEn, `仅 en-US 有的键: ${onlyEn.join(', ')}`).toEqual([])
  })
})

describe('i18n 守卫 G-2：无空翻译', () => {
  it('任一语言任一键值为空串/null 视为未翻译，失败', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const keys = flatten(MESSAGE_LOCALES[locale] as Record<string, unknown>)
      const empty = [...keys.entries()].filter(([, v]) => v === '' || v === 'null' || v === 'undefined')
      expect(empty, `${locale} 存在空翻译键: ${empty.map(([k]) => k).join(', ')}`).toEqual([])
    }
  })
})

describe('i18n 守卫 G-3：注册表一致', () => {
  it('SUPPORTED_LOCALES 与实际注册的语言包一致', () => {
    const registered = Object.keys(MESSAGE_LOCALES)
    expect([...SUPPORTED_LOCALES].sort()).toEqual([...registered].sort())
  })

  it('LOCALE_OPTIONS 与 SUPPORTED_LOCALES 一致', () => {
    const optionValues = LOCALE_OPTIONS.map((o) => o.value).sort()
    expect(optionValues).toEqual([...SUPPORTED_LOCALES].sort())
  })
})

describe('i18n 守卫 G-4：无跨段重复定义', () => {
  it('跨段同名同值键为零（同功能同描述同出处）', () => {
    // 按值分组找重复；语言名（locale 段）以自身语言显示属刻意设计，排除
    const byValue = new Map<string, string[]>()
    for (const [key, value] of zhKeys) {
      const list = byValue.get(value) ?? []
      list.push(key)
      byValue.set(value, list)
    }
    const duplicates = [...byValue.entries()]
      .filter(([, keys]) => keys.length > 1)
      .filter(([value]) => value !== '简体中文' && value !== 'English')
      .map(([value, keys]) => `${keys.join(' == ')} («${value}»)`)
    expect(duplicates, `跨段重复定义:\n${duplicates.join('\n')}`).toEqual([])
  })
})

describe('i18n 守卫 G-5：插值占位符一致', () => {
  it('同一 key 的 {占位符} 在双语言包中一致', () => {
    const pattern = /\{(\w+)\}/g
    const problems: string[] = []
    for (const [key, zhValue] of zhKeys) {
      const enValue = enKeys.get(key)
      if (enValue === undefined) continue
      const zhParams = [...zhValue.matchAll(pattern)].map((m) => m[1]).sort()
      const enParams = [...enValue.matchAll(pattern)].map((m) => m[1]).sort()
      if (JSON.stringify(zhParams) !== JSON.stringify(enParams)) {
        problems.push(`${key}: zh={${zhParams.join(',')}} en={${enParams.join(',')}}`)
      }
    }
    expect(problems, `插值占位符不一致:\n${problems.join('\n')}`).toEqual([])
  })
})
