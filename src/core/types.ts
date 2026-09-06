// 平台类型契约：GameModule 插件体系（技术架构 §8）
// 本文件是 core/games/components 的公共类型单一出处，不依赖 Vue。

/** 关卡通用基底：各游戏以判别联合扩展自己的 LevelConfig */
export interface BaseLevelConfig {
  /** 所属游戏 id（与 GameModule.id 一致） */
  gameId: string
  /** 关卡号（1-50） */
  n: number
  /** 确定性种子：hash(gameId + ':' + n) 派生，同关卡内容恒定 */
  seed: number
  /**
   * 进度轨标识（多轨游戏用；如键盘四模式、拼图专题/方案）。
   * 缺省 = 单轨游戏，进度按 gameId 存；有值时进度按 `${gameId}:${track}` 独立存（level-manager.progressSlotKey）。
   */
  track?: string
}

/** 关卡进度上报（onProgress 载荷） */
export interface LevelProgress {
  gameId: string
  n: number
  /** 已完成子目标数（如已按对字符数、已拼入块数） */
  done: number
  /** 子目标总数 */
  total: number
}

/** 关卡完成结算（onComplete 载荷） */
export interface LevelResult {
  gameId: string
  n: number
  /** 本关用时（ms） */
  elapsedMs: number
  /** 失误计数（键盘错误次数 / 拼图帮助次数等，各游戏口径自定） */
  mistakes: number
  /** 星级（1-3，由各游戏按自身难度曲线计算） */
  stars: 1 | 2 | 3
  /** 游戏侧附加成绩（如迷宫步数），进存档 meta */
  meta?: Readonly<Record<string, number | string | boolean>>
}

/** 平台与游戏实例的交互钩子：游戏实例只经 hooks 与平台交互，不直接操作存档 */
export interface GameHooks {
  /** 进度上报（可选频率，驱动进度条） */
  onProgress(payload: LevelProgress): void
  /** 完成 → 平台结算（计时停止、写档、解锁） */
  onComplete(result: LevelResult): void
  /** 放弃 → 平台记失败/退出回关卡选择 */
  onAbandon(): void
}

/** 游戏实例生命周期（mount 返回） */
export interface GameInstance {
  start(): void
  pause(): void
  resume(): void
  /** 必须清理全部事件监听、rAF、定时器（泄漏由组件测试覆盖） */
  destroy(): void
}

/**
 * 游戏插件模块：新游戏 = 实现本接口 + 注册一行，平台计时/存档/关卡管理自动生效。
 * name 为 i18n key（如 'game.keygame'），显示名一律经 t() 取值（禁止硬编码文案）。
 */
export interface GameModule {
  /** 唯一标识，如 'jigsaw' */
  id: string
  /** 显示名 i18n key（渲染时 t(module.name)） */
  name: string
  /** 图标资源路径（相对路径 assets/...） */
  icon: string
  /** 生成第 n 关配置；track 为多轨游戏的进度轨标识（缺省 = 单轨） */
  createLevel(n: number, track?: string): BaseLevelConfig
  mount(container: HTMLElement, level: BaseLevelConfig, hooks: GameHooks): GameInstance
  /**
   * 多轨游戏的进度轨列表（如键盘四模式、拼图专题）：选关页先选轨再展示该轨关卡，各轨独立解锁/星级。
   * 缺省 = 单轨游戏，选关页直接展示固定关卡。id 传入 createLevel(n, track) 并作为进度槽键后缀。
   */
  tracks?: readonly { id: string; labelKey: string }[]
  /**
   * 轨内关卡总数（动态关卡游戏用，如拼图按切片方案数；缺省 = 固定 TOTAL_LEVELS）。
   * 选关页与结算「下一关」以此为准，替代硬编码 50。
   */
  levelCount?: (track?: string) => number
}

/** 关卡成绩记录（level-manager 读写单元） */
export interface LevelRecord {
  /** 历史最高星级（取高保留） */
  stars: number
  /** 历史最短用时 ms（取低保留） */
  bestMs: number
  /** 历史最少失误（取低保留） */
  bestMistakes: number
}
