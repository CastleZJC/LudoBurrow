# LudoBurrow

> ludo（拉丁语「玩」）+ burrow（洞穴、庇护所）—— PC 端益智游戏平台

**中文** | [English](./README_EN.md)

免安装、本地优先的纯前端益智游戏平台：**双击 [`play/index.html`](./play/index.html) 即玩**（仓库自带免安装成品，无需 Node / 服务器；根目录 `index.html` 是开发模板，不能直接双击），同一产物可直接在线部署。无后端、无数据库、无运行时依赖。

**游戏与能力**

- ⌨️ **键盘按键** — 看字符按键：随机字母数字 / 英文单词 / 中文拼音（四模式，各 50 关）
- 🧩 **拼图** — 类线下拼图体验：切块、吸附、试错、校验；智能切块可选 AI 增强（四专题 24 张图库，按方案动态关数）
- 🌀 **迷宫** — 像素小人主题迷宫（8 主题，50 关）
- 🌐 **中/英双语** — 个人设置切换，立即生效；游戏内容不随语言切换
- 📴 **PWA** — 在线版访问一次后离线可玩（本地 file:// 版不依赖）

**当前状态（2026-09-20 更新）**：一期（M1-M6）全部完成（v1.0.0 发布，验收返工迭代至 v1.1.0，后续验收成果随下版发布）；当前门禁：typecheck 0 错、589 tests、coverage 94.27%（branches 90.51%）、i18n 153 键。二期已排期（Web 登录与素材隔离 + iOS 移动端支持 + 横竖屏布局自适应），Web 分叉框架已预留。

## 技术栈

Vite · TypeScript · Vue 3 · Pinia · vue-i18n · Canvas 2D · Vitest（版本 M1 脚手架锁定，见[代码规范 §十三](./documents/design/LudoBurrow%20%E4%BB%A3%E7%A0%81%E8%A7%84%E8%8C%83.md)）

## 目录结构

```
LudoBurrow/
├── CLAUDE.md               # 跨工具项目规则（AI 编码工具通用）
├── documents/
│   ├── design/             # 设计与规范文档（权威体系；历史存档 历史存档/ 不入库）
│   ├── ui/                 # UI 原型（单文件交互式 HTML：五视图 + 暂停/结算浮层）
│   └── bug/                # BUG 修复文档（随开发累积）
├── play/                   # 免安装成品（双击 play/index.html 即玩；npm run play 重建）
├── public/                 # 静态资产（图库 4 专题 24 张 / 迷宫瓦片 8 主题 / sprite / 图标 / PWA 文件）
├── scripts/                # 构建校验与资产生成脚本（release / verify-dist / fetch-gallery 等）
├── src/                    # 源码（core/games/engines/ai/i18n/services/stores/components）
└── tests/                  # 测试（与 src/ 分离）
```

## 文档索引

| 文档 | 说明 |
|------|------|
| [CLAUDE.md](./CLAUDE.md) | 跨工具项目规则：架构约束 / 发布原则 / 能力边界 / 文档审核标准 |
| [LudoBurrow 技术架构说明文档](./documents/design/LudoBurrow%20%E6%8A%80%E6%9C%AF%E6%9E%B6%E6%9E%84%E8%AF%B4%E6%98%8E%E6%96%87%E6%A1%A3.md) | 技术架构（权威来源）：模块设计 / GameModule 插件体系 / 三游戏设计 / AI 能力 / 数据资产 |
| [LudoBurrow 架构说明（正式版）](./documents/design/LudoBurrow%20%E6%9E%B6%E6%9E%84%E8%AF%B4%E6%98%8E%EF%BC%88%E6%AD%A3%E5%BC%8F%E7%89%88%EF%BC%89.md) | 项目评审精简口径 |
| [LudoBurrow 代码规范](./documents/design/LudoBurrow%20%E4%BB%A3%E7%A0%81%E8%A7%84%E8%8C%83.md) | TypeScript / Vue 3 / Canvas / 资产规范 + Git 提交格式 |
| [LudoBurrow 测试规范文档](./documents/design/LudoBurrow%20%E6%B5%8B%E8%AF%95%E8%A7%84%E8%8C%83%E6%96%87%E6%A1%A3.md) | Vitest 策略 / 覆盖率门禁（整体 ≥80%）/ 浏览器冒烟矩阵 |
| [LudoBurrow 部署规范](./documents/design/LudoBurrow%20%E9%83%A8%E7%BD%B2%E8%A7%84%E8%8C%83.md) | 发布产物 / release 流水线 / 在线部署 / 版本回滚 |
| 《LudoBurrow 开发计划文档》（内部历史文档，已归档至 `documents/design/历史存档/`，不入库） | 里程碑 M1-M6 / AI 辅助开发工作流（superpowers + ecc × glm 5.3）/ 验收与门禁 |
| [LudoBurrow 问题汇总明细](./documents/design/LudoBurrow%20%E9%97%AE%E9%A2%98%E6%B1%87%E6%80%BB%E6%98%8E%E7%BB%86.md) | 开发避坑指南（四段式，随开发累积） |
| [documents/ui/README.md](./documents/ui/README.md) | UI 原型目录说明 + 单文件交互式原型（主菜单/选关/游戏/设置/方案管理 + 暂停/结算浮层） |
| [documents/bug/README.md](./documents/bug/README.md) | BUG 文档命名规范 |

## 版本迭代

> 每次发布（含 hotfix、迭代、配置类变更）必须在此表追加一行——详见 `CLAUDE.md §发布原则` 第 9 条。未更新版本迭代表的发布视为流程违规。2026-09-14 文档基线发布起重新计数，历史版本记录见 `documents/design/历史存档/`（不入库）。

| 版本 | 日期 | 类型 | 摘要 | 修改人 |
|------|------|------|------|--------|
| v1.1.0 | 2026-09-14 | 基线发布 | 文档基线：全量文档复核统一口径（实测门禁：typecheck 0 错 / 574 tests / coverage 94.25%（branches 90.48%）/ i18n 163 键）、README 增加英文版、设计文档建立历史存档（V1） | castle |

## License

代码以 [MIT](./LICENSE) 发布；内置图库（24 张 ≥1K 高清图）来源 Wikimedia Commons（CC0 / CC-BY / CC BY-SA / 公有领域）与 Openclipart（cartoon 专题，全站 CC0），由 `scripts/fetch-gallery.mjs` 获取、`public/assets/images/CREDITS.md` 逐张标注许可；迷宫瓦片/sprite 由 `scripts/gen-maze-assets.mjs`、PWA 图标由 `scripts/gen-pwa-icons.mjs` 程序化生成（随 MIT）。用户本地导入的版权图片（含 `documents/local/`，已被 .gitignore 忽略）永不入库、不分发。
