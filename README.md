# LudoBurrow

> ludo（拉丁语「玩」）+ burrow（洞穴、庇护所）—— PC 端益智游戏平台

免安装、本地优先的纯前端益智游戏平台：**双击 [`play/index.html`](./play/index.html) 即玩**（仓库自带免安装成品，无需 Node/服务器；根目录 `index.html` 是开发模板，不能直接双击），也可在线部署。内置三个游戏（键盘/迷宫各 50 关，拼图按专题方案动态）：

- ⌨️ **键盘按键** — 随机字母数字 / 英文单词 / 中文拼音
- 🧩 **拼图** — 类线下拼图体验，智能切块（可选 AI 增强）
- 🌀 **迷宫** — 像素小人主题迷宫
- 🌐 **中/英双语** — 个人设置切换，语言框架可扩展
- 📴 **PWA** — 在线版访问一次后离线可玩（本地 file:// 版不依赖）

**当前状态（2026-09-06）**：一期（M1-M6）完成并发布 v1.0.0，验收反馈三轮返工全部落地（v1.1.0 已发布一/二/三轮，三轮成果随下版发布）——键盘四模式独立进度、词序滚动与自适应布局 / 拼图先选专题、方案即关卡（动态关数）、24 张高清图库（彩色选图规则）、每图切块规格自动优选（六档互斥窗口）、块推出洗牌、半圆锯齿边缘、方案原位调整、本地图片批量导入自动建档 / 迷宫 8 主题、轨迹随机、瓦片 1024² 高清 / **免安装成品随仓库（`play/`，双击即玩）**；当前门禁：typecheck 0 错、551 tests、coverage 94.13%（branches 90.72%）、i18n 155 键。二期已排期（Web 登录与素材隔离 + iOS 移动端支持 + 横竖屏布局自适应；Web 分叉框架已预留），任务与验收见[开发计划文档](./documents/design/LudoBurrow%20E5%BC%80%E5%8F%91%E8%AE%A1%E5%88%92%E6%96%87%E6%A1%A3.md)。

## 技术栈

Vite · TypeScript · Vue 3 · Pinia · vue-i18n · Canvas 2D · Vitest（版本 M1 脚手架锁定，见[代码规范 §十三](./documents/design/LudoBurrow%20%E4%BB%A3%E7%A0%81%E8%A7%84%E8%8C%83.md)）

## 目录结构（规划）

```
LudoBurrow/
├── CLAUDE.md               # 跨工具项目规则（AI 编码工具通用）
├── documents/
│   ├── design/             # 设计与规范文档（权威体系）
│   ├── ui/                 # UI 原型（平台级页面六页，单文件 HTML）
│   └── bug/                # BUG 修复文档（随开发累积）
├── play/                   # 免安装成品（双击 play/index.html 即玩；npm run play 重建）
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
| [documents/ui/README.md](./documents/ui/README.md) | UI 原型目录说明 + 六页平台级页面原型（主菜单/选关/暂停/结算/设置/方案管理） |
| [documents/bug/README.md](./documents/bug/README.md) | BUG 文档命名规范 |

## 版本迭代

> 每次发布（含 hotfix、迭代、配置类变更）必须在此表追加一行——详见 `CLAUDE.md §发布原则` 第 9 条。未更新版本迭代表的发布视为流程违规。

| 版本 | 日期 | 类型 | 摘要 | 修改人 |
|------|------|------|------|--------|
| v1.1.0 | 2026-09-06 | 验收返工 | v1.0.0 验收反馈落地：键盘四模式独立进度（存档 v4）/ 拼图先选专题 + 方案即关卡（动态关数，存档 v6/v7）+ 24 张 ≥1K 真实照片图库（Commons，CREDITS 逐张标注）+ 每图切块规格自动优选（难度档窗口 + 内容评分 + 启动预热 + 占位兜底）+ 本地图片批量导入自动建档 + 五区三列布局 + 演示降速 / 迷宫 HUD 主题切换 + 轨迹随机 + 瓦片 1024² 高清 / **免安装 `play/` 随仓库（双击即玩）**；门禁：typecheck 0 错 / 549 tests / coverage 95.13%（branches 91.43%）/ i18n 145 键 / build 958.06 kB 单文件 / zip 47.69 MB（SHA-256 851E1EA3…6526CE4） | castle |
| v1.0.0 | 2026-09-06 | 正式发布 | 一期（M1-M6）全量落地：三游戏各 50 关 + 拼图切块引擎与方案管理 + AI 切块建议（Qwen/GLM + 全降级链）+ 中英双语（131 键）+ 图库 24 张 + PWA + release 8 步流水线；门禁：typecheck 0 错 / 481 tests / coverage 95.08%（branches 91.79%）/ build 362.87 kB 单文件 / zip 717.26 kB（SHA-256 7625345F…531E42） | castle |
| v0.2.0 | 2026-09-05 | 设计修订 | 分期边界定稿：一期本地优先全量落地（多语言中英、图库每专题 ≥5 张、PWA、发布双门禁 = 覆盖率 + 翻译齐备）；二期 Web 登录与素材隔离（一期 services/ 适配层框架预留） | castle |
| v0.1.0 | 2026-09-05 | 基线发布 | 设计定稿 v1.0 + 规范文档体系建立（CLAUDE.md / documents/design 七篇 / ui·bug 目录） | castle |

## License

代码以 [MIT](./LICENSE) 发布；内置图库（24 张 ≥1K 高清图）来源 Wikimedia Commons（CC0 / CC-BY / CC BY-SA / 公有领域）与 Openclipart（cartoon 专题，全站 CC0），由 `scripts/fetch-gallery.mjs` 获取、`public/assets/images/CREDITS.md` 逐张标注许可；迷宫瓦片/sprite 由 `scripts/gen-maze-assets.mjs`、PWA 图标由 `scripts/gen-pwa-icons.mjs` 程序化生成（随 MIT）。用户本地导入的版权图片（含 `documents/local/`，已被 .gitignore 忽略）永不入库不分发。
