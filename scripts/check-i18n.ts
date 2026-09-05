// 翻译齐备校验脚本（与 tests/unit/i18n-guard.spec.ts 同规则，双保险）
// 运行：npm run check:i18n（node --experimental-strip-types 直接加载 TS 语言包，零额外依赖）
// 校验：键位双向 1:1 / 空值 / 注册表一致 / 选项一致 / 跨段重复键 / 插值占位符一致
// 注意：本脚本直接 import 语言包源文件（带 .ts 扩展名），i18n/index.ts 依赖 vue-i18n 不在 Node 裸跑范围

import zhCN from '../src/i18n/zh-CN.ts'
import enUS from '../src/i18n/en-US.ts'

const MESSAGE_LOCALES: Record<string, unknown> = { 'zh-CN': zhCN, 'en-US': enUS }
// 与 src/i18n/index.ts 的 SUPPORTED_LOCALES / LOCALE_OPTIONS 保持一致（守卫 G-3 校验两者一致性）
const SUPPORTED_LOCALES = ['zh-CN', 'en-US']
const LOCALE_OPTION_VALUES = ['zh-CN', 'en-US']

function flatten(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of flatten(value as Record<string, unknown>, path)) out.set(k, v)
    } else {
      out.set(path, String(value))
    }
  }
  return out
}

const errors: string[] = []
const locales = Object.fromEntries(
  Object.entries(MESSAGE_LOCALES).map(([loc, pack]) => [loc, flatten(pack as Record<string, unknown>)]),
)

// G-1 键位镜像（以 zh-CN 为基准双向比对；新增语言自动纳入）
const base = locales['zh-CN']
for (const [locale, keys] of Object.entries(locales)) {
  for (const key of base.keys()) {
    if (!keys.has(key)) errors.push(`G-1 [${locale}] 缺少键: ${key}`)
  }
  for (const key of keys.keys()) {
    if (!base.has(key)) errors.push(`G-1 [${locale}] 多出键: ${key}`)
  }
}

// G-2 空值
for (const [locale, keys] of Object.entries(locales)) {
  for (const [key, value] of keys) {
    if (value.trim() === '') errors.push(`G-2 [${locale}] 空翻译: ${key}`)
  }
}

// G-3 注册表一致
const registered = Object.keys(MESSAGE_LOCALES).sort()
if (JSON.stringify(registered) !== JSON.stringify([...SUPPORTED_LOCALES].sort())) {
  errors.push(`G-3 SUPPORTED_LOCALES(${SUPPORTED_LOCALES}) 与语言包注册(${registered})不一致`)
}
if (JSON.stringify([...LOCALE_OPTION_VALUES].sort()) !== JSON.stringify([...SUPPORTED_LOCALES].sort())) {
  errors.push(`G-3 LOCALE_OPTIONS(${LOCALE_OPTION_VALUES}) 与 SUPPORTED_LOCALES(${SUPPORTED_LOCALES})不一致`)
}

// G-4 跨段同名同值重复键（同功能同描述同出处；语言名以自身语言显示，排除）
const byValue = new Map<string, string[]>()
for (const [key, value] of base) {
  if (value === '简体中文' || value === 'English') continue
  const list = byValue.get(value) ?? []
  list.push(key)
  byValue.set(value, list)
}
for (const [value, keys] of byValue) {
  if (keys.length > 1) errors.push(`G-4 跨段重复定义: ${keys.join(' == ')} («${value}»)`)
}

// G-5 插值占位符一致
const pattern = /\{(\w+)\}/g
for (const [key, zhValue] of base) {
  for (const [locale, keys] of Object.entries(locales)) {
    const other = keys.get(key)
    if (other === undefined) continue
    const a = [...zhValue.matchAll(pattern)].map((m) => m[1]).sort().join(',')
    const b = [...other.matchAll(pattern)].map((m) => m[1]).sort().join(',')
    if (a !== b) errors.push(`G-5 [${locale}] 插值不一致: ${key} zh={${a}} ${locale}={${b}}`)
  }
}

if (errors.length > 0) {
  console.error(`check:i18n 失败（${errors.length} 项）：`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

const totalKeys = base.size
console.log(`check:i18n 通过：${SUPPORTED_LOCALES.join(' / ')} 共 ${totalKeys} 键，守卫 G-1~G-5 全绿`)
