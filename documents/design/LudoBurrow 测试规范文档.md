# LudoBurrow 测试规范文档

> **文档名称**：LudoBurrow 测试规范文档
> **基于文档**：《LudoBurrow 技术架构说明文档》
>
> **修订记录**：
>
> | 版本 | 日期时间 | 修订性质 | 修订摘要 | 修改人 |
> |------|----------|----------|----------|--------|
> | V1.0 | 2026-09-05 19:30:00 | 初稿 | Vitest 测试策略 / 覆盖率门禁 / Canvas 测试策略 / 浏览器冒烟 | castle |
> | V1.1 | 2026-09-05 21:15:00 | 设计修订 | 新增 §3.4 翻译齐备守卫测试（G-1~G-5）；命令与门禁增加 check:i18n；冒烟矩阵增加语言切换场景；必测清单增加 i18n/适配层条目 | castle |
> | V1.2 | 2026-09-06 05:30:00 | 实施同步 | §九 增补 M6.4 自动化等价覆盖注记（verify-dist + vite preview 11 URL + 各场景对应测试文件），明确 AI 自动化与人工三浏览器复核分工 | castle |
>
> **适用对象**：开发人员（含 AI 辅助开发会话）
> **文档用途**：规范 LudoBurrow 全阶段测试策略、覆盖率要求与质量门禁标准

---

## 一、总则

### 1.1 测试目标与原则

| 原则 | 含义 |
|------|------|
| 测试先行 | engines 与 core 的新功能**先写测试再实现**（TDD red-green-refactor，superpowers:test-driven-development 工作流强制） |
| 自动化优先 | 所有测试必须可自动化执行，禁止仅依赖手工验证 |
| 快速反馈 | 单文件测试秒级，全量测试 < 1 分钟 |
| 隔离性 | 测试之间互不依赖，可任意顺序执行 |
| 可重复性 | 同一测试在任何环境执行结果一致（确定性生成的红利） |
| 零跳过 | 最终产出必须 100% passed，不允许 SKIPPED；依赖不可控外部状态的用例不得编写，应改用 mock |

### 1.2 测试覆盖率要求

| 模块 | 最低覆盖率 | 推荐覆盖率 | 说明 |
|------|-----------|-----------|------|
| engines/（切块/迷宫生成/rng/词库） | 90% | 95% | 纯逻辑核心，最高优先 |
| core/（save 迁移/timer/level-manager） | 85% | 90% | 平台内核 |
| games/（createLevel 与实例逻辑） | 75% | 85% | 确定性部分必须全覆盖 |
| components/ + stores | 70% | 80% | 交互级组件测试 |
| ai/ | 70% | 80% | 请求走 mock，降级链必测 |
| **整体（发布门禁）** | **80%** | **90%** | `npm run release` 强制，不达标即失败 |

- 覆盖率统计以**行覆盖率（Line Coverage）** 为准（@vitest/coverage-v8）
- 纯类型声明文件可豁免

### 1.3 测试范围界定

| 测试类型 | 范围 | 工具 |
|---------|------|------|
| 单元测试 | engines/core 纯函数与状态机 | Vitest |
| 组件测试 | Vue 组件交互与渲染 | @vue/test-utils + happy-dom |
| Store 测试 | Pinia store 逻辑 | Vitest + createPinia |
| 浏览器冒烟 | file:// 双击 + 在线部署主流程 | 手工矩阵（§九），每发布必过 |

### 1.4 测试代码质量原则（强制）

> 当覆盖率门禁与下列原则冲突时，**原则优先**。覆盖率不达标应通过补充真实业务用例解决，不得通过构造无意义测试凑数。

| 原则 | 含义 |
|------|------|
| 不为覆盖率硬凑 | 测试必须验证真实业务行为；覆盖率是测试设计正确的**结果**，不是目的 |
| **覆盖率是下限，不是免测额度** | 达标后不得以此为由跳过任何可测节点；以**业务场景清单法**为准：列出功能全部可测节点（正常路径/边界/异常/降级/状态转移），逐节点映射用例，未映射节点即漏测，必须补齐 |
| 实现方式符合原有设计 | Mock/Stub 必须尊重被测代码的真实依赖结构；**测试适配代码，不是代码迁就测试** |
| 不脱离原有业务场景 | 测试输入、断言点必须可追溯到《技术架构说明文档》对应章节 |

### 1.5 反模式与正确做法

| 反模式（禁止） | 正确做法 |
|---------------|---------|
| 为命中某分支构造生产代码不可能出现的入参 | 围绕真实业务用例设计输入（真实关卡号区间、真实网格规格 3×3~9×9） |
| 为让 Mock 好写，反向修改生产代码导入方式 | 调整测试的 Mock 路径适配生产代码 |
| 无断言或断言"函数被调用过"即算通过 | 断言业务结果（切割块数、解锁数、迁移后字段值） |
| 占位测试（`it('works')`）凑数 | 拒绝占位测试；覆盖率不足时按业务场景清单查漏补缺 |
| 测试里用 `Math.random()` 或当前时间导致不稳定 | 用固定种子/注入时钟源（core/timer 已设计为可注入） |

---

## 二、测试架构

### 2.1 测试目录结构

```
tests/
├── unit/            # engines + core 单元测试
│   ├── jigsaw-cutter.spec.ts
│   ├── maze-generator.spec.ts
│   ├── wordbank.spec.ts
│   ├── rng.spec.ts
│   ├── save.spec.ts
│   ├── timer.spec.ts
│   └── level-manager.spec.ts
├── component/       # Vue 组件与 GameModule 实例测试
│   ├── LevelSelect.spec.ts
│   ├── keygame.spec.ts
│   ├── jigsaw.spec.ts
│   └── maze.spec.ts
├── store/           # Pinia store 测试
│   └── settings.spec.ts
└── setup.ts         # 全局 setup（canvas mock 等）
```

- `tests/` 独立于 `src/`（与源码分离，随 git 仓库正常发布；dist/ 构建产物不含测试）
- 文件命名：`<被测模块>.spec.ts`，与 src 模块名一一对应

### 2.2 Vitest 配置基线

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: { lines: 80 },   // 整体硬门槛；模块级由 release 脚本按 §1.2 校验
    },
  },
  resolve: { alias: { '@': '/src' } },
})
```

### 2.3 全局 Setup（canvas 与存储）

| 项 | 策略 |
|---|---|
| Canvas 2D context | happy-dom 无 Canvas 实现；`tests/setup.ts` 统一 mock `getContext('2d')` 返回记录调用的假 ctx（断言绘制指令序列） |
| localStorage | happy-dom 提供；每测试 beforeEach 清空 |
| rAF | mock 为同步/受控回调（游戏循环测试） |
| 时钟 | core/timer 注入 fake clock（vi.useFakeTimers 或自注入） |

---

## 三、单元测试规范（engines / core）

### 3.1 命名规则

describe = 被测模块；it = `行为_场景_预期` 的自然句式：

```ts
describe('maze-generator', () => {
  it('同一种子生成完全相同的迷宫', () => { ... })
  it('分支度参数增大时死胡同数量增加', () => { ... })
  it('尺寸为奇数时入口出口连通（可解性）', () => { ... })
})
```

### 3.2 断言规范

```ts
// 正确：断言业务结果
const plan = cut(imageData, { grid: 5, seed: 42 })
expect(plan.pieces).toHaveLength(25)
expect(plan.pieces.every(p => p.distinctScore >= THRESHOLD)).toBe(true)

// 禁止：无断言 / 只断言不抛错
```

### 3.3 重点必测清单（业务场景清单法基线）

| 模块 | 必测节点 |
|---|---|
| engines/rng | 同种子同序列；跨调用独立（两个 rng 互不干扰） |
| engines/maze-generator | 可复现性；可解性（入口→出口连通）；尺寸/分支度参数生效 |
| engines/jigsaw-cutter | 同参数同种子同切块；均匀网格（内容只定块数，验收返工二轮起切割线恒等分）；块唯一性评分（低分规格在优选/建议链路被抑制）；锯齿凸凹种子化（半圆单旋钮，验收返工四轮）；AI 建议规范化器：合法输入通过 / 非法输入钳制 / 空坏数据降级 |
| engines/wordbank | 分级边界（第 1/50 关词长）；拼音序列正确（去空格）；词表无重复无空串 |
| core/save | 新档默认值；写入-读取往返；**schema 迁移链（v1→v2 合成旧档样例）**；损坏 JSON 拒绝并提示；导出/导入往返；AI Key 默认脱敏 |
| core/timer | 正计时准确（注入时钟）；竞赛模式到时结算；防沉迷到时提醒；暂停恢复累计正确 |
| core/level-manager | 初始仅第 1 关解锁；过关解锁 n+1；星级与最佳成绩更新规则 |
| core/game-registry | 注册/获取/列举；重复 id 拒绝 |
| i18n 语言包 | 守卫五项（§3.4 G-1~G-5）：键位双向 1:1 / 空值 / 注册表一致 / 选项一致 / 跨段重复键为零 |
| services/ 适配层 | LocalAdapter：匿名单用户语义（getCurrentUser 恒非空）；素材仓库 CRUD（IndexedDB mock）；WebAdapter 占位护栏（构造即报二期能力） |

---

## 四、组件测试规范（Vue / GameModule）

### 3.4 翻译齐备守卫测试（i18n guard，发布门禁）

以 Vitest 固化（`tests/unit/i18n-guard.spec.ts`），与 `npm run check:i18n` 双保险：

| # | 守卫项 | 断言 |
|---|---|---|
| G-1 | 键位镜像 | zh-CN 与 en-US 键集合双向差集为空（1:1） |
| G-2 | 无空翻译 | 任一语言任一键值为空串/null 视为未翻译，失败 |
| G-3 | 注册表一致 | SUPPORTED_LOCALES 与实际注册的语言包一致；LOCALE_OPTIONS 与 SUPPORTED_LOCALES 一致 |
| G-4 | 无重复定义 | 跨段同名同值键为零（同功能同描述同出处；通用文案归 common 段） |
| G-5 | 插值一致 | 双语言包中同一 key 的插值占位符（`{n}` 等）一致 |

- 守卫失败 = 发布阻断（与覆盖率同级，§7.2 / CLAUDE.md 发布原则 #4）
- 新增语言自动纳入守卫（遍历 SUPPORTED_LOCALES）

### 4.1 组件测试模式

```ts
import { mount } from '@vue/test-utils'
import LevelSelect from '@/components/LevelSelect.vue'

describe('LevelSelect', () => {
  it('锁定关卡显示锁标识且不可点击', () => {
    const wrapper = mount(LevelSelect, {
      props: { unlocked: 3, results: mockResults() },
    })
    const locked = wrapper.find('[data-level="5"]')
    expect(locked.classes()).toContain('is-locked')
  })
})
```

- 关键元素加 `data-*` 测试锚点（不依赖样式类定位业务状态）
- 交互测试：`trigger('click'/'keydown')` + 断言 emit/store 变化

### 4.2 GameModule 实例测试

- 以真实 DOM 容器 mount `GameModule.mount()`（Canvas mock 下运行）
- 必测：`start → pause → resume → destroy` 状态机；`destroy` 后无监听/rAF 残留；`onComplete` 回调载荷正确
- 键盘游戏：模拟 keydown 序列驱动完整过关流程
- 拼图：模拟拖拽落格（调用 instance 暴露的测试用输入接口或派发 pointer 事件）

### 4.3 Store 测试

```ts
beforeEach(() => setActivePinia(createPinia()))
```

每测试重置 Pinia；断言 state/getter/action 副作用。

---

## 五、Canvas 渲染测试策略

- **纯函数全覆盖**：坐标计算、命中检测、吸附判定、图元描述生成——直接单测（无 DOM）
- **绘制层薄验证**：经 mock ctx 断言关键绘制指令（drawImage 次数/裁剪参数）
- 不做像素级快照对比（脆弱）；以「图元描述」快照替代（稳定且可读）

---

## 六、测试数据管理

| 方式 | 适用场景 |
|------|---------|
| 代码内构建 | 少量数据：直接构造对象/合成 ImageData（小尺寸像素数组） |
| 固定种子 | 一切随机相关：`createRng(42)` |
| Fixture | 合成小图（如 8×8 渐变 PNG 的 base64 常量）、旧版存档样例（迁移测试） |

- **禁止**引用 `assets/` 大图做测试输入（慢且耦合资产）；切块算法测试用合成 ImageData
- **禁止**测试数据残留：localStorage 每测试清理
- 词库变更须同步更新词库快照断言（词数/分级边界）

---

## 七、测试执行与质量门禁

### 7.1 命令

```bash
npm run test               # vitest run（全量）
npm run test:coverage      # 覆盖率报告 + 整体 80% 阈值
npm run typecheck          # vue-tsc --noEmit（期望 0 errors）
npm run check:i18n         # 翻译齐备校验（与 §3.4 守卫同规则脚本化）
```

### 7.2 质量门禁标准

| 检查项 | 标准 | 阻断级别 |
|--------|------|---------|
| 全部测试通过 | 0 failed / 0 skipped | 阻断 |
| vue-tsc | 0 errors | 阻断 |
| engines 覆盖率 | ≥ 90% | 阻断（release 脚本校验） |
| core 覆盖率 | ≥ 85% | 阻断 |
| 整体覆盖率 | ≥ 80% | 阻断（vitest thresholds + release 脚本双保险） |
| 翻译齐备（i18n 守卫） | G-1~G-5 全过 + `npm run check:i18n` 退出码 0 | 阻断（发布双门禁之一） |
| 浏览器矩阵冒烟 | Chrome/Edge/Firefox file:// + 在线全过 | 阻断（发布前） |

> 各里程碑当期测试基线（用例数）登记于《LudoBurrow 开发计划文档》（内部文档，不入库）修订记录。

---

## 八、测试命名与文件组织

- 测试文件与被测模块同名：`src/core/save.ts` ↔ `tests/unit/save.spec.ts`
- 组件测试：`tests/component/<Component>.spec.ts`
- 一个 spec 聚焦一个模块；跨模块协作场景放 `tests/component/`（如「过关→解锁→存档」链路）

---

## 九、浏览器兼容冒烟（手工矩阵，每发布必过）

| # | 场景 | Chrome | Edge | Firefox |
|---|------|--------|------|---------|
| 1 | 双击 dist/index.html（file://）加载无报错 | ☐ | ☐ | ☐ |
| 2 | 三游戏各进 1 关可玩 | ☐ | ☐ | ☐ |
| 3 | 过关 → 结算 → 解锁下一关 | ☐ | ☐ | ☐ |
| 4 | 关闭重开，进度与设置恢复 | ☐ | ☐ | ☐ |
| 5 | 存档导出 → 清存储 → 导入恢复 | ☐ | ☐ | ☐ |
| 6 | 在线部署（https://）同流程 | ☐ | ☐ | ☐ |
| 7 | 拼图：导入图片→切块→开玩→放弃演示 | ☐ | ☐ | ☐ |
| 8 | AI 建议触发降级提示（断网/无效 Key） | ☐ | ☐ | ☐ |
| 9 | 设置切换中/英：全站文案即时切换、无缺译（不显示 key 或空白）、游戏内容不随语言变化 | ☐ | ☐ | ☐ |

- 冒烟发现的缺陷按 `documents/bug/README.md` 命名规范立档修复

> **自动化等价覆盖（M6.4）**：AI 侧已完成等价验证——verify-dist 产物校验（单文件 / 无外链 / PWA 产物与版本一致）+ vite preview 11 URL 全 200（页面 / 资产 / 图标 / 图库抽查）+ 服务器与本地 dist 内容一致性比对；场景 1-9 的逻辑面由各测试文件覆盖（组件 / 实例 / 链路测试）。真浏览器 × 3 的矩阵执行为发布前人工动作，按上表逐格勾选。
