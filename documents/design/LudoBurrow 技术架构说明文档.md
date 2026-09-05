# LudoBurrow 技术架构说明文档

> **文档名称**：LudoBurrow 技术架构说明文档
> **基于文档**：《LudoBurrow架构说明》（设计定稿 v1.0，2026-09-05；原文档已迁移吸收至本文档体系）
>
> **修订记录**：
>
> | 版本 | 日期时间 | 修订性质 | 修订摘要 | 修改人 |
> |------|----------|----------|----------|--------|
> | V1.0 | 2026-09-05 19:10:00 | 初稿 | 设计定稿 v1.0 权威化：总体架构 / GameModule 插件体系 / 三游戏设计 / AI 能力 / 数据资产 / 构建发布 / 测试基线 | castle |
> | V1.1 | 2026-09-05 21:05:00 | 设计修订 | ①分期边界定稿：一期本地优先全量落地 + Web 框架预留（新增 §7.4 运行环境适配层、§19.2 二期框架）②多语言一期化（新增 §13.5）③自定义素材经适配层持久化（本地 IndexedDB，§15 修订）④非目标/风险/结论同步更新 | castle |
> | V1.2 | 2026-09-06 05:30:00 | 实施同步 | M6 定稿口径同步：§5.5 PWA 已落地（M6.2，实施细节见《部署规范》§5.3）；§13.5 增补 i18n 豁免边界（AI 提示词 / manifest 元数据 / 诊断日志非 UI 文案，M6.6）；§21 / R-02 图库扩充至 24 张（M6.1 实测约 870KB）与「专题包化」实施口径（目录专题化全量随包 + 在线 SW 按需缓存） | castle |
>
> **适用范围**：LudoBurrow 全部开发实施（本文为技术架构唯一权威来源；《架构说明（正式版）》为评审精简口径，冲突时以本文为准）

---

# 1. 文档概述

## 1.1 编写背景

LudoBurrow 于 2026-09-05 完成设计定稿（v1.0）。为支撑 M1-M6 开发实施，需将设计定稿扩展为可执行的技术架构权威文档，明确模块职责、接口契约、数据流与质量基线。本文承担该职责。

**命名查重**：GitHub 全站 `LudoBurrow in:name` 零重名（2026-09-05 验证；曾拟名 LudoNest，因与活跃仓库 `Loenus/ludonest` 重名而弃用）。

## 1.2 文档目标

- 定义系统架构结论与运行形态（本地 file:// + 在线双模式）
- 定义模块划分、依赖方向与 GameModule 插件契约
- 定义三游戏的核心算法与交互设计
- 定义 AI 能力边界、降级链与安全口径
- 定义数据与资产形态、构建发布与测试基线

## 1.3 适用范围

- 开发实施（M1-M6 全里程碑）与 AI 辅助开发的架构依据
- 代码评审与文档审核的对照基准
- 《代码规范》《测试规范文档》《部署规范》《开发计划文档》均以本文为上游

# 2. 系统建设目标与原则

## 2.1 总体目标

面向儿童与休闲玩家（教学/家庭场景友好）的 PC 端益智游戏平台：内置键盘按键、拼图、迷宫三游戏（各 50 关），**免安装本地即玩，同一产物可在线部署**。

## 2.2 核心建设原则

| 原则 | 含义 | 架构落点 |
|---|---|---|
| 免安装 | 本地双击 `index.html` 即玩（file:// 协议），本地优先 | 单文件 IIFE 构建 + 相对路径资产（§5.4） |
| 轻便 | 一期本地纯前端静态产物（无后端、无数据库）；二期 Web 端仅增加登录与素材隔离服务端 | 进度状态全在 localStorage；关卡/词库 TS 内嵌（§15）；Web 分叉点收拢到适配层（§7.4） |
| 双端一致 | Web 端除用户登录与自定义素材隔离外，与本地端行为完全一致 | 运行环境适配层一期预留框架（§7.4），二期免大改 |
| 多语言 | UI 中/英双语，个人设置切换立即生效，框架可扩展 | i18n 语言包 + 注册表 + 翻译齐备守卫（§13.5） |
| 扩展性 | 游戏插件化，新增游戏零侵入 | GameModule 统一接口 + 注册表（§8） |
| 开源合规 | 内置素材全部 CC0/CC-BY；商业 IP 不分发 | 图库 license 标注 + 自定义导入仅本地（§15.3） |
| 确定性 | 同关卡同内容，可复现可分享 | 参数 + 种子程序化生成（§9） |

# 3. 系统定位与边界

## 3.1 系统定位

纯前端静态单页应用（SPA），双模式运行：

- **本地模式（主形态）**：Release zip 解压 → 双击 `index.html` → file:// 协议运行
- **在线模式**：同一构建产物部署 GitHub Pages / Vercel / 内网静态服务器，零改动

## 3.2 非目标说明（一期明确不做）

| 非目标 | 说明 |
|---|---|
| 移动端 / 触屏适配 | PC 优先，键盘 + 鼠标交互 |
| 中/英之外的语言包 | i18n 框架可扩展（§13.5），具体新语言按需立项 |
| 云存档 / 进度同步 / 在线排行 / 多人对战 | 不做（二期也不做） |
| 内置商业 IP 素材 | 汪汪队、奥特曼等仅用户自定义导入本地使用，不分发 |
| Web 服务端实现（登录/素材存储） | **属二期**（§19.2）；一期仅交付适配层框架与 LocalAdapter |

> 未经用户决策，AI 不得擅自实施上述任何非目标（CLAUDE.md §能力边界 同源约束）。

# 4. 总体架构设计

## 4.1 架构结论

**纯前端单页静态应用**：Vite + TypeScript + Vue 3 + Pinia + Canvas 2D；Vue 负责平台级 UI（菜单/关卡选择/设置/结算），Canvas 负责拼图与迷宫的高性能渲染，键盘游戏用 DOM/CSS。

```
┌─────────────────────────────────────────────────────────┐
│ components/（平台级 UI：主菜单/关卡选择/暂停/结算/设置）      │
├──────────────────────────┬──────────────────────────────┤
│ games/keygame │ jigsaw │ maze（GameModule 插件）          │
├──────────────────────────┼──────────────────────────────┤
│ core/（平台内核）          │ engines/（纯逻辑引擎）           │
│ registry/level/timer/     │ jigsaw-cutter / maze-generator │
│ save/settings             │ / wordbank                     │
├──────────────────────────┴──────────────────────────────┤
│ ai/（AI Provider：Qwen/GLM/自定义，OpenAI 兼容）            │
│ services/（运行环境适配层：登录态+素材仓库）  i18n/（语言包）  │
├─────────────────────────────────────────────────────────┤
│ assets/（CC0 图库 / 瓦片 / sprite，相对路径引用）             │
└─────────────────────────────────────────────────────────┘
```

**依赖方向**：`components / games → core`，`games → engines`，`components/games → services / i18n`；engines 与 core **不依赖 Vue**；禁止任何反向依赖。`ai/` 仅被 jigsaw-cutter 的 AI 增强路径与设置页消费；`services/` 不依赖具体游戏。

## 4.2 逻辑分层

| 层 | 职责 | 禁止事项 |
|---|---|---|
| components/ | 平台级 UI、视图切换、Pinia 平台状态 | 不含游戏规则逻辑 |
| games/ | GameModule 实现：关卡配置生成 + 实例挂载 + 游戏内交互 | 不绕过 core 直接读写存档 |
| core/ | 注册表、关卡序列、计时、存档、设置 | 不依赖具体游戏；不依赖 Vue |
| engines/ | 切块算法、迷宫生成、词库等纯函数计算 | 不触碰 DOM/Canvas/localStorage |
| services/ | 运行环境适配：登录态、自定义素材仓库（本地/Web 两实现） | 不做业务决策；业务代码不得绕过它直连 IndexedDB/远端 |
| i18n/ | 语言包与 SUPPORTED_LOCALES 注册表 | 组件不自带翻译副本；不硬编码语言分支 |
| ai/ | OpenAI 兼容请求封装、Provider 预设、超时与降级 | 不内置任何 Key；不做本地算法兜底以外的业务决策 |

## 4.3 核心使用场景

### 场景 A：本地即玩

```
下载 Release zip → 解压 → 双击 index.html（file://）
→ 主菜单选游戏 → 关卡选择 → 进入第 n 关（createLevel(n) 确定性生成）
→ 游玩 → 结算（用时/星级）→ save 写 localStorage → 解锁第 n+1 关
```

### 场景 B：新游戏插件接入

```
新建 games/xxx/ 目录 → 实现 GameModule 五成员 → game-registry 注册一行
→ 平台计时/存档/关卡管理/限时策略自动生效
```

### 场景 C：拼图自定义切块（版本隔离）

```
图片管理页导入（FileReader，本地读取，不出本机）
→ 预切块（调参数 / 换种子 / 选算法 / AI 建议，实时预览）
→ 满意后保存为「切块方案」（独立版本，独立进度）
→ 用该方案开玩；再次切块生成新方案，旧方案进度原样保留，可回滚
```

### 场景 D：AI 增强切块（可选）

```
设置页配置 Provider（Qwen/GLM/自定义 + Key，存 localStorage）
→ 切块工作流请求视觉模型返回切割线建议 JSON
→ 本地规范化器（schema 校验 + 合法化）→ 块唯一性校验
→ 应用 / 校验不通过或请求失败 → 自动降级本地算法（非阻断提示）
```

# 5. 技术选型基线

## 5.1 选型原则

1. **file:// 可运行**是硬约束——任何选型必须兼容单文件 IIFE 构建
2. 生态规模与 AI 辅助开发资料完备度优先（Vue 3 > 其它）
3. 与 Vite 同体系的工具链优先（Vitest）
4. 精确版本于 M1 脚手架初始化时锁定，钉版清单登记于《代码规范》§十三，此后升级需走文档修订

## 5.2 前端技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 语言 | TypeScript（strict） | `noUnusedLocals` / `noUnusedParameters` 不可禁用 |
| 构建 | Vite + vite-plugin-singlefile | `base:'./'`；IIFE 单文件输出（§18） |
| UI 框架 | Vue 3（`<script setup>`） | 平台级 UI；游戏内高频渲染走 Canvas |
| 状态管理 | Pinia | 仅平台级状态（当前游戏/关卡/设置/存档快照） |
| 国际化 | vue-i18n（legacy: false） | zh-CN/en-US 语言包；SUPPORTED_LOCALES 注册表扩展新语言（§13.5） |
| 渲染 | Canvas 2D + DOM/CSS | 拼图/迷宫 Canvas；键盘游戏 DOM |
| 随机数 | mulberry32（自实现） | 种子可复现；关卡生成禁用 Math.random |

## 5.3 测试与质量工具

| 工具 | 用途 |
|---|---|
| Vitest + @vitest/coverage-v8 | 测试引擎 + 覆盖率 |
| @vue/test-utils + happy-dom | 组件测试 |
| vue-tsc | 类型检查（发布门禁） |

## 5.4 file:// 本地双击的关键决策

现代浏览器在 file:// 下以 CORS 阻止 ES Module 加载。因此构建采用 **vite-plugin-singlefile 产出单个 IIFE 格式 index.html**（JS/CSS 全内联）；1K+ 分辨率图片因体积原因不内联，以相对路径放 `assets/` 随包分发。

**发布产物形态**：

```
LudoBurrow-v1.0.0/
├── index.html        # 单文件应用（JS/CSS 内联，IIFE）
└── assets/
    └── images/...    # 内置图库（相对路径引用）
```

localStorage 在 file:// 下 Chrome/Edge/Firefox 均可用（按 origin 隔离，file 页面共享同一存储区）。

## 5.5 在线部署

同一构建产物直接发布 GitHub Pages / Vercel / 内网静态服务器，零改动（`base:'./'` 保证相对路径资产在子路径下可用）。PWA（Service Worker 缓存）已随 M6.2 落地：在线版访问一次、之后离线可玩；实施细节（预缓存清单 / 拦截边界 / CACHE_VERSION 与 package.json 双门禁校验）见《LudoBurrow 部署规范》§5.3。file:// 本地版不依赖 SW（注册条件不满足时静默跳过）。

# 6. 版本兼容性与前置验证

## 6.1 运行环境策略

| 项 | 策略 |
|---|---|
| 浏览器矩阵 | Chrome / Edge / Firefox 三浏览器为支持基线（M1 起每里程碑冒烟） |
| Node 版本 | 以 M1 脚手架锁定版本为准，登记《代码规范》§十三 |
| localStorage | file:// 与 https:// 均可用；存储上限约 5MB，存档设计必须远小于该值 |

## 6.2 file:// 行为验证清单（M1 必测）

| # | 验证项 | 期望 |
|---|---|---|
| 1 | 双击 index.html 加载 | 三浏览器均正常运行，无 CORS 报错 |
| 2 | localStorage 读写 | file:// 下可读写 `ludoburrow/save` |
| 3 | 相对路径图片加载 | assets/ 图片正常显示 |
| 4 | 重新打开进度恢复 | 关闭浏览器重开，进度与设置恢复 |
| 5 | 在线部署等价性 | 同一产物 https:// 下行为一致 |

## 6.3 启动前验证清单（M1 脚手架验收）

- [ ] `vue-tsc --noEmit` 0 errors
- [ ] `vitest run` 通过（含示例测试）
- [ ] `npm run build` 产出单文件 `dist/index.html`（无外链 script/link）
- [ ] dist/ 双击 file:// 可运行
- [ ] 覆盖率脚本门禁生效（阈值 80%）

# 7. 模块化架构设计

## 7.1 模块清单

| 模块 | 职责 | 关键导出 |
|---|---|---|
| `core/game-registry.ts` | GameModule 注册表：注册即接入 | `registerGame(module)` / `listGames()` / `getGame(id)` |
| `core/level-manager.ts` | 每游戏 50 关序列、顺序解锁、星级与最佳成绩读写 | `getUnlockedCount(gameId)` / `recordResult(...)` |
| `core/timer.ts` | 正计时 + 可选上限（竞赛/防沉迷两语义） | `createTimer(options)` |
| `core/save.ts` | 存档：localStorage 单 key + schema version + 迁移链 + JSON 导入导出 | `loadSave()` / `persist(save)` / `exportJson()` / `importJson(text)` |
| `core/settings.ts` | 全局设置（音效、限时策略、AI Provider 配置）读写与默认值 | `getSettings()` / `updateSettings(patch)` |
| `games/keygame/` | 键盘游戏 GameModule 实现 | `keygameModule: GameModule` |
| `games/jigsaw/` | 拼图游戏 GameModule 实现 | `jigsawModule: GameModule` |
| `games/maze/` | 迷宫游戏 GameModule 实现 | `mazeModule: GameModule` |
| `engines/jigsaw-cutter/` | 切块引擎：梯度分析 + 非均匀网格 + 锯齿凸凹 + 唯一性校验；AI 建议规范化 | `cut(image, options): CutPlan` / `normalizeAiSuggestion(json)` |
| `engines/maze-generator/` | 迷宫生成：mulberry32 + 递归回溯 + 分支度 | `generateMaze(seed, size, options): MazeData` |
| `engines/wordbank/` | 词库：数字/字母序列、英文分级词、拼音词表 | `getSequence(level)` / `getWords(level)` / `getPinyin(level)` |
| `engines/rng.ts` | mulberry32 PRNG 封装（三游戏共用） | `createRng(seed)` |
| `components/` | 平台级 UI（§16） | — |
| `ai/` | OpenAI 兼容请求封装 + Provider 预设 + 超时/降级（§14） | `requestCutSuggestion(provider, image)` |
| `i18n/` | 语言包（zh-CN/en-US）+ SUPPORTED_LOCALES 注册表 + vue-i18n 装配（§13.5） | `SUPPORTED_LOCALES` / `LOCALE_OPTIONS` |
| `services/` | 运行环境适配层：登录态 + 自定义素材仓库（§7.4） | `getEnvAdapter()` / `EnvAdapter` |

## 7.2 模块职责详述

### 7.2.1 core/（平台内核）

游戏无关的内核五件。全部不依赖 Vue、不触碰 DOM（timer 用可注入的时钟源，便于单测）。save.ts 是唯一触碰 localStorage 的模块（settings 并入 save 的一个字段段，避免多 key 并发写）。

### 7.2.2 games/（游戏插件）

每个游戏目录结构约定：

```
games/jigsaw/
├── index.ts          # GameModule 实现（注册入口）
├── level.ts          # createLevel(n)：第 n 关参数 + 种子 → LevelConfig
└── instance.ts       # mount() 返回的 GameInstance（渲染 + 交互 + 完成回调）
```

游戏实例只经 GameHooks 与平台交互（上报进度/请求结算），不直接操作 save/level-manager。

### 7.2.3 engines/（纯逻辑引擎）

无 UI、无 DOM、无 localStorage 的纯 TS 模块，是一期单测覆盖率要求最高的层（≥90%）。Canvas 像素采样类计算（切块梯度分析）以可注入的 ImageData 输入实现，测试用合成像素数据。

### 7.2.4 ai/（AI Provider 层）

仅封装 OpenAI 兼容 HTTP 调用（fetch + 超时中断），不内置 Key，不做业务决策；业务合法性判断全部在 engines 的规范化器中完成。

## 7.3 依赖方向图

```
components ──▶ games ──▶ core
                │
                ▼
             engines ──▶ ai（仅 jigsaw-cutter 的 AI 增强路径）
```

- core 不依赖 games/engines；engines 不依赖 core
- components 不直接 import games（经 game-registry 动态获取）

## 7.4 运行环境适配层（services/，Web 框架预留）

**设计动机**：一期本地优先（无登录、素材不隔离），二期 Web 端需要用户登录与自定义素材用户隔离。为避免二期大改，一期即把两模式的**全部分叉点**收拢到适配层：

| 分叉点 | 本地模式（一期实现） | Web 模式（二期实现） |
|---|---|---|
| 登录态 | 匿名单用户（恒为「本地用户」，无登录 UI） | 用户登录 + 会话（登录页/登出） |
| 自定义素材仓库 | IndexedDB（本机持久化，不隔离） | 服务端按用户隔离存储（REST API） |

```ts
interface EnvAdapter {
  auth: {
    getCurrentUser(): AppUser | null       // 本地恒返回匿名本地用户
    login?(credentials): Promise<AppUser>  // 仅 Web 实现提供
    logout?(): Promise<void>
  }
  assetRepo: {
    saveImage(image: Blob, meta: ImageMeta): Promise<AssetRef>
    listImages(): Promise<AssetMeta[]>
    loadImage(ref: AssetRef): Promise<Blob>
    deleteImage(ref: AssetRef): Promise<void>
  }
}
```

- **一期交付**：`services/types.ts` 接口 + `services/local-adapter.ts` 全量实现（业务全走它）+ `services/web-adapter.ts` 占位（未配置服务端时构造即报「二期能力」）
- **二期交付**：WebAdapter 对接服务端（技术选型二期定：轻量自建 REST 或 BaaS）+ 登录页与鉴权接入，**业务代码零改动**
- **访问规则**：games/components 不得直连 IndexedDB / fetch 实现登录或素材存取；core/save 的 localStorage 属两模式一致能力，不经适配层

# 8. GameModule 插件体系

## 8.1 设计原则

平台的扩展性核心：**游戏 = 插件**。平台内核（计时/存档/关卡/设置）对游戏一视同仁，全部经统一接口协作。

## 8.2 接口定义

```ts
interface GameModule {
  id: string                    // 唯一标识，如 'jigsaw'
  name: string                  // 显示名，如 '拼图'
  icon: string                  // 图标资源路径
  createLevel(n: number): LevelConfig
  mount(container: HTMLElement, level: LevelConfig, hooks: GameHooks): GameInstance
}

interface GameInstance {
  start(): void
  pause(): void
  resume(): void
  destroy(): void               // 必须清理事件监听与 rAF
}

interface GameHooks {
  onProgress(payload: LevelProgress): void   // 进度上报（可选频率）
  onComplete(result: LevelResult): void      // 完成 → 平台结算
  onAbandon(): void                          // 放弃 → 平台记失败/退出
}
```

## 8.3 LevelConfig 约定

- 由 `createLevel(n)` 以「参数 + 种子」确定性生成（§9）
- 各游戏自定义具体字段（拼图：网格规格/图片引用/方案 id；迷宫：尺寸/分支度/主题/种子；键盘：模式/序列长度/限时）
- 必须可序列化（进存档仅存关卡号与方案引用，不存完整 config）

## 8.4 注册与生命周期

```
应用启动 → main.ts 依次 registerGame(keygame/jigsaw/maze)
→ 主菜单 listGames() 渲染入口
→ 选关后 getGame(id).createLevel(n) → mount(container, level, hooks)
→ 实例运行（start/pause/resume）
→ onComplete/onAbandon → 平台结算 → destroy() → 返回关卡选择
```

## 8.5 新游戏接入步骤

1. 新建 `games/xxx/`，实现 GameModule 五成员
2. `core/game-registry.ts` 注册一行
3. 平台计时、存档、关卡管理、限时策略自动生效——无需改动 core/components

# 9. 关卡与确定性生成

## 9.1 参数 + 种子原则

所有关卡由**参数 + 种子程序化生成**：

- **参数**：由关卡号 n 决定的难度参数（尺寸/长度/限时等）
- **种子**：`hash(gameId + ':' + n)` 派生，保证同关卡内容恒定
- 收益：无 150 个手工关卡文件；「第 37 关」可复现、可分享、可回归测试

## 9.2 PRNG

统一使用 **mulberry32**（32 位种子、速度快、跨浏览器一致）；封装为 `engines/rng.ts` 供三游戏共用。**关卡生成路径禁止使用 `Math.random()`**（UI 抖动等表现层随机可用）。

## 9.3 难度曲线（50 关通用骨架）

单要素起步 → 要素递增（序列变长/网格变大/迷宫变大）→ 引入限时/复杂度叠加。各游戏具体曲线见 §10.4 / §11.5 / §12.2。

# 10. 游戏设计——键盘按键（keygame）

## 10.1 术语约定（全项目统一）

- **大键盘 = 104 键全尺寸布局**：含字母区/数字行/功能键/右侧数字小键盘区
- **小键盘 = 紧凑布局**：不含右侧数字小键盘区（笔记本/87 键形态）

## 10.2 四种模式

| # | 模式 | 内容 |
|---|---|---|
| 1 | 大键盘 · 随机字母数字 | 虚拟键盘渲染全尺寸布局，目标字符（0-9 与 A-Z 混合随机）在对应键位高亮，目标可能落在数字小键盘区 |
| 2 | 小键盘 · 随机字母数字 | 紧凑布局，同上但无小键盘区 |
| 3 | 英文固定单词 | 分级词库（短词→长词），逐字母输入 |
| 4 | 中文拼音 | 屏幕显示汉字（如「学校」），玩家逐键输入其拼音字母序列 `x-u-e-x-i-a-o`；**直接匹配字母序列，不经过系统输入法** |

## 10.3 交互与反馈

虚拟键盘可视化 + 实时反馈：按对目标键**变绿**并推进下一个目标；按错**变红抖动**（不惩罚性打断，错误计数入成绩）。

## 10.4 50 关难度曲线

单字符 → 序列变长 → 引入限时速度要求 → 单词/拼音词长递增；大/小键盘模式各自成线，由 `createLevel(n)` 参数化生成。

## 10.5 实现要点

- 虚拟键盘为 DOM/CSS 组件（非 Canvas），键位布局数据驱动（大/小两套布局常量）
- 物理键盘监听 keydown → 归一化 key 标识 → 与目标序列比对
- 成绩 = 用时 + 错误次数 → 星级

# 11. 游戏设计——拼图（jigsaw）

## 11.1 布局（五区）

```
┌─────────────┬───────────────────────────┐
│  左上：效果图 │                           │
│  (完成参考)  │        中间：拼图区         │
├─────────────┤     (网格底座 + 吸附)       │
│  左下：暂存区 │                           │
│  (可放大细节) │                           │
├─────────────┼───────────────────────────┤
│  右上：当前块 │      右下：剩余块          │
│  (顺序推出)  │   (按顺序的缩略列表)        │
└─────────────┴───────────────────────────┘
```

## 11.2 玩法流程

1. 右下「剩余块」**按顺序**自动推送一块到右上「当前块」位
2. 用户将当前块拖入**中间拼图区**（或先放**左下暂存区**，暂存区支持放大查看细节）
3. **吸附 = 网格级校准**：任何块拖近任何网格位都吸附对齐——每块尺寸相近，放错位置也能稳稳卡进格子，与线下拼图一致；对错由线条颜色关联判断，可以猜、可以挪走重摆
4. **校验时机**：左下暂存区 + 右上当前块 + 右下剩余区**三区全空**（所有块都已进入中间区）时，执行完整性校验并结算

## 11.3 放弃按钮（分步演示标准答案）

按下后程序按固定顺序动画演示：①**中间区**的块逐个修正到正确位置（标记哪些原本就放对）→ ②**左下暂存区**的块演示去向 → ③**右上当前块**演示去向 → ④**右下剩余块**依次归位。

## 11.4 帮助按钮

将右上的当前块自动放到正确位置；若正确位置被错误块占用，则该错误块先移入左下暂存区。**帮助次数计入成绩（影响星级）**。

## 11.5 50 关难度曲线

网格规格阶梯递增（每约 5 关进阶一档：3×3 → 4×4 → 5×5 → … → 9×9），图片复杂度同步提升（低关卡用主体突出、色块分明的图，高关卡用细节丰富、色彩相近的图）。

## 11.6 切块引擎（engines/jigsaw-cutter）

**算法目标**（类线下拼图的品质标准）：核心是**块与块之间线条和颜色的关联性**——

- 切割线可落在任何区域（包括人脸，线下拼图同样切脸）
- **避免大片同色区域密集切块**：纯色块（天空、白墙）无法相互区分，产生「模棱两可的位置」，必须规避
- 实现路径：**非均匀网格 + 锯齿凸凹边缘**。对图像做梯度/颜色方差分析，同色平坦区使用更大的块（少切），细节丰富区使用更小的块（多切）；锯齿凸凹方向/尺寸带随机种子，为形状匹配提供额外线索
- **块唯一性校验**：切割完成后对每块计算视觉区分度评分（颜色方差/边缘特征），低于阈值的块自动调整所属切割线，从算法上保证「不存在模棱两可的位置」

**本地算法为默认兜底**：纯前端计算（Canvas 像素采样），离线 file:// 模式永远可用。

## 11.7 AI 增强（可选）

预留 `CutSuggestionProvider` 接口，向视觉大模型发送图片，返回切割线建议 JSON（行列划分 + 每块权重），本地算法负责将其规范为合法切块方案。Provider 实现优先级：

| Provider | 端点 | 说明 |
|---|---|---|
| Qwen（DashScope） | OpenAI 兼容模式 | 用户指定优先 |
| GLM（智谱） | OpenAI 兼容模式 | 用户指定优先 |
| 自定义 | 任意 OpenAI 兼容 base URL | 扩展预留 |

API Key / Base URL / 模型名在设置页配置，存 localStorage（本机存储，不上传）。AI 调用失败、超时、未配置时**自动降级本地算法，功能不中断**。AI 返回的建议同样经过块唯一性校验，不合法则降级。

## 11.8 切块工作流与版本隔离（独立功能，不混入游戏内）

```
图片管理页：导入（FileReader 本地读取，不出本机）
   → 预切块（调参数 / 换种子 / 选算法 / AI 建议，实时预览）
   → 满意后保存为「切块方案」
   → 用该方案开玩
```

**版本与进度隔离（回滚语义）**：每个切块方案是独立版本，**各自挂独立游戏进度，互不删除**。第一次切块（方案 A）玩了几关后重新切块（方案 B），方案 A 的进度原样保留；回滚到 A 即继续 A 的进度。切换方案 = 切换存档槽。已有摆放进度时重新切块须弹确认框（防误触销毁当前盘面；历史方案进度不受影响）。

## 11.9 图片来源

- **内置图库**：CC0/CC-BY 高清图（≥1K 分辨率），按专题分组（动物、太空、风景、卡通等），来源 Wikimedia Commons / Kenney / OpenGameArt，随仓库携带并在文档标注每张图的 license
- **自定义导入**：用户本地任意图片（含商业 IP，私人使用不分发无风险），FileReader 读取，不产生网络传输

# 12. 游戏设计——迷宫（maze）

## 12.1 生成器

**种子随机（mulberry32 PRNG）+ 递归回溯算法**，分支度参数控制死胡同密度；同关卡可复现。

## 12.2 难度曲线（50 关）

迷宫尺寸递增、死胡同增多、路径复杂度上升；由 `createLevel(n)` 参数化（尺寸 / 分支度 / 主题 / 种子）。

## 12.3 主题（瓦片皮肤制）

每主题一套 CC0 像素瓦片 + 调色。候选：**城堡、花园、雪原、火山、海底、丛林、太空站、矿洞**（首期实现**城堡 + 花园**，其余按主题包扩展，M6 后增量）。

> **M4 实施口径**：离线环境无外网素材渠道（同 §15.3 图库口径）→ 瓦片由 `scripts/gen-maze-assets.mjs` 确定性程序化生成 PNG（每主题 wall/floor/goal/start 四瓦片，`assets/tiles/<主题>/`）；运行时**皮肤双轨**——paletteSkin 色板几何绘制先行渲染（零等待），PNG 皮肤异步加载成功后整体重画，任一资源失败保持色板兜底（可玩性优先）。`TileSkin` 同构接口（drawTile/drawHero）是渲染层唯一绘制入口，instance 不感知皮肤来源。

## 12.4 角色

马里奥式像素卡通小人（CC0 sprite，如 Kenney 角色素材），四方向朝向 + 走路帧动画，**非小黑点/火柴人**。

> **M4 实施口径**：hero sprite 由 `scripts/gen-maze-assets.mjs` 程序化生成——96×128 单条带（4 行方向 down/left/right/up × 3 帧站立/走 1/走 2，帧 32×32，`assets/sprites/hero.png`）；paletteSkin 兜底为帽（红）/脸（肤）/衣（蓝）/腿（深蓝）几何小人，朝向以脸部眼点区分（up 背影无点），同样满足「非小黑点/火柴人」。

## 12.5 操作与成绩

方向键 / WASD；到达出口过关，用时与步数计入成绩。

# 13. 平台通用功能设计

## 13.1 计时与限时（core/timer.ts）

- 每关**正计时**显示（结算是核心成绩指标）
- 可选**上限时间**，两种语义由设置选择：
  - **竞赛模式**：到时立即结算（已完成为成绩，未完成为失败）
  - **防沉迷模式**：到时提醒休息，可配置锁定时长（家长设置）

## 13.2 存档（core/save.ts）

| 项 | 设计 |
|---|---|
| 存储 | localStorage，单一 key `ludoburrow/save`，带 schema version |
| 导出/导入 | 设置页一键导出 JSON 文件 / 导入恢复（本地备份、换机迁移） |
| 内容 | 各游戏关卡进度与最佳成绩、解锁状态、全局设置、AI 配置、拼图切块方案（含各自进度） |
| 健壮性 | 写入前校验 + 旧版本 schema 自动迁移（migration 链）；损坏时提示并支持从导出备份恢复，**不静默清空** |
| 体积约束 | 目标 < 1MB（远低于 localStorage 5MB 上限）；图片永不入档（只存引用） |

## 13.3 关卡管理（core/level-manager.ts）

每游戏 50 关，顺序解锁（通过第 n 关解锁第 n+1）；关卡选择页显示星级/最佳用时。

## 13.4 设置（core/settings.ts）

全局设置项：**语言（locale，中/英，切换立即生效）**、音效开关、限时策略（关闭/竞赛/防沉迷 + 时长）、AI Provider 配置（provider/baseURL/model/key）。设置并入存档单一 key，经 settings.ts 统一读写。

## 13.5 多语言（i18n）

**范围边界**：i18n 覆盖**平台 UI 文案**（菜单/按钮/提示/结算/设置等）；游戏内容（英文词库、拼音词库、关卡字符）是玩法数据，**不随语言切换**。豁免口径（M6.6 复核定稿）：AI 提示词（发往 Provider 的指令文本，与 UI 语言解耦）、manifest 元数据（静态 JSON）、错误消息与 console 诊断日志不属于 UI 文案，不要求 key 化。

**结构**：

```
src/i18n/
├── zh-CN.ts        # 中文语言包（默认语言）
├── en-US.ts        # 英文语言包（与 zh-CN 键位 1:1）
└── index.ts        # vue-i18n 装配 + SUPPORTED_LOCALES + LOCALE_OPTIONS（单一出处）
```

**行为**：

- 切换入口：个人设置页语言下拉；写入 `settings.locale`，**立即生效**（不需重启/重载存档）
- 默认 zh-CN；非法/缺失值回退 zh-CN
- vue-i18n legacy: false（Composition API，`t()`）

**同功能同描述同出处（强制）**：同一功能、同一词义的文案必须使用同一个 i18n key——跨页面复用的通用文案置于 `common` 段（common.confirm / common.cancel / common.back…），**禁止在多个业务段重复定义同名同值键**；同一键的双语值语义必须一致。守卫测试强制（测试规范 §3.4）。

**翻译齐备守卫（发布门禁）**：zh-CN ↔ en-US 键位双向 1:1、无空值（空 = 未翻译）、SUPPORTED_LOCALES ↔ 语言包注册一致、LOCALE_OPTIONS ↔ SUPPORTED_LOCALES 一致、无跨段同名同值重复键。`npm run check:i18n` + Vitest 守卫测试双保险，纳入 release 流水线（与覆盖率并列双门禁）。

**新增语言（仅加不改三步）**：① 新增 `src/i18n/<locale>.ts`（键位与 zh-CN 1:1，守卫强制）；② `index.ts` 的 SUPPORTED_LOCALES 与 LOCALE_OPTIONS 各加一项；③ 守卫测试自动覆盖新包。禁止任何硬编码语言分支（`if locale === ...`）。

# 14. AI 能力架构

## 14.1 定位与边界

AI 是**可选增强**而非依赖：唯一用例 = 拼图切块建议。未配置/失败时全功能可用（本地算法兜底）。

## 14.2 Provider 抽象（ai/）

```ts
interface CutSuggestionProvider {
  id: 'qwen' | 'glm' | 'custom'
  requestCutSuggestion(image: ImageSource, timeoutMs: number): Promise<CutSuggestionJSON>
}
```

- OpenAI 兼容 HTTP 调用（fetch + AbortController 超时）
- 预设 Qwen（DashScope）/ GLM（智谱）；自定义 base URL 扩展预留

## 14.3 配置与安全

- Key / Base URL / 模型名存 localStorage，仅设置页可改；**不硬编码、不入仓库**
- 导出存档时 AI Key 字段默认脱敏，用户显式勾选才包含
- 网络传输仅发生在用户主动触发 AI 建议时；传输内容 = 图片数据 + 切块建议请求

## 14.4 降级链（强制顺序）

```
AI 请求 → 成功 → 规范化器 → 合法 → 应用
                     ↓ 不合法
              降级本地算法（非阻断提示）
AI 请求 → 失败/超时/未配置 → 降级本地算法（非阻断提示）
```

## 14.5 输出规范化器（engines/jigsaw-cutter）

AI 返回 JSON 统一经本地规范化器：schema 校验（行列划分 + 每块权重结构）→ 合法化（数值钳制、网格对齐）→ 块唯一性校验。**任何不合法输出不得直接应用**。

> **M5 实施口径**（2026-09-06 落地）：
>
> - **模块落点**：`src/ai/provider.ts`（Provider 层「HTTP 进文本出」：PROVIDER_PRESETS 预设 qwen = DashScope compatible-mode + qwen-vl-max、glm = bigmodel `api/paas/v4` + **glm-5.3**（开发计划模型口径）、custom 留空；`resolveProviderConfig` 显式填写优先于预设；`createSuggestionProvider` → POST `{baseURL}/chat/completions` + Bearer 鉴权 + AbortController 超时中断；ProviderError 四分类 timeout / network / http-error / no-content；**不解析 JSON，解析归引擎层**）+ `src/ai/suggest.ts`（降级编排 `suggestCutPlan`：本地算法先算恒为兜底与对比基准；三态九分支同 §14.4——applied / rejected(invalid-json、invalid-schema、low-quality，其中 low-quality = AI 方案 minScore 低于本地基准时对比择优拒绝) / fallback(not-configured、timeout、network、http-error、no-content)，rejected 与 fallback 均携带本地 plan；非 ProviderError 意外错误上抛不吞；DEFAULT_TIMEOUT_MS = 30s）+ `engines/jigsaw-cutter/suggest.ts`（§14.5 规范化器，见下）
> - **规范化器四步**：parseSuggestionText（剥 markdown 围栏 + isPlainObject）→ normalizeSuggestion（rows/cols 整数 [2,12] **严格拒绝而非钳制**——钳制破坏权重与行列数的对应；权重长度严格匹配；0/负值/非数字拒，WEIGHT_FLOOR = 0.01 抬底后归一化和为 1）→ weightsToLines（cumsum 等分 + **Math.round 网格对齐 + 单调递增钳制**，问题汇总 P4-03 实证）→ createCutPlanFromSuggestion（建议线替换 buildAxisLines，复用 buildTabSpecs / assemblePieces / ensureUniqueness 闭环，与本地算法完全同源下游）
> - **建议持久化**：JigsawSchemeParams.suggestion 只存归一化权重（rows/cols 在参数主体），save 端校验有限正数 + 长度匹配；方案网格阶梯进阶后长度不符自动回退本地算法（建议只影响方案起步切法）
> - **UI 接线**：设置页 AI 配置区（M5.2：关闭开关 = 移除存档 ai 段；导出脱敏）+ 切块工作流 AI 建议按钮（M5.5：内置图 data URI / 自定义图 IndexedDB blob → data URL 双路径；建议生效回填网格并以非均匀线实时预览；手动改网格时建议自动失效）

# 15. 数据与资产管理

## 15.1 数据形态总表

| 资产 | 形态 | 说明 |
|---|---|---|
| 关卡定义 | TS 模块（内嵌） | `createLevel(n)` 参数化生成，规避 file:// 下 fetch JSON 的 CORS 限制 |
| 英文词库 | TS 模块 | 分级词表（3 字母 → 8+ 字母），来源开源词表整理 |
| 拼音词库 | TS 模块 | `{word:'学校', pinyin:'xue xiao'}` 结构，常用字词分级 |
| 内置图库 | `assets/images/<专题>/` | M3 实施为确定性程序化生成 PNG（1024 源图仅绘制 + 192 分析缩略内嵌 `thumbs.ts`，`CREDITS.md` 标注，见 §15.3）；预留 CC0/CC-BY 收录位（≥1K，逐张标注） |
| 瓦片/sprite | `assets/tiles/<主题>/`、`assets/sprites/` | M4 实施为确定性程序化生成 PNG（gen-maze-assets.mjs：8 瓦片 + 96×128 hero 条带共 9 文件约 2.3KB，CREDITS.md 标注随 MIT）；运行时 paletteSkin 色板兜底（§12.3），CC0 收录位保留（M6 后增量） |
| 自定义图片 | FileReader 导入 → services/ 素材仓库 | 本地 IndexedDB 持久化（跨会话保留）；Web 二期服务端按用户隔离；不落仓库 |

## 15.2 词库规范

- 英文分级词表：按词长分级（3 → 8+ 字母）；来源开源词表整理，剔除专有名词与不适龄词
- 拼音词表：`{word, pinyin}` 结构；目标序列 = 去空格的拼音字母串（`'xue xiao'` → `xuexiao`）；常用字词分级（识字起步 → 常用词 → 扩展词）

## 15.3 内置图库合规

- **M3 实施口径**：内置图库由 `scripts/gen-gallery.mjs` 确定性程序化生成（离线环境无外网素材渠道与 WebP 编码依赖；1024 源图仅绘制 + 192 分析缩略内嵌 `thumbs.ts`（data URI 不触发 canvas taint），零第三方素材、输出恒定可复现，体积可控）；图库根目录 `CREDITS.md` 标注生成方式与许可（随项目 MIT 发布）
- 开源素材收录位保留（M6 扩充可选）：仅收 CC0 / CC-BY，≥1K 分辨率，每专题目录携带 `LICENSE.md` 逐张标注来源 URL 与许可类型
- 收录流程：开源素材 = 来源核验 → 许可与分辨率复核留痕 → 入库标注；程序化生成 = 种子化渲染 → 输出恒定（重跑可复现）

## 15.4 自定义导入

FileReader 读取 → 经 `services/` 素材仓库持久化（本地 IndexedDB，跨会话保留；Web 二期服务端按用户隔离）→ 使用时 blob 经 objectURL 加载为 Image（blob URL 同源不污染 canvas，可读像素做切块分析）。**切块方案仍只存算法参数与图片引用**（不复制图体）。本地模式切换设备不迁移图片（导出存档仅含方案参数，图需用户自带）；Web 二期随账号走。

# 16. 前端组件设计基线

## 16.1 页面范围（平台级）

| 页面/组件 | 职责 |
|---|---|
| 主菜单 | 三游戏入口 + 设置入口 |
| 关卡选择 | 50 关网格、锁定态、星级/最佳用时 |
| 游戏容器 | 挂载 GameInstance、暂停/继续/退出、计时显示 |
| 暂停 | 继续/重开/放弃/设置快捷入口 |
| 结算 | 用时/星级/最佳对比/下一关/重玩 |
| 设置 | 语言（中/英，立即生效）、音效、限时策略、AI Provider、存档导出导入 |
| 图片管理（拼图） | 导入图片、预切块工作流、方案列表与版本管理 |

## 16.2 状态管理（Pinia）

仅平台级状态建 store：`currentGame` / `levelProgress` / `settings` / `saveSnapshot`。游戏内部状态（拼图盘面、迷宫角色位置）留在 GameInstance 内部，**不进全局 store**。

## 16.3 前端工程规范

- 视图切换：轻量状态切换（是否引入 vue-router 在 M1 实施时定，倾向不引入）
- 组件命名 PascalCase；composable `use*.ts`；详见《代码规范》
- UI 原型：`documents/ui/` 预留（暂未创建，见该目录 README）

# 17. 测试基线

- **框架**：Vitest + @vue/test-utils；`tests/` **独立目录**，与 `src/` 分离
- **覆盖范围**：engines（切块算法、迷宫生成可复现性、词库）与 core（timer、save 迁移、level-manager）为单测重点；游戏组件做交互级组件测试；Canvas 渲染逻辑抽为纯函数（坐标计算/状态机）保证可测
- **覆盖率**：80% 硬门槛（发布脚本强制不达标即失败），目标 90%；engines ≥90%、core ≥85%
- **翻译齐备**：i18n 守卫测试（键位 1:1 / 空值 / 注册表一致 / 重复键，见测试规范 §3.4）+ `npm run check:i18n`，与覆盖率并列为发布双门禁
- 详见《LudoBurrow 测试规范文档》（权威）

# 18. 构建与发布设计

## 18.1 构建配置要点

- `base: './'`（相对路径，兼容任意子路径部署与 file://）
- `vite-plugin-singlefile`：IIFE 单文件输出，JS/CSS 内联
- 图片不内联（体积），走 `assets/` 相对路径
- 构建命令内嵌类型检查（vue-tsc）

## 18.2 发布产物

```
LudoBurrow-vX.Y.Z/
├── index.html
└── assets/images/…（+ tiles/sprite）
```

打包 zip 附 GitHub Release；产物不含测试代码与 node_modules。

## 18.3 发布流水线

`npm run release` = 类型检查 → 全量测试 → 覆盖率达标 → **翻译齐备校验** → 构建 → 产物校验（单文件/无外链/相对路径）→ 打包。详见《LudoBurrow 部署规范》（权威）。

# 19. 迭代分期规划

## 19.1 一期（M1-M6，本地优先 + Web 框架预留）

一期全部具体功能落地，**不延后、不跳过**：

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1 平台骨架 | core 全部 + 主菜单/关卡选择/存档 + **i18n 基建（中英）+ 运行环境适配层（LocalAdapter）** + file:// 与在线双模式跑通 | 存档往返、计时准确、语言切换生效、适配层接口就绪 |
| M2 键盘游戏 | 四模式 + 50 关 + 虚拟键盘 UI | 全模式可玩 |
| M3 拼图 | 本地切块引擎 + 布局 + 吸附/校验/放弃/帮助 + 切块方案管理 + **自定义素材本地持久化** + **内置图库齐备（每专题 ≥5 张）** | 50 关可玩，回滚进度隔离正确，素材合规标注完整 |
| M4 迷宫 | 生成器 + 2 主题 + 像素小人 | 50 关可玩 |
| M5 AI 增强 | Qwen/GLM Provider + 切块建议 + 降级链 | AI 建议可用，离线不受影响 |
| M6 打磨 | PWA 落地、图库复核扩充、发布流水线（含翻译齐备门禁） | 覆盖率 ≥80% + 翻译齐备，release 产物验证 |

任务分解、AI 辅助开发工作流、验收标准明细（F-/NF-/Q- 编号）见《LudoBurrow 开发计划文档》（权威）。

## 19.2 二期框架（Web 端登录与素材隔离，一期预留）

**目标**：Web 端支持用户登录；用户上传的自定义素材按用户隔离；除登录与素材隔离外，Web 端与本地端行为完全一致。本地端永不需要登录、素材不隔离。

**一期已预留（防大改）**：

- `services/` 适配层：`EnvAdapter`（auth + assetRepo 两接口）与 LocalAdapter 全量实现，业务代码全部经适配层访问（§7.4）
- 存档/设置/AI 配置等其余能力两模式共享同一实现（localStorage），无分叉

**二期任务草案（实施时另立开发计划）**：服务端技术选型与实现（登录/会话 + 素材 REST + 按用户隔离存储）→ WebAdapter 实现 → 登录页/登出/会话过期处理 → 构建产物 Web 模式装配 → 双端一致性回归（除登录与素材隔离外零差异）。

**明确不做（二期也不做）**：云存档/进度同步、在线排行、多人对战。

# 20. 开源协议与合规说明

| 类别 | 组件 | 协议 |
|---|---|---|
| 框架 | Vue 3 / Pinia / Vite | MIT |
| 语言/类型 | TypeScript | Apache-2.0 |
| 测试 | Vitest / @vue/test-utils / happy-dom | MIT |
| 构建 | vite-plugin-singlefile | MIT（以 M1 锁定版本为准复核） |
| 素材 | Kenney / OpenGameArt / Wikimedia Commons | CC0 / CC-BY（逐张标注） |

**重点合规关注**：

- CC-BY 素材必须按署名要求在专题 LICENSE.md 中标注作者与链接
- 商业 IP（汪汪队、奥特曼等）**不进仓库、不进内置图库、不随 Release 分发**；仅用户自定义导入本地使用
- 代码以 MIT 发布（仓库 LICENSE）

# 21. 非功能性要求

| 维度 | 要求 |
|---|---|
| 性能 | 拼图拖拽、迷宫移动交互流畅（目标 60fps）；50 关最高难度下切块计算 < 2s |
| 包体积 | 核心 zip 合理可控：内置图库程序化生成体积恒定（M6.1 扩至 24 张实测约 870KB，实施口径见 §15.3）+ 迷宫瓦片/sprite 程序化生成（M4 实测 9 文件约 2.3KB，见 §12.3/§12.4）+ PWA 产物轻量（manifest/sw.js/程序化图标，M6.2）。「按需分专题包」调整为：图库目录专题化**全量随包**（zip 下载即玩、50 关全可玩，体积恒定），在线版以 SW 按需缓存等价实现（部署规范 §5.3） |
| 可靠性 | 存档损坏可提示恢复；AI 失败自动降级；图片加载失败占位提示不崩溃 |
| 可维护性 | engines 纯逻辑可单测；新游戏零侵入接入；文档与代码同步 |
| 隐私 | 用户图片与 AI Key 仅存本机；除用户主动触发的 AI 请求外无任何网络传输 |

# 22. 技术风险与对策

| # | 风险 | 对策 |
|---|---|---|
| R-01 | file:// 各浏览器行为差异 | M1 即建立浏览器矩阵冒烟（Chrome/Edge/Firefox），此后每里程碑回归 |
| R-02 | 1K 图片本地包体积大 | 内置图库程序化生成（体积恒定可控，M3.9/M6.1 实施口径见 §15.3，24 张约 870KB 全量随包）+ 在线版 SW 按需缓存（部署规范 §5.3） |
| R-03 | 切块算法产生歧义块 | 块唯一性评分（颜色方差/边缘特征）低于阈值自动调整切割线；AI 建议同样过此校验 |
| R-04 | 视觉 AI 返回不合法切割建议 | Provider 输出统一走本地规范化器（schema 校验 + 合法化），无效则降级 |
| R-05 | localStorage 容量/清空 | 存档 < 1MB 设计；导出备份；损坏提示恢复不静默清空 |
| R-06 | 拼图拖拽/迷宫渲染性能 | Canvas 分层渲染、rAF 节流、坐标计算纯函数化（可 profile 优化） |
| R-07 | 一期框架预留不足，二期 Web 接入大改 | 分叉点（登录/素材仓库）一期即收拢 services/ 适配层并以 LocalAdapter 全量验证抽象 |
| R-08 | 翻译漂移 / 口径不一（同文案多 key） | 同功能同描述同出处 + 守卫测试（键位 1:1/空值/重复键）+ 发布翻译齐备门禁 |

# 23. 技术结论

1. **纯前端静态单页 + 单文件 IIFE 构建**是同时满足「免安装 + 在线部署」两目标的唯一简洁路径，技术风险集中在 file:// 兼容性，M1 前置验证消化。
2. **GameModule 插件接口 + core 内核**实现游戏与平台解耦，扩展成本 = 一个目录 + 一行注册。
3. **参数 + 种子确定性生成**消灭关卡配置文件，同时换来可复现与可测试性。
4. **切块引擎以「线条颜色关联 + 块唯一性校验」为品质底线**，AI 仅作建议源且全程可降级，离线体验完整。
5. **合规边界清晰**：内置 CC0/CC-BY + 商业 IP 仅本地导入，代码 MIT，无版权灰色地带。
6. **双端演进安全**：本地与 Web 的全部分叉点（登录态/自定义素材）一期收拢到 services/ 适配层并以 LocalAdapter 全量验证，二期 Web 接入 = 新增一个 WebAdapter，业务代码零改动。
7. **多语言即门禁**：中/英双语随一期落地，翻译齐备（键位 1:1/无空值/同出处）与覆盖率并列为发布双门禁，保障开发口碑。
