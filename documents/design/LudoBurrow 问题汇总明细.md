# LudoBurrow 问题汇总明细

> **文档名称**：LudoBurrow 问题汇总明细（开发避坑指南）
> **基于文档**：《LudoBurrow 技术架构说明文档》
>
> **修订记录**：
>
> | 版本 | 日期时间 | 修订性质 | 修订摘要 | 修改人 |
> |------|----------|----------|----------|--------|
> | V1.0 | 2026-09-14 | 基线发布 | 文档基线：P1-02 闭环为已实测结论、归档引用更新；条目内容随开发累积不变；此前修订历史随基线清零，存档于 `documents/design/历史存档/V1/` | castle |
>
> **适用范围**：LudoBurrow 开发全周期踩坑记录（AI 会话与人工开发通用）

---

## 0. 文档说明

- **条目格式**：每条问题固定四段式——**现象 / 根因 / 解决 / 参考**
- **编号规则**：`P<章节号>-<序号>`（如 P1-02 = 第一章第 2 条），跨文档引用使用此编号
- **收录标准**：开发/测试/发布过程中实际踩到的坑（含 AI 辅助开发产生的），重复踩同一坑更新原条目不新开
- **写入时机**：superpowers:systematic-debugging 定位根因并修复后，随修复提交一并入档（流程出处见已归档的《开发计划文档》§2.4，`documents/design/历史存档/`）
- **章节组织**：按领域分章，与《技术架构说明文档》章节无强绑定，随条目增长可加章

**条目模板**：

```markdown
### P<章>-<序号> <一句话标题>

**现象**：可观察到的错误行为/输出（含报错原文关键行）。

**根因**：定位过程与真实原因（不是猜测，是验证过的结论）。

**解决**：修复方式 + 防复发措施（测试/规范/工具）。

**参考**：相关文件路径、BUG 文档（documents/bug/）、规范条款、外部链接。
```

---

## 1. 构建 / file:// 兼容

### P1-01 file:// 下 ES Module 被 CORS 阻止

**现象**：双击打开 `index.html`（file:// 协议）白屏，控制台报 CORS/模块加载失败。

**根因**：现代浏览器在 file:// 下以 CORS 策略阻止 ES Module 加载（`<script type="module">` 的跨源限制）。

**解决**：构建采用 vite-plugin-singlefile 产出单文件 IIFE `index.html`（JS/CSS 全内联），运行时不加载任何外链模块。设计期已定（技术架构 §5.4），M1 任务 1.1/1.10 验证。

**参考**：《技术架构说明文档》§5.4；开发计划 M1。

### P1-02 localStorage 在 file:// 下的存储隔离语义

**现象**：file:// 页面共享同一存储区——不同目录解压的两份应用共享 localStorage（M1 已实测确认，Chrome/Edge/Firefox 行为一致）。

**根因**：浏览器对 file:// origin 的处理（Chrome/Edge/Firefox 均按「file 页面共享存储区」隔离，而非按路径隔离）。

**解决**：单一 key `ludoburrow/save` 设计本身兼容该语义（同机多副本共享进度，视为可接受行为）；存储绑定 origin 而非路径，移动解压目录不影响进度。

**参考**：《技术架构说明文档》§6.2 验证项 2/4；部署规范 §四。

---

## 2. Canvas / 渲染

### P2-01 file:// 下 canvas 像素读取被污染，图库双轨分发解决

**现象**：拼图切块引擎需读图分析像素；file:// 下 `assets/` 相对路径图片绘制到 canvas 后 `getImageData` 抛 SecurityError（canvas 被污染）。

**根因**：file:// origin 为 null，相对路径图片虽可绘制但 canvas 被标记污染，跨源像素读取被禁止；分析缩略若直接走外链文件会全部不可用。

**解决**：双轨分发——192 分析缩略以 PNG data URI 内嵌 `thumbs.ts`（data URI 不触发 taint，切块引擎可 `getImageData`）；1024 源图走 `assets/` 相对路径仅绘制不读像素。自定义上传图走 IndexedDB blob → `URL.createObjectURL`（blob URL 同源，可读像素）。

**参考**：`src/games/jigsaw/thumbs.ts`、`src/games/jigsaw/gallery.ts`（downscaleToAnalysis）、`scripts/fetch-gallery.mjs`（现行缩略/源图生成脚本；M3 期曾为 gen-gallery.mjs，已随图库换源移除）；技术架构 §15.3。

---

## 3. Vue / TypeScript

### P3-01 判别联合在三元/回调表达式中窄化失效

**现象**：`schemes.filter((s) => cond ? s.source.imageId === x : s.source.assetId === y)` 报 TS2339（`imageId` 不存在于 custom 类型分支）。

**根因**：判别联合窄化仅对 if/三元直接作用于「同一表达式」时生效；回调参数上的属性访问在两臂中被视作未窄化的联合。

**解决**：改用 if 逐层判别（先 `if (s.source.kind !== source.kind) return false`，分支内再收窄）或抽独立函数用类型谓词。

**参考**：`src/components/SchemeManager.vue`（sameSourceScheme）。

---

## 4. 测试 / Vitest

### P4-01 happy-dom 对 data URI Image 的「半解码」行为

**现象**：`thumbs.ts` 填充后原「资产未就绪」用例失效——happy-dom 中 Image 加载 data URI 会触发 onload，但无尺寸/解码信息，后续 drawImage/getImageData 抛 TypeError 而非预期错误。

**根因**：happy-dom 不实现真图片解码，data URI src 触发 onload 但 naturalWidth 为 undefined，与真实浏览器行为不同。

**解决**：「加载失败」路径用例改用未知 imageId（业务层抛 RangeError，不依赖浏览器解码）；真解码链路（上传→分析）用 mock assetRepo 在 services 层截断；真浏览器行为由浏览器矩阵冒烟覆盖。

**参考**：`tests/unit/jigsaw-instance.spec.ts`、`tests/unit/jigsaw-level.spec.ts`。

### P4-02 canvas mock 断言应数「绘制调用」而非「状态设置次数」

**现象**：maze-theme 用例断言「up 朝向无眼点」时按 `set:fillStyle '#26221f'` 次数计数期望 0，实际 1 而失败——up 分支确实不绘制。

**根因**：实现中 `ctx.fillStyle = 眼色` 的赋值在朝向 if 分支**之前**无条件执行；mock ctx 的 set 拦截记录的是「状态设置」而非「绘制语义」，两者不等价。

**解决**：断言改为遍历 `__calls` 跟踪当前 fillStyle，仅统计「以目标色为当前状态的 fillRect/drawImage」绘制调用（down=2、up=0）。经验：对记录式 mock 的断言要对齐绘制语义，而非属性赋值次数。

**参考**：`tests/unit/maze-theme.spec.ts`（eyeDots 计数器）。

### P4-03 AI 建议浮点切割线与下游整数像素采样契约冲突

**现象**：cut-suggestion.spec 新增「AI 建议权重 → 建线 → 复用本地切块闭环」用例失败——`Number.isFinite(plan.minScore)` 为 false，建议权重换算出的切割线坐标是浮点（如 57.6px），纯色块评分采样得到 NaN。

**根因**：本地算法 buildAxisLines 产整数像素线，下游 sampleLuma（`data[(y*w+x)*4]` 整数索引）与块评分隐含「切割线 = 整数像素坐标」假设；AI 建议链路 weightsToLines 按 cumsum 等分直接产浮点线，未经对齐进入下游即违反该假设（浮点索引读出 undefined → luma NaN → minScore NaN）。

**解决**：weightsToLines 产线末步 Math.round 网格对齐 + 单调递增钳制（`Math.max(next, prev+1)`），保证线坐标整数且严格递增；断言补充段宽校验。该步骤即技术架构 §14.5「网格对齐」合法化的实证。

**参考**：`src/engines/jigsaw-cutter/suggest.ts`（weightsToLines）、`tests/unit/cut-suggestion.spec.ts`、技术架构 §14.5。

---

### P4-04 setup.ts 全局 RAF mock 在 happy-dom 下未生效，__flushRaf 空转

**现象**：迷宫 HUD 主题切换用例断言「点击后背景重画为花园色」失败——mock ctx 记录里只有挂载时一次 paint；探针测试实证 `requestAnimationFrame` 入队后 `__flushRaf(0)` 不执行回调（ran=false），且裸调用返回 `[object Object]`（happy-dom 原生 RAF 句柄）而非 mock 的数字 id。

**根因**：setup.ts 的安装条件 `!('requestAnimationFrame' in globalThis) || import.meta.env?.VITEST` 在 vitest 3.2.7 + happy-dom 组合下求值为假——happy-dom 环境自带 RAF（首项取反为假），且 setupFile 的 `import.meta.env.VITEST` 未按预期为真，整个 mock 分支被跳过；裸调用解析到 happy-dom 原生 RAF（内部定时器异步调度），`__flushRaf` flush 的是永远为空的 mock 队列。既有 resize 用例恰不依赖 RAF 回调执行（断言在事件同步路径），长期掩盖此失效。

**解决**：不动全局 setup（jigsaw 动画 tick 依赖原生 RAF 异步性，无脑替换有回归风险）；需驱动重画的用例改用局部同步 stub——`vi.stubGlobal('requestAnimationFrame', 入队函数)` + 手动 flush + `vi.unstubAllGlobals`（flush 后实例 rafId 归零，destroy 无需 cancel）。后续若统一修 setup 安装条件，须先全量回归 jigsaw 动画用例。

**参考**：`tests/unit/maze-instance.spec.ts`（stubSyncRaf）、`tests/setup.ts` L59-82；v1.0 验收返工 fb-maze-theme 实证。

### P4-05 happy-dom 大 Blob/File 与 IndexedDB 模拟层性能不代表浏览器

**现象**：真实版权素材（10 张 200-500KB JPEG）导入链路实测：内存后端全量往返与缺省 IndexedDB 后端均超 vitest 默认 5s 超时；同一 IDB 后端 64KB 小样本正常通过。

**根因**：happy-dom 的 Blob/File/arrayBuffer 与 IndexedDB 均为 JS 模拟实现（非原生结构化克隆），对数百 KB 二进制的拷贝/克隆开销线性放大；生产浏览器 IndexedDB 原生 Blob 存取无此问题。

**解决**：测试口径分层——字节等价全量验证走内存后端（adapter 转发层与 IDB 后端同构，services 层唯一分叉点）；IDB 通道存在性/往返语义用小样本（64KB 切片）验证；需要全量真实字节时给用例显式加 `timeout`（实测 10 张约 5s 出头）。

**参考**：`tests/unit/services.spec.ts`（内存后端先例）、v1.0 验收返工本地素材实测（临时 spec 验后删）。

### P4-06 模块级缓存（Map 状态）跨 describe 泄漏，隔离纪律要覆盖非存档状态

**现象**：jigsaw-schemes.spec 新增「预热联动」describe 后，原有「createTopicLevel 内置关 3×3」用例失败（实际读到 rows=6）——前一 describe 里 `rememberSpec('animals-01', {6,3})` 的残留。

**根因**：optimize.ts 的规格缓存是**模块级 Map**（与 localStorage 同为跨用例共享状态），但文件内既有 beforeEach 只清了 localStorage；vitest 同文件 describe 顺序执行，缓存自然泄漏到后续断言。

**解决**：文件内所有 beforeEach 统一 `localStorage.clear(); resetSpecCache()` 双清（与存档同口径隔离）；模块内导出 resetSpecCache 供测试使用。纪律：新增任何模块级可变状态，必须同步提供 reset 并接入测试隔离。

**参考**：`src/games/jigsaw/optimize.ts`、`tests/unit/jigsaw-schemes.spec.ts`、`tests/unit/jigsaw-optimize.spec.ts`。

### P4-07 均匀化后「对比本地」类用例需构造确定性分差（不同网格）

**现象**：ai-suggest 质量门槛用例（半棋盘图 + 建议 2×2）在切块均匀化后失败——本地基准与建议同为均匀 2×2 网格，minScore 完全相等，「低于本地基准被拒」分支不再触发（实际 applied 而非 rejected）。

**根因**：均匀化前本地网格非均匀、与建议网格天然有分差；均匀化后「同 rows/cols = 同网格 = 同 minScore」，对比语义只剩**不同块数网格之间**的比较。

**解决**：用例改构造确定性分差图（stripeHalfImage：左半 32 周期黑白条纹、右半纯白）+ 建议 2×3——本地基准 2×2 右块贴条纹边 minScore=40，建议 2×3 最右块贴白边 minScore=0，40 > 0 数学确定成立。经验：重构「对比择优」类断言前，先验证两条路径在当前实现下是否仍天然不同。

**参考**：`tests/unit/ai-suggest.spec.ts`（stripeHalfImage）、验收返工二轮（切块全均匀）。

### P4-08 优选规格断言不能凭记忆推导：候选序 + 整数化均匀度 + 档窗口约束须实跑校准

**现象**：六档窗口改造后，凭直觉预写的择优断言集中翻车 4 处——`candidateSpecs(2)[0]` 期望 3×4 实为 2×6；竖图 32×64 c2 期望 6×3 实为 5×2；横图 64×32 c2 期望 3×6 实为 2×5；warm 预热 space-03（档 3）期望 5×3 实为 6×3。

**根因**：三个耦合点凭记忆推不准——①候选序 = 生成序（rows 外层）经「|块数−target|」稳定排序，同偏差保持生成序（2×6 先于 3×4），非直觉的「更方在前」；②`buildAxisLines` 用 Math.round 取整，非整除切割的块面积不均 → uniformity < 1 参与评分（纯色图 quality 只剩均匀度项，与块形惩罚折算竞争）；③正方形块候选（rows = 2×cols）可能根本不在档窗口内（c2 [10,14] 无：6×3=18 超窗；c3 [15,20] 含 18 → 直接胜出）。

**解决**：择优类断言一律实跑校准——先跑 `pickBestSpec` 看 ranked 再写期望值；窗口/候选数断言（如「c2 候选 8 个」）与择优断言分层写，前者锁窗口语义、后者锁内容偏好；跨档断言（同图不同档）注释写明「档内是否有正方形候选」判据。

**参考**：`tests/unit/jigsaw-optimize.spec.ts`（六档断言校准）、`tests/component/scheme-manager.spec.ts`（批量导入 4×2/5×2）；验收返工三轮（六档互斥窗口）。

---

## 5. 资产与图片

### P5-01 离线环境内置图库获取渠道受限，改程序化生成

**现象**：M3.9 原计划「开源渠道下载 CC0/CC-BY → 压缩转 WebP」无法执行：开发环境无外网，且零第三方依赖约束下无 WebP 编码器。

**根因**：任务设计默认外网可用；离线环境下下载与编码两条路都不通。

**解决**：改用 `scripts/gen-gallery.mjs` 确定性程序化生成 PNG（node:zlib deflate + 手写 CRC32/PNG 编码，1024 源图与 192 缩略同配方渲染，输出恒定可复现），零第三方素材零版权风险；`CREDITS.md` 标注许可随项目 MIT 发布。验收等价满足（每专题 ≥5 张 + 许可标注）；文档口径已同步（技术架构 §15.1/§15.3/§21/R-02、开发计划 3.9/F-27/NF-04）。

**参考**：`scripts/gen-gallery.mjs`（M3 期决策记录；v1.1.0 起图库换源为 Commons/Openclipart 真实照片，改由 `scripts/fetch-gallery.mjs` 生成，gen-gallery.mjs 已移除）、`public/assets/images/CREDITS.md`、开发计划 M3 表 3.9 调整说明。

---

## 6. 开发环境与工具链

### P6-01 跨工具 PowerShell 命令引号剥离与一元 -not 优先级陷阱

**现象**：两类失败——①经 Bash 工具执行 powershell 内联命令，含嵌套引号 / `$_` / `$var =` 赋值的复杂命令被剥离引号后报「字符串缺少终止符」「无法将"="项识别为 cmdlet」；②M6.4 冒烟判定 `-not $html -match '<script...'` 结果与预期反转（误报「产物含外链 script」），node fetch 对比证实服务器返回与本地 dist 完全一致、宽松正则双 0 命中，产物干净。③验收返工三轮：无参调用带 `[Parameter(Mandatory)]` 的 check-color.ps1 挂起（等待 stdin 输入而非报错）；嵌套 `powershell -Command "…"` 内层单引号/中文路径静默失效（Select-String 空输出）。

**根因**：①Bash → powershell.exe 的跨工具引号转义边界不透传嵌套引号与 `$` 变量；②PowerShell 一元运算符 `-not` 优先于二元 `-match` 绑定，表达式实际解析为 `(-not $html) -match '...'`——先对非空字符串取反得 `$false`，再与模式匹配恒 `$false`，判定逻辑被短路反转。

**解决**：①复杂命令一律落临时脚本文件执行（.mjs / .ps1，用后即删），node `readFileSync` 为最稳路径；②逻辑取反必须显式括号包裹整个匹配表达式 `if (-not ($html -match '...'))`；③关键结论用第二种独立工具交叉验证，防单点解析误判。

**参考**：M6.4 冒烟排查（`scripts/.smoke-check.mjs`，用后删）。

### P6-02 Read 工具对近期修改文件返回陈旧缓存

**现象**：对跨会话近期已修改文件调用 Read 返回修改前旧版：SchemeManager.vue 返回 661 行旧版（与 grep 行号矛盾）、release.mjs 显示 87 行（实际 123 行）、M6.5 读 README / 开发计划分别返回 M4 / M5 前版本——行数与内容均旧，直接据此 SearchReplace 会失配或误改。

**根因**：文件读取层缓存失效不及时，外部变更（多工具先后写入）未触发刷新。

**解决**：对刚修改过的文件先以 PowerShell `Get-Content` 或 node `readFileSync` 交叉验证真实内容与总行数；SearchReplace 的 original_text 一律以 node 系真实输出为依据。

**参考**：M5.5 / M6.3 / M6.5 会话多次实证（m5-wire 接线、M6.3 release.mjs 语法修复、M6.5 文档定稿前定位）。

### P6-03 PowerShell 整数除法静默取整，缩略尺寸算成 1×1

**现象**：像素提取脚本（System.Drawing）输出全部 `2000x2576 -> 1x1`；`$scale = [Math]::Min(1, 192 / $maxEdge)` 中 192/2576 得 0 而非 0.0745。

**根因**：PowerShell `/` 对两个整数操作数做整数除法（截断取整），不像 JS 一样自动浮点；`[int]` 上下文无告警静默出错。

**解决**：除数或被除数显式带小数点（`192.0 / $maxEdge`）；涉及除法的脚本对结果做范围断言（本例 $w/$h ≥ 2 即可拦截）。

**参考**：`scripts/extract-local-pixels.ps1`（v1.0 验收返工本地素材提取）。

### P6-04 PS 5.1 `-Encoding UTF8` 写入实际带 BOM，下游 JSON.parse 报错

**现象**：Node 侧读 PS 产出的 meta.json 后 `JSON.parse` 报 `Unexpected token '﻿'`（锘 = BOM 字节 EF BB BF 被解码）。

**根因**：Windows PowerShell 5.1 的 `Set-Content -Encoding UTF8` 恒写 UTF-8 BOM（PowerShell 7 的 utf8 才无 BOM），与直觉相反。

**解决**：消费方读入后剥离 `replace(/^\uFEFF/, '')`（已在脚本注释中标注）；或产出方改用 `[System.IO.File]::WriteAllText($path, $json)`（默认无 BOM）。

**参考**：`scripts/extract-local-pixels.ps1` 尾部注释。

### P6-05 SearchReplace 输出「兑底」伪影：替换含「兜底」文本后需 grep 验证

**现象**：多次对含「兜底」的原文执行 SearchReplace 后，new_text 中「兜底」偶发变成「兑底」（如 gen-maze-assets.mjs 注释、SchemeManager onAutoBest 注释）；本会话修错时 new_text 又连带写错一次（「兑底。→ 兜底」补箭头未换字）。验收返工二轮再拦 3 次（jigsaw instance.ts onPointerDown 注释、maze-theme.spec 用例标题、技术架构文档表格行/开发计划返工行），验收返工三轮又拦 2 次（schemes.ts builtinGrid 占位注释、SchemeManager onAutoBest 重写注释），高频复发。

**根因**：工具链编辑含高频术语的长文本时的偶发字符替换伪影，无规律可预测；人肉复查 new_text 也难一眼识别。

**解决**：纪律——任何替换后若文本含「兜底/退路/回落」类术语，立即 `grep_code '兑底'` 全仓验证（已多次拦截）；提交前全仓扫描一次作为门禁步骤。

**参考**：v1.0 验收返工多次实证（fb-jig-scheme / fb-maze-assets / gen-maze-assets 修复）；验收返工二轮 3 次拦截（含新增文本也中招，写入与替换同样需验）；验收返工三轮 2 次拦截。

### P6-06 生成脚本模板字符串内反引号必须 \` 转义，裸写即截断报错

**现象**：编辑 gen-maze-assets.mjs 的 CREDITS 模板字符串（含代码字体 `` `MAZE_THEMES` `` 标记）后运行报 `SyntaxError: Invalid regular expression flags`；修复时误写成 `\<\>`（反斜杠+尖括号，语法合法但输出无反引号包裹），二次修正为 `\`\`` 才对。

**根因**：模板字符串内裸写反引号会提前终止字符串，其后内容被当作代码解析；修复时又把「反引号转义」误解为「尖括号替换」。

**解决**：模板字符串内的反引号统一 `\`` 转义；编辑生成脚本后先跑一次 `node <script>` 验证语法再继续；与 P6-01 同属「编辑后先验证」纪律。

**参考**：`scripts/gen-maze-assets.mjs`（CREDITS 段）、验收返工二轮八主题瓦片生成。

---

## 附录：使用本文件的方式

1. **新会话开工前**：扫一眼当期里程碑相关章节，避免重复踩坑
2. **调试收尾时**：按 §0 四段式入档（systematic-debugging 工作流的一环）
3. **里程碑收尾时**：本文件新增条目数随发布登记于 `README.md §版本迭代` 摘要（历史明细见已归档的开发计划文档）
4. **与 documents/bug/ 的分工**：bug/ 存单次缺陷的完整修复文档（含验证记录）；本文件存可复用的经验结论（跨问题模式）
