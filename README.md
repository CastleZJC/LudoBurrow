# LudoBurrow

> ludo（拉丁语「玩」）+ burrow（洞穴、庇护所）—— PC 端益智游戏平台

免安装、本地优先的纯前端益智游戏平台：双击 `index.html` 即玩，也可在线部署。内置三个游戏（各 50 关）：

- ⌨️ **键盘按键** — 随机字母数字 / 英文单词 / 中文拼音
- 🧩 **拼图** — 类线下拼图体验，智能切块（可选 AI 增强）
- 🌀 **迷宫** — 像素小人主题迷宫
- 🌐 **中/英双语** — 个人设置切换，语言框架可扩展

**当前状态（2026-09-05）**：设计定稿 **v1.1**（本地优先一期全量落地 + Web 端登录/素材隔离二期框架预留），代码未初始化——里程碑 M1（平台骨架）待启动，任务与验收见[开发计划文档](./documents/design/LudoBurrow%20%E5%BC%80%E5%8F%91%E8%AE%A1%E5%88%92%E6%96%87%E6%A1%A3.md)。

## 技术栈

Vite · TypeScript · Vue 3 · Pinia · vue-i18n · Canvas 2D · Vitest（版本 M1 脚手架锁定，见[代码规范 §十三](./documents/design/LudoBurrow%20%E4%BB%A3%E7%A0%81%E8%A7%84%E8%8C%83.md)）

## 目录结构（规划）

```
LudoBurrow/
├── CLAUDE.md               # 跨工具项目规则（AI 编码工具通用）
├── documents/
│   ├── design/             # 设计与规范文档（权威体系）
│   ├── ui/                 # UI 原型（预留，暂无文件）
│   └── bug/                # BUG 修复文档（随开发累积）
├── src/                    # 源码（M1 建立：core/games/engines/ai/i18n/services/components/assets）
└── tests/                  # 测试（M1 建立，与 src/ 分离）
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
| [LudoBurrow 开发计划文档](./documents/design/LudoBurrow%20%E5%BC%80%E5%8F%91%E8%AE%A1%E5%88%92%E6%96%87%E6%A1%A3.md) | 里程碑 M1-M6 / AI 辅助开发工作流（superpowers + ecc × glm 5.3）/ 验收与门禁 |
| [LudoBurrow 问题汇总明细](./documents/design/LudoBurrow%20%E9%97%AE%E9%A2%98%E6%B1%87%E6%80%BB%E6%98%8E%E7%BB%86.md) | 开发避坑指南（四段式，随开发累积） |
| [documents/ui/README.md](./documents/ui/README.md) | UI 原型目录说明（暂无文件） |
| [documents/bug/README.md](./documents/bug/README.md) | BUG 文档命名规范 |

## 版本迭代

> 每次发布（含 hotfix、迭代、配置类变更）必须在此表追加一行——详见 `CLAUDE.md §发布原则` 第 9 条。未更新版本迭代表的发布视为流程违规。

| 版本 | 日期 | 类型 | 摘要 | 修改人 |
|------|------|------|------|--------|
| v0.2.0 | 2026-09-05 | 设计修订 | 分期边界定稿：一期本地优先全量落地（多语言中英、图库每专题 ≥5 张、PWA、发布双门禁 = 覆盖率 + 翻译齐备）；二期 Web 登录与素材隔离（一期 services/ 适配层框架预留） | castle |
| v0.1.0 | 2026-09-05 | 基线发布 | 设计定稿 v1.0 + 规范文档体系建立（CLAUDE.md / documents/design 七篇 / ui·bug 目录） | castle |

## License

代码以 [MIT](./LICENSE) 发布；图片资产按各专题标注的 CC0/CC-BY 许可发布。
