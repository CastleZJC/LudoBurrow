# LudoBurrow 部署规范

> **文档名称**：LudoBurrow 部署规范（发布与分发）
> **基于文档**：《LudoBurrow 技术架构说明文档》§5.4/§18
>
> **修订记录**：
>
> | 版本 | 日期时间 | 修订性质 | 修订摘要 | 修改人 |
> |------|----------|----------|----------|--------|
> | V1.0 | 2026-09-05 19:40:00 | 初稿 | 发布产物形态 / 发布流水线 / 本地分发 / 在线部署 / 版本回滚 | castle |
> | V1.1 | 2026-09-05 21:20:00 | 设计修订 | 发布流水线新增第 4 步「翻译齐备门禁」，与覆盖率并列双门禁（开发口碑保障线） | castle |
>
> **适用范围**：LudoBurrow 全部版本发布（本地 Release zip 与在线部署；项目为纯前端静态应用，无服务器运维）

---

## 一、发布形态概述

LudoBurrow 是纯前端静态应用，"部署" = **发布产物 + 分发渠道**，无服务器、无服务进程、无数据库：

| 形态 | 渠道 | 说明 |
|---|---|---|
| 本地模式（主形态） | GitHub Release zip | 下载解压 → 双击 index.html（file://） |
| 在线模式 | GitHub Pages（默认）/ Vercel / 内网静态服务器 | 同一构建产物，零改动 |

## 二、发布产物

### 2.1 产物结构

```
LudoBurrow-vX.Y.Z/
├── index.html          # 单文件应用（JS/CSS 内联，IIFE；无外链 script/link）
└── assets/
    ├── images/         # 内置图库（按专题，WebP）
    └── tiles/ sprites/ # 瓦片与角色素材
```

### 2.2 产物命名与校验

- 目录与 zip 命名：`LudoBurrow-vX.Y.Z.zip`（语义化版本）
- Release 附 SHA-256 校验值（zip 文件级）
- **产物边界**：不含测试代码（tests/）、不含 node_modules/、不含开发配置（.env 等）；测试代码随 git 仓库正常发布（开发者需要）

### 2.3 产物校验清单（release 脚本自动 + 人工抽查）

- [ ] `index.html` 单文件：无 `<script src>` / `<link rel="stylesheet">` 外链
- [ ] `assets/` 引用全部相对路径（无 `/` 开头绝对路径、无 http 外链）
- [ ] 双击 `dist/index.html`（file://）可加载运行
- [ ] 体积记录：zip 总大小登记入发布记录

## 三、发布流水线（npm run release）

```
npm run release
  ├─ 1. 类型检查        vue-tsc --noEmit（0 errors，否则终止）
  ├─ 2. 全量测试        vitest run（0 failed / 0 skipped，否则终止）
  ├─ 3. 覆盖率门禁      整体 ≥80%；engines ≥90%、core ≥85%（不达标终止）
  ├─ 4. 翻译齐备门禁    i18n 守卫测试全过 + npm run check:i18n 退出码 0（不达标终止）
  ├─ 5. 构建            vite build（IIFE 单文件）
  ├─ 6. 产物校验        §2.3 清单（脚本自动检查外链/绝对路径）
  ├─ 7. 打包            dist/ → LudoBurrow-vX.Y.Z.zip + SHA-256
  └─ 8. 发布记录        提示更新 README.md §版本迭代（人工完成）
```

**不允许带错误发布**：任一步失败即终止并修复回归（CLAUDE.md §发布原则 同源）。

## 四、本地分发与使用要求

| 项 | 要求 |
|---|---|
| 浏览器 | Chrome / Edge / Firefox 支持基线（技术架构 §6.1） |
| 使用方式 | 解压任意目录 → 双击 index.html；进度存本机 localStorage |
| 升级 | 覆盖解压（index.html 替换）；localStorage 按 origin 隔离，同目录覆盖升级进度保留 |
| 卸载 | 删除目录 + （可选）清除站点存储 |

> 说明：file:// 下 localStorage 按「file 页面共享存储区」隔离（Chrome/Edge/Firefox 行为一致，M1 验证项）；移动解压目录不影响存储（存储绑定 origin 而非路径）。

## 五、在线部署

### 5.1 GitHub Pages（默认渠道）

```
产物来源：dist/（npm run build 或 release 产物）
部署方式：gh-pages 分支或 Actions 工作流上传 dist/
访问形态：https://<user>.github.io/LudoBurrow/
```

- `base: './'` 已保证子路径（/LudoBurrow/）下资产正确加载，零配置改动
- 部署后按测试规范 §九 矩阵做在线冒烟

### 5.2 其他静态托管

Vercel / Netlify / 内网 Nginx 静态目录：上传 dist/ 全部内容即可；无需任何构建参数（产物自包含）。

### 5.3 PWA（M6 可选项）

在线版可开启 Service Worker 缓存，实现「在线访问一次、之后离线可玩」。注意 SW 仅在 https（或 localhost）生效，file:// 本地版不依赖 SW。实施时补充本节：SW 版本策略、缓存失效、离线清单。

## 六、版本管理与回滚

| 项 | 规范 |
|---|---|
| 版本号 | 语义化 vX.Y.Z；package.json 与产物命名一致 |
| git tag | 每次发布打 `vX.Y.Z` tag |
| Release | GitHub Release 附 zip + SHA-256 + 变更摘要 |
| 回滚（在线） | 重新部署旧 tag 的 dist/（或 Pages 指回旧版本） |
| 回滚（本地） | 用户重新下载旧版 zip 覆盖（存档向前兼容由 migration 链保证；跨大版本回退存档不保证，发布说明须注明） |

## 七、发布前检查清单

- [ ] `npm run release` 全绿（类型/测试/覆盖率/翻译齐备/构建/产物校验）
- [ ] 浏览器矩阵冒烟全过（测试规范 §九，8 场景 × 3 浏览器 × 双模式）
- [ ] README.md §版本迭代 已新增一行（版本/日期/类型/摘要/修改人）
- [ ] git tag 已打，Release 已附 zip + SHA-256
- [ ] 涉及存档 schema 变更时：migration 用例全过 + 发布说明注明回退影响

## 八、发布记录（强制）

`README.md §版本迭代` 为发布台账（CLAUDE.md §发布原则 #9）：

| 版本 | 日期 | 类型 | 摘要 | 修改人 |
|------|------|------|------|--------|
| vX.Y.Z | YYYY-MM-DD | 基线发布 / 迭代 / hotfix | 一段式摘要（交付内容 + 验证口径） | castle |

未更新版本迭代表的发布视为流程违规。
