# CLAUDE.md

本文件为**跨工具通用项目规则**（非 Claude Code 专用）：任何在本仓库工作的 AI 编码工具 / IDE（Claude Code、Qoder 等）均应遵循此处的架构约束、开发命令、发布原则与审核标准。文件名沿用 `CLAUDE.md` 仅为历史兼容。**本文件是项目规则的唯一权威载体，后续任何规则调整均直接更新本文件，不新建 / 不迁移到其它 IDE 原生规则文件。**

> **职责分工（2026-09-05 建立）**：本文件只保留 AI 工作必需的规则、约束与命令；与规范文档重复的技术细节已下沉，规范文档为对应领域的权威载体——
> - 架构 / 技术选型 / 模块职责 / GameModule 插件体系 / 三游戏设计 / AI 能力 / 数据资产 → 《LudoBurrow 技术架构说明文档》（权威来源）
> - 编码规范 / git commit 格式 / 资产规范 / 多语言文案规范 → 《LudoBurrow 代码规范》
> - 测试命令 / 覆盖率门禁 → 《LudoBurrow 测试规范文档》
> - 发布产物 / 发布流水线 / 在线部署 → 《LudoBurrow 部署规范》
> - 里程碑 M1-M6 / AI 辅助开发工作流（superpowers + ecc Skills × glm 5.3）/ 验收标准 → 《LudoBurrow 开发计划文档》
>
> 规则类内容（发布原则、文档审核标准、能力边界）以本文件为权威，不外迁。

## Project Overview

LudoBurrow（ludo = 拉丁语「玩」+ burrow = 「洞穴、庇护所」）是一个 PC 端益智游戏平台：**纯前端静态应用，免安装、本地优先**——双击 `index.html` 即玩（file:// 协议），同一产物可直接部署网页在线访问。无后端、无数据库、无运行时依赖。

| 游戏 | 玩法核心 | 关卡 |
|---|---|---|
| 键盘按键 | 看字符按键：随机字母数字 / 英文单词 / 中文拼音 | 50 |
| 拼图 | 类线下拼图：切块、吸附、试错、校验（可选 AI 增强切块） | 50 |
| 迷宫 | 方向键/WASD 控制像素小人走迷宫 | 50 |

**当前状态（2026-09-06）**：一期（M1-M6）全部完成并发布 v1.0.0——三游戏各 50 关 / 拼图切块引擎 + 方案管理 + AI 切块建议（全降级链）/ 中英双语 / 图库 24 张 / PWA / release 8 步流水线；终版门禁：481 tests、coverage 95.08%。二期（Web 登录与素材隔离）框架已预留。里程碑明细见《LudoBurrow 开发计划文档》。

**核心约束（贯穿全部设计）**：

- **免安装**：本地 file:// 双击即玩，本地优先
- **轻便**：一期本地为纯前端静态产物（无后端、无数据库）；二期 Web 端仅增加「用户登录 + 自定义素材隔离」服务端，其余与本地端完全一致
- **扩展性**：游戏插件化（GameModule 统一接口），新增游戏零侵入
- **开源合规**：内置图库全部 CC0/CC-BY；商业 IP 图片仅通过「自定义导入」由用户本地加载，不分发、不出本机
- **多语言**：UI 中/英双语（个人设置切换，立即生效），语言框架可扩展；游戏内容（词库/关卡）不随语言切换

**分期边界（2026-09-05 修订，v1.1）**：

- **一期（M1-M6，本地优先）**：全部具体功能落地，不延后不跳过——三游戏各 50 关、拼图切块引擎与方案管理、多语言中英、内置图库齐备（每专题 ≥5 张 CC0/CC-BY）、PWA、发布流水线。**Web 端以「运行环境适配层」保留框架**：登录态与自定义素材仓库两个抽象接口 + LocalAdapter 全量实现，不实现服务端
- **二期（框架一期已预留，避免大改动）**：Web 端用户登录 + 自定义素材用户隔离（WebAdapter 对接服务端）；本地端永不需要登录、素材不隔离；除登录与素材隔离外，Web 端与本地端行为完全一致

## Architecture

纯前端单页应用（Vite + TypeScript + Vue 3 + Pinia + Canvas 2D）：

```
src/
├── core/                    # 平台内核（游戏无关）
│   ├── game-registry.ts     #   游戏注册表：GameModule 在此注册即接入
│   ├── level-manager.ts     #   50 关序列、顺序解锁
│   ├── timer.ts             #   正计时 + 可选上限（竞赛/防沉迷）
│   ├── save.ts              #   存档：localStorage + JSON 导入导出 + 版本迁移
│   └── settings.ts          #   全局设置（AI Provider 配置、限时策略）
├── games/                   # 游戏模块（插件式）
│   ├── keygame/
│   ├── jigsaw/
│   └── maze/
├── engines/                 # 可复用引擎（纯逻辑，无 UI，可单测）
│   ├── jigsaw-cutter/       #   切块引擎：本地梯度算法 + AI Provider 接口
│   ├── maze-generator/      #   迷宫生成（种子随机可复现）
│   └── wordbank/            #   词库：数字/字母/英文分级词/中文拼音词表
├── components/              # 平台级 UI（主菜单/关卡选择/暂停/结算/设置）
├── assets/                  # 内置 CC0 图库（按专题分目录）、瓦片皮肤、sprite
├── ai/                      # AI Provider：Qwen/GLM 预设 + 自定义 OpenAI 兼容端点
├── i18n/                    # 多语言：zh-CN/en-US 语言包 + SUPPORTED_LOCALES 注册表
└── services/                # 运行环境适配层：登录态 + 自定义素材仓库（LocalAdapter 一期 / WebAdapter 二期）
```

- **依赖方向**：`components / games → core`，`games → engines`，`components/games → services / i18n`；engines 与 core **不依赖 Vue**、不反向依赖 games。禁止反向依赖。
- **GameModule 插件接口（扩展性核心）**：`{ id, name, icon, createLevel(n), mount(container, level, hooks) }`——新游戏 = 新建 `games/xxx/` 目录 + 注册一行，平台的计时、存档、关卡管理、限时策略自动生效（详见技术架构 §8）。
- **数据流**：`LevelConfig(参数+种子，确定性生成) → GameInstance 挂载渲染 → 用户操作 → 完成/放弃 → 结算（用时、星级）→ save 写入 → 解锁下一关`。

## 关键架构约束（AI 必须遵守）

- **file:// 兼容**：构建产物为 **vite-plugin-singlefile 产出的单文件 IIFE index.html**（JS/CSS 全内联）；1K+ 图片以相对路径放 `assets/` 随包分发，不内联。任何运行时依赖（关卡定义、词库）一律走 **TS 模块内嵌**，**禁止运行时 fetch 本地 JSON**（file:// 下被 CORS 阻止）。
- **确定性生成**：所有关卡由「参数 + 种子」程序化生成（mulberry32 PRNG），同关卡每次打开内容一致；150 个关卡无手工配置文件。
- **engines 纯逻辑**：切块算法、迷宫生成、词库全部为无 UI 的纯 TS 模块；Canvas 渲染逻辑（坐标计算/状态机）抽为纯函数，保证可单测。
- **存档健壮性**：localStorage 单一 key `ludoburrow/save`，带 schema version + migration 链；损坏时提示并支持从导出备份恢复，**不静默清空**。
- **拼图方案版本隔离**：每个切块方案是独立版本，各自挂独立游戏进度，互不删除；切换方案 = 切换存档槽。
- **AI 降级链**：AI 调用失败、超时、未配置时自动降级本地算法，功能不中断；AI 返回建议必须经本地规范化器（schema 校验 + 合法化）+ 块唯一性校验。
- **运行环境适配层（Web 框架预留，防二期大改）**：登录态与自定义素材仓库**一律经 `services/` 适配接口访问**（LocalAdapter 一期全量实现：无登录匿名单用户 + IndexedDB 素材仓库；WebAdapter 二期对接服务端）；业务代码禁止绕过适配层直连 IndexedDB / 远端 API 实现这两类能力。本地端无登录、素材不隔离；Web 端除登录与素材隔离外与本地端完全一致
- **多语言（i18n）**：UI 文案一律 i18n key（`t()`），禁止硬编码；zh-CN/en-US 键位 1:1；**同功能同描述同出处**（同一文案一个 key，跨页面复用置 `common` 段）；新增语言「仅加不改」；发布前翻译齐备校验强制（见发布原则 #4）
- **资产合规**：内置图库仅 CC0/CC-BY（≥1K 分辨率）并按专题标注 LICENSE；自定义导入走 FileReader 本地读取，**不产生网络传输、不入仓库**。

## Development Commands

> 命令集已全部落地（M1.11），与《测试规范文档》§七、《部署规范》§三 一致。

```bash
npm install                # 安装依赖
npm run dev                # Vite 开发服务器
npm run typecheck          # vue-tsc --noEmit（期望 0 errors）
npm run test               # vitest run（全量测试）
npm run test:coverage      # vitest run --coverage（覆盖率报告）
npm run check:i18n         # 翻译齐备校验（zh↔en 键位 1:1 / 空值 / 注册表一致性）
npm run build              # 类型检查 + 单文件构建（dist/）
npm run release            # 发布门禁全量 8 步：typecheck → test → 覆盖率 ≥80% → 翻译齐备 → build → 产物校验（含 PWA）→ zip+SHA-256 → 发布收尾（Release 模板 + git tag 检查）
```

## 发布原则（Production Release Principle）

**核心原则：必须无问题上发布（No issues to production）**

发布新版本（Release zip / 在线部署）前必须满足以下全部条件，**缺一不可，不得带病发布**：

1. **类型检查全过**：`vue-tsc --noEmit` 必须 0 错误；禁止 `as any` 掩盖类型错误。
2. **测试全过**：vitest 全部通过，0 failed / 0 skipped。
3. **覆盖率达标**：整体 ≥80%（硬门槛，`npm run release` 强制不达标即失败）；engines ≥90%、core ≥85%。覆盖率是下限不是免测额度，业务场景清单法逐节点核对（见测试规范 §1.4）。
4. **翻译齐备（强制，开发口碑保障线）**：zh-CN/en-US 语言包键位 1:1 镜像、无空值、`SUPPORTED_LOCALES`/语言选项与语言包注册一致、无跨段同名同值重复键、UI 无硬编码文案——`npm run check:i18n` + i18n 守卫测试全过并纳入 release 流水线。与覆盖率同为发布双门禁，缺一不可。
5. **构建成功 + 产物校验**：`dist/index.html` 为单文件（JS/CSS 内联、无外链 script/link）、`assets/` 相对路径引用齐全、产物含 LICENSE / THIRD-PARTY-NOTICES / assets CREDITS 许可文件（verify-dist 第 7 步自动校验）、双击 file:// 可玩。
6. **无死代码**：未使用的 import / 变量 / 函数必须删除（noUnusedLocals / noUnusedParameters 不可禁用）。
7. **类型不撒谎**：runtime 行为与 TS 类型签名一致；不一致时修正类型或实现。
8. **浏览器矩阵冒烟**：Chrome / Edge / Firefox 三浏览器 file:// 双击 + 在线部署各冒烟一轮（主流程：进游戏→过关→存档→重开恢复 + 中英切换）。
9. **版本迭代记录（强制）**：每次发布必须在 `README.md §版本迭代` 表新增一行：版本号、日期、类型、摘要、修改人。未更新版本迭代表的发布视为流程违规。

**禁止行为**：

- 禁止跳过 vue-tsc / vitest / 覆盖率门禁
- 禁止发布产物中外链 JS/CSS（破坏 file:// 单文件承诺）
- 禁止在 src 中硬编码任何 API Key / 密钥
- 禁止引入后端、数据库或网络运行时依赖（违背「轻便/免安装」核心约束）
- 禁止在内置图库混入非 CC0/CC-BY 素材（商业 IP 仅用户自定义导入）
- 禁止 UI 硬编码中英文文案（必须走 i18n key，纳入翻译齐备门禁）
- 禁止保留"pre-existing issue"借口（发现的问题必须修复或显式决策后才能发布）

**遇到问题的处理流程**：优先修代码（生产代码 > 测试代码 > 文档）→ 修复后回归（typecheck + 全量测试）→ 文档同步更新 → 真正的决策点才中断请用户决策。

## Key Conventions

- **Git commits**: `<type>: <description in Chinese> yyyymmdd by castle`（types: feat/fix/refactor/docs/test/chore）——详见代码规范 §八。
- **命名与结构**、**Vue/TS 编码模式**、**Canvas 规范**、**资产规范** → 详见《LudoBurrow 代码规范》。
- **多语言口径（同功能同描述同出处）**：同一功能、同一词义的文案必须使用同一个 i18n key（单一出处，跨页面复用置于 `common` 段），禁止多段重复定义同名同值键；守卫测试强制（见代码规范 §十一、测试规范 §3.4）。
- **AI 辅助开发工作流**：需求澄清 → 计划 → TDD → 验证 → 审查的 Skill 工作流（superpowers + ecc，模型 glm 5.3）→ 详见《LudoBurrow 开发计划文档》§二；**声称完成前必须实际运行验证命令**（superpowers:verification-before-completion 纪律）。

## 能力边界（防擅自加戏）

**不做规划（远期或独立需求，未经用户决策不得实施）**：

- 移动端 / 触屏适配（PC 优先，键盘 + 鼠标交互）
- 中/英之外的语言包（i18n 框架已留，具体语言按需立项）
- 云存档 / 进度同步、在线排行榜 / 多人对战
- 内置商业 IP 素材（汪汪队、奥特曼等仅用户自定义导入）
- Web 服务端技术选型与实现（属二期；一期仅保留适配层框架）

已排期能力（一期已全部落地）：i18n 中英 + 适配层框架（M1 ✅）、自定义素材本地持久化（M3 ✅）、PWA（M6.2 ✅）；二期排期：Web 端登录与素材隔离（适配层框架一期已预留）、音效系统（一期开关已随存档 schema v3 移除，开发计划 §四之二 W-5）、迷宫后续主题包（内容扩充）。

## Documentation

Architecture and design docs in Chinese are in `documents/design/`：

| Document | Content |
|---|---|
| `LudoBurrow 技术架构说明文档.md` | Full technical architecture（authoritative source）：技术选型 / 模块设计 / GameModule 插件体系 / 三游戏设计 / AI 能力 / 数据资产 / 构建发布 |
| `LudoBurrow 架构说明（正式版）.md` | Formal architecture for project review（精简口径） |
| `LudoBurrow 代码规范.md` | Coding standards（TypeScript / Vue 3 / Canvas / 资产）+ git commit 格式 |
| `LudoBurrow 测试规范文档.md` | Testing strategy and standards（Vitest + 覆盖率门禁 + 浏览器冒烟） |
| `LudoBurrow 部署规范.md` | 发布产物 / 发布流水线 / 在线部署 / 版本回滚 |
| `LudoBurrow 开发计划文档.md` | 里程碑 M1-M6 / AI 辅助开发工作流（superpowers + ecc × glm 5.3）/ 验收标准 / 质量门禁 / 风险 |
| `LudoBurrow 问题汇总明细.md` | 开发避坑指南（每条现象/根因/解决/参考四段式，随开发累积） |
| `documents/ui/` | UI 原型目录（暂未创建，见该目录 README） |
| `documents/bug/` | BUG 修复文档目录（命名规范见该目录 README） |
| 本文件 §文档审核标准 | 文档审核规则 |

## 文档审核标准

当用户要求"文档审核"或"一致性校验"时，除原有审核维度（口径一致、规范详尽）外，必须额外遵守以下两条规则。

### 规则一：配置/交互闭环校验

每个涉及自定义配置或跨模块交互的环节，必须验证**定义端 → 传递链 → 消费端**全链路闭环。不能出现：类型定义了字段但组件未消费、store 写入了状态但界面不反映、LevelConfig 生成了参数但游戏实例不读取等情况。

**校验清单**：

- **每个导出的类型/接口字段** → 是否有消费方实际读取（props/emits/store getter）
- **store 的每个 state/getter/action** → 组件是否实际使用；写入点与读取点是否闭环
- **LevelConfig 的每个参数** → `createLevel` 是否生成 → `mount` 是否消费
- **存档 schema 的每个字段** → 写入点 → 迁移链 → 读取点是否一致
- **设置项的每个键** → 设置页 UI → settings.ts → 消费模块是否贯通
- **AI Provider 配置**（key/baseURL/model）→ 设置页 → localStorage → ai/ 调用链

**典型问题示例**：

| 问题类型 | 现象 | 闭环断点 |
|---------|------|----------|
| 类型字段未消费 | `LevelConfig` 定义 `timeLimitMs` 但游戏实例从不读 | 定义端 → 消费端断 |
| store 状态无消费 | Pinia store 写入 `currentLevel` 但关卡页自管状态 | 传递链 → 消费端断 |
| 设置项无效 | 设置页提供音效开关但 audio 模块不读取 | 定义端 → 消费端断 |

### 规则二：每轮审核独立开始

每次文档审核都是独立的全新开始。不得沿用历史审核的记忆、结论或"已通过"假设。所有交叉校验必须从头执行，避免惯性遗漏。即使某项在上一轮确认通过，本轮也必须重新验证。

**执行要点**：

1. **不依赖历史报告**：不引用上一轮审核的结论，所有数字、测试数必须重新实测
2. **全量校验**：不抽样，每个交叉点都要验证
3. **工具实测**：用 grep、vitest、代码读取等工具确认，不凭记忆判断

**独立审核检查表**：

- [ ] 所有版本号、测试数等数字通过 grep/vitest 实测重新确认
- [ ] 所有代码引用路径通过 Read 或 Grep 验证存在
- [ ] 所有文档间引用路径正确（含本文件 §Documentation 表）
- [ ] 不假设"上次已通过，这次应该没问题"

### 审核维度参考

| 维度 | 说明 |
|------|------|
| **口径一致** | 多份文档对同一事项的描述是否一致（关卡数、模块名、里程碑编号） |
| **规范详尽** | 是否覆盖必要细节（命令、配置、边界条件） |
| **引用有效** | 所有文档间引用路径是否正确 |
| **示例准确** | 代码示例、配置示例是否可运行 |
| **版本同步** | 文档中的版本号与 package.json 是否一致 |
