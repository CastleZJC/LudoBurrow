# LudoBurrow 代码规范

> **文档名称**：LudoBurrow 代码规范
> **基于文档**：《LudoBurrow 技术架构说明文档》
>
> **修订记录**：
>
> | 版本 | 日期时间 | 修订性质 | 修订摘要 | 修改人 |
> |------|----------|----------|----------|--------|
> | V1.0 | 2026-09-05 19:20:00 | 初稿 | TypeScript / Vue 3 / Canvas / 资产 / Git 提交规范 | castle |
> | V1.1 | 2026-09-05 21:12:00 | 设计修订 | 新增 §十一 多语言编码规范（原十一/十二章顺延为十二/十三）；分层约束增加适配层与 i18n 条款；技术栈表增加 vue-i18n | castle |
>
> **适用范围**：LudoBurrow 全部源码与资产（src/ / tests/ / assets/）

---

## 一、通用原则

### 1.1 核心理念

| 原则 | 含义 |
|------|------|
| KISS | 最简方案优先，不过度工程化 |
| DRY | 重复逻辑提取为公共方法/组件，禁止复制粘贴 |
| YAGNI | 不做未需要的功能，不做投机性抽象 |
| 不可变性 | 优先创建新对象而非修改已有对象，避免隐式副作用 |
| 纯函数优先 | 可测逻辑抽为纯函数（输入→输出），副作用收拢到边界 |

### 1.2 文件组织

- 单文件 100-300 行为常规，**500 行为硬上限**（游戏实例等复杂模块可申请豁免并注明理由）
- 高内聚低耦合，按功能/领域组织，而非按类型
- 一起变更的文件应放在一起；多个小文件优于少数大文件

### 1.3 命名规范

| 类型 | 规则 | 示例 |
|------|------|------|
| 目录/模块 | kebab-case | `jigsaw-cutter/` |
| Vue 组件文件 | PascalCase | `LevelSelect.vue` |
| TS 模块文件 | kebab-case | `game-registry.ts` |
| 类/接口/类型 | PascalCase | `GameModule`、`CutPlan` |
| 函数/变量 | camelCase | `createLevel`、`targetIndex` |
| 常量 | UPPER_SNAKE_CASE | `MAX_GRID_SIZE` |
| 布尔 | is/has/can 前缀 | `isUnlocked`、`hasTimeLimit` |
| 类型文件 | 与主题同名的 `*.ts` 或 `types.ts` | `level.ts` |

### 1.4 注释规范

- 解释 **WHY**（为什么），而非 WHAT（做什么）
- 自文档化代码优先，仅在逻辑不自明时加注释
- 导出函数写简短 TSDoc（一句话 + 参数/返回仅在不显然时）

---

## 二、TypeScript 规范

### 2.1 严格模式（不可降级）

```jsonc
// tsconfig.json 编译选项基线
{
  "strict": true,
  "noUnusedLocals": true,          // 死代码门禁，不可禁用
  "noUnusedParameters": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true
}
```

### 2.2 类型纪律

- **禁止 `any`**；至少 `unknown` + 类型收窄。禁止 `as any`；类型断言仅用于收窄且必须注释理由
- **类型不撒谎**：runtime 行为与类型签名不一致时，修正类型或实现，不得用断言掩盖
- `type` 定义联合/工具类型；`interface` 定义对象结构；判别联合建模状态：

```ts
type LevelState =
  | { phase: 'idle' }
  | { phase: 'running'; startedAt: number }
  | { phase: 'settled'; result: LevelResult }
```

- 所有函数标注参数与返回类型（推导显而易见的局部变量可省）

### 2.3 不可变性

```ts
// 正确：展开创建新对象
const next = { ...save, unlocked: { ...save.unlocked, [gameId]: n + 1 } }

// 避免：直接变异深层结构（存档写入路径尤其禁止）
// save.unlocked[gameId] = n + 1
```

- 存档对象一经 load 视为只读快照，更新走「新建 → persist」
- engines 内部数据结构一律不可变风格（切块计划、迷宫数据生成后冻结）

### 2.4 错误处理

- engines/ai 层用**返回值表达可预期失败**（`Result<T>` 或显式 union），不 throw 业务异常
- 仅编程错误（断言失败、不可能状态）throw；UI 层统一 catch 后展示非阻断提示
- **禁止**空 catch 静默吞错；至少 console.warn（开发期）并走降级路径

### 2.5 模块与导入

- 导入顺序：类型 → 第三方库 → 本地模块 → 资产
- 禁止循环依赖（core/engines 分层已从结构上排除，新增模块保持）
- 目录内公共出口经 `index.ts`；跨层导入只走公共出口

---

## 三、Vue 3 规范

### 3.1 组件结构（`<script setup>` 固定顺序）

```vue
<script setup lang="ts">
// 1. 类型导入
import type { LevelConfig } from '@/core/level-manager'
// 2. 组件导入
import StarRating from './StarRating.vue'
// 3. store/composable 导入
import { useSettingsStore } from '@/stores/settings'
// 4. Props & Emits
const props = defineProps<{ level: LevelConfig }>()
const emit = defineEmits<{ retry: []; next: [] }>()
// 5. 响应式状态
const running = ref(false)
// 6. 计算属性
const title = computed(() => `第 ${props.level.n} 关`)
// 7. 方法
function start() { ... }
// 8. 生命周期
onMounted(start)
</script>

<template>
  ...
</template>

<style scoped>
/* 仅组件级样式 */
</style>
```

### 3.2 组合式 API

- 一律 `<script setup lang="ts">`；**禁止 Options API**
- 可复用逻辑提取为 composable（`use*.ts`）；游戏实例逻辑不得塞进组件

### 3.3 状态管理（Pinia）

```ts
// stores/settings.ts
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref(defaultSettings())
  const timeLimitMode = computed(() => settings.value.timeLimit.mode)

  function update(patch: Partial<Settings>) { ... }

  return { settings, timeLimitMode, update }
})
```

- 仅平台级状态建 store（技术架构 §16.2）；游戏内部状态留在 GameInstance
- store 单测与组件解耦（见测试规范 §四）

### 3.4 组件纪律

- 组件只做「渲染 + 事件转发」；规则判断调 core/engines
- 平台 UI 一律响应式；Canvas 内高频交互不做响应式包装（性能）
- 样式 scoped；全局样式仅设计 token（颜色/字号）一处定义

---

## 四、目录与模块规范

### 4.1 目录结构（与《技术架构说明文档》§4.1 一致）

```
src/
├── core/        # 平台内核（无 Vue 依赖）
├── games/       # GameModule 插件（每游戏一目录）
├── engines/     # 纯逻辑引擎（无 DOM/无 Vue）
├── ai/          # AI Provider（OpenAI 兼容封装）
├── components/  # 平台级 UI
├── i18n/        # 语言包 + 注册表（§十一）
├── services/    # 运行环境适配层：登录态/素材仓库（技术架构 §7.4）
└── assets/      # 图库/瓦片/sprite
tests/           # 独立测试目录（与 src/ 分离）
```

### 4.2 分层约束（评审必查）

| 规则 | 说明 |
|---|---|
| core/engines 不 import Vue | 保证纯逻辑可移植可单测 |
| games 不直接读写 localStorage | 一律经 core/save.ts |
| engines 不触碰 DOM/localStorage/fetch | 像素数据以参数注入 |
| components 不直接 import games | 经 game-registry 动态获取 |
| ai/ 不做业务决策 | 合法性判断在 engines 规范化器 |
| 登录态与自定义素材访问必须经 services/ 适配层 | 禁止业务代码直连 IndexedDB / 远端 API 实现这两类能力（Web 二期框架预留） |
| UI 文案一律 i18n key（`t()`） | 禁止组件硬编码中英文文案；禁止 `if locale` 语言分支（§十一） |

### 4.3 GameModule 实现约定

- 每游戏目录：`index.ts`（模块出口）/ `level.ts`（createLevel）/ `instance.ts`（GameInstance）
- `createLevel(n)` 必须纯函数：同 n 同结果；内部只用 `createRng(seed)` 派生随机
- `destroy()` 必须清理全部事件监听、rAF、定时器（泄漏由组件测试覆盖）

---

## 五、Canvas 与游戏循环规范

### 5.1 渲染纯函数化

- 坐标计算、命中检测、布局计算抽为**纯函数**（输入状态 → 输出图元描述），单测直接覆盖
- 绘制函数只做「图元描述 → ctx 绘制」，不掺逻辑

### 5.2 游戏循环

- rAF 驱动主循环；暂停即取消 rAF，恢复重建
- 状态机显式建模（`'idle' | 'running' | 'paused' | 'settled'`），禁止布尔标志叠加
- 帧内逻辑与渲染分离：先 update(state, dt) 再 draw(ctx, state)

### 5.3 交互与坐标

- 事件坐标 → 画布坐标换算封装为工具函数（处理 devicePixelRatio 与缩放）
- 拖拽用 Pointer Events（统一鼠标/触摸；触屏适配已排期二期——iOS 移动端支持，开发计划 §四之二 W-6）

### 5.4 资源

- 图片解码用 `createImageBitmap`；加载失败占位提示，不崩溃
- 大图（≥1K）绘制前按显示尺寸离线缩放一次，避免每帧缩放

---

## 六、构建与产物规范

- `vite.config.ts`：`base: './'` + `vite-plugin-singlefile`（IIFE 单文件）；配置变更需同步《技术架构说明文档》§18
- **禁止运行时 fetch 本地资源**（file:// CORS）：关卡/词库/布局常量一律 TS 内嵌
- 资产引用走相对路径 `assets/...`；构建产物不得出现外链 `<script src>` / `<link rel="stylesheet">`
- 依赖新增须经用户确认并登记《代码规范》§十三（本表）

---

## 七、安全与隐私规范

| 检查项 | 要求 |
|---|---|
| 密钥 | **禁止硬编码任何 API Key/密钥**；AI Key 仅设置页录入存 localStorage |
| 网络传输 | 除用户主动触发的 AI 切块建议请求外，**禁止任何网络请求** |
| 代码注入 | 禁止 `eval` / `new Function`；动态内容渲染走 Vue 模板（自动转义），禁止手拼 `innerHTML` |
| 用户图片 | FileReader 本地读取，仅用于切块与显示；不产生上传 |
| 存档导入 | importJson 必须过 schema 校验 + 迁移链，非法数据拒绝并提示，不部分应用 |
| 依赖供应链 | 依赖钉版（精确版本）；新增依赖审查协议与体积 |

---

## 八、Git 提交规范

格式：`<type>: <description in Chinese> yyyymmdd by castle`

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改变行为） |
| `docs` | 文档变更 |
| `test` | 测试相关 |
| `chore` | 构建/配置/工具/资产 |

示例：`feat: 拼图切块引擎非均匀网格与块唯一性校验 20260915 by castle`

- 一个提交聚焦一件事；里程碑收尾提交注明里程碑号（如 `feat: M2 键盘游戏四模式全量 …`）
- 提交前必须本地过 `npm run typecheck && npm run test`（见测试规范 §七）

---

## 九、日志与调试规范

- 开发期可用 `console.log/warn` 临时调试；**提交前删除**（vite 构建不剔除 console）
- 降级/异常路径保留 `console.warn`（带上下文：模块名 + 关键参数），生产可查
- 禁止输出 AI Key、完整存档内容等敏感值

---

## 十、资产与内容规范

### 10.1 图片资产

- 内置图库：`assets/images/<专题>/<名称>.png`（M3.9 实施口径：`scripts/gen-gallery.mjs` 确定性程序化生成，1024 源图仅绘制 + 192 分析缩略同配方内嵌 `src/games/jigsaw/thumbs.ts`；生成产物勿手改，重跑脚本即复现）
- 许可标注：图库根目录 `CREDITS.md`（生成素材随项目 MIT 发布）；若后续收录开源素材，改为每专题 `LICENSE.md` 逐张标注来源 URL、作者、许可（CC0/CC-BY）
- 命名：kebab-case，含义明确（`animals-01.png`）

### 10.2 瓦片与 sprite

- `assets/tiles/<主题>/` 瓦片集 + `assets/sprites/` 帧动画条带（M4 实施为单文件 `hero.png` 96×128 条带）
- 同主题瓦片尺寸统一；M4 实施口径：`scripts/gen-maze-assets.mjs` 确定性程序化生成（同 §10.1 图库口径，CREDITS.md 随 MIT 标注）；CC0 来源（Kenney/OpenGameArt）为后续收录位优先项

### 10.3 词库

- 英文词表按词长分级导出：`export const WORDS_L3: string[]` …
- 拼音词表结构：`{ word: '学校', pinyin: 'xue xiao' }[]`
- 词库变更须同步测试快照（见测试规范 §六）

---

## 十一、多语言（i18n）编码规范

### 11.1 基本纪律

- UI 文案一律 `t('段.键')` 取值，**禁止硬编码中英文文案**（含 placeholder / aria-label / title / toast）
- 键命名：`段.名称`，段按页面/功能域划分（`common` / `menu` / `level` / `settings` / `jigsaw` / `maze` / `keygame` / `settle`…）
- **同功能同描述同出处**：同一功能、同一词义的文案只用一个 key；跨页面通用文案一律放 `common` 段；**禁止多个段重复定义同名同值键**；同一 key 的双语值语义必须一致（减少运维成本、口径统一）
- 插值用 vue-i18n 参数（`t('level.n', { n })`），禁止字符串拼接文案
- 禁止 `if (locale === 'xx')` 类硬编码语言分支——语言差异只存在于语言包

### 11.2 语言包结构

```
src/i18n/
├── zh-CN.ts        # 默认语言
├── en-US.ts        # 与 zh-CN 键位 1:1（守卫强制）
└── index.ts        # SUPPORTED_LOCALES + LOCALE_OPTIONS 单一出处
```

### 11.3 新增语言（仅加不改）

1. 新增 `src/i18n/<locale>.ts`（键位与 zh-CN 1:1）
2. `index.ts` 的 `SUPPORTED_LOCALES` 与 `LOCALE_OPTIONS` 各加一项
3. 守卫测试自动纳入新包；同步检查文档示例

### 11.4 翻译齐备守卫（发布门禁）

守卫测试 + `npm run check:i18n` 强制：zh↔en 键位双向 1:1；空值 = 未翻译即失败；SUPPORTED_LOCALES ↔ 语言包注册一致；LOCALE_OPTIONS ↔ SUPPORTED_LOCALES 一致；跨段同名同值重复键为零（同功能同描述同出处）。详见《测试规范文档》§3.4。

---

## 十二、错误处理规范（用户可见口径）

与技术架构 §2.2/§13 对齐：

| 场景 | 策略 |
|---|---|
| file:// 兼容异常 | 检测到异常加载时提示改用双击 index.html |
| 图片加载失败/损坏 | 占位提示 + 可重新导入，不崩溃 |
| 存档损坏/版本过旧 | schema 迁移链；无法恢复时提示备份存在与否，用户确认后才重置 |
| AI 调用失败/超时 | 自动降级本地算法 + 非阻断提示 |
| 拼图重新切块 | 已有摆放进度时弹确认框（历史方案进度不受影响） |

- 用户提示统一中文、一句话、含下一步动作；禁止裸抛技术错误码给玩家

---

## 十三、技术栈版本要求

> 原则：**精确版本钉版**（不用 `^`/`~`），M1 脚手架初始化时锁定并回填本表；升级须走文档修订 + 全量回归。

| 技术 | 版本 | 说明 |
|------|------|------|
| Node.js | （M1 锁定） | 开发环境 |
| TypeScript | （M1 锁定） | strict 全开 |
| Vite | （M1 锁定） | 构建 |
| vite-plugin-singlefile | （M1 锁定） | IIFE 单文件产物 |
| Vue 3 | （M1 锁定） | `<script setup>` |
| Pinia | （M1 锁定） | 平台状态 |
| vue-i18n | （M1 锁定） | 多语言（legacy: false，§十一） |
| Vitest | （M1 锁定） | 测试引擎 |
| @vue/test-utils | （M1 锁定） | 组件测试 |
| @vitest/coverage-v8 | （M1 锁定） | 覆盖率 |
| happy-dom | （M1 锁定） | DOM 测试环境 |
| vue-tsc | （M1 锁定） | 类型检查 |

| 工具 | 用途 |
|---|---|
| Prettier | 格式化（Vue/TS） |
| ESLint | Lint（no-unused-vars 等与 tsconfig 双保险） |
