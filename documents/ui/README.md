# UI 原型目录

LudoBurrow 平台级页面的单文件 HTML 原型（视觉与交互基准），2026-09-06 建立首批六页，与 v1.1.0 实现对齐。

## 原型清单

| 文件 | 页面 | 对齐实现 |
|------|------|----------|
| `LudoBurrow-main-menu.html` | 主菜单（三游戏入口 + 设置） | `src/components/MainMenu.vue` |
| `LudoBurrow-level-select.html` | 关卡选择（专题页签 + 关卡网格） | `src/components/LevelSelect.vue` |
| `LudoBurrow-pause.html` | 暂停浮层（继续 / 重玩本关 / 退出关卡） | `src/components/PauseOverlay.vue` + `GameContainer.vue` |
| `LudoBurrow-settle.html` | 结算浮层（星级 / 用时 / 新纪录 / 下一关） | `src/components/SettlePanel.vue` + `GameContainer.vue` |
| `LudoBurrow-settings.html` | 设置（语言 / 限时策略 / AI 增强 / 词汇表 / 存档备份） | `src/components/SettingsPanel.vue` |
| `LudoBurrow-scheme-manager.html` | 拼图方案管理（方案卡列表 + 新建/调整面板） | `src/components/SchemeManager.vue` |

## 命名格式

`LudoBurrow-<页面或主题>.html`（游戏内画面如拼图盘面、迷宫画布属组件级，暂无原型，按需增补）

## 使用约定

- 每页原型自包含：设计 token（与 `src/style.css` `:root` 单一出处同源）+ 组件 scoped 样式同源副本 + `data-*` 测试锚点属性，双击即可在浏览器查看
- 实现页面须与原型对齐；后续实现调整视觉时**同步回写原型**，保持两端口径一致
- 文案以 `src/i18n/zh-CN.ts` 为权威（原型内为静态示意值）
- UI 样式规范文档（颜色/字号/组件视觉的系统化整理）待后续需要时在 `documents/design/` 下补建
