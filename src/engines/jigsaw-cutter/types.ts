// 切块引擎类型契约（技术架构 §11.6 / §14.5）
// 纯数据可序列化：CutPlan 只含数字与数组，存档/方案中可整体持久化并确定性复现
// 引擎不碰 DOM：图像数据经 ImageDataLike 注入（Canvas 像素采样由调用方完成）

/** 引擎所需的最小图像接口（ImageData 的 Pick，便于测试合成注入） */
export interface ImageDataLike {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array
}

/** 切块参数（rows/cols 由关卡难度决定） */
export interface CutParams {
  /** 目标网格行数（2-12，超界钳制） */
  rows: number
  /** 目标网格列数（2-12，超界钳制） */
  cols: number
  /** 锯齿深度占相邻块短边比例（0.08-0.25，默认 0.16） */
  tabDepth?: number
  /** 块区分度阈值（0-100，默认 18）：低于阈值的块触发切割线调整/形状强化兜底 */
  uniquenessThreshold?: number
}

export interface RequiredCutParams extends Required<CutParams> {}

/** 一条内部切割线的锯齿规格（线两侧块共享同一引用，凸凹互补在几何层翻转） */
export interface TabSpec {
  /** 'h' = 水平切割线（分隔上下块，at 为 y 坐标）；'v' = 垂直切割线（at 为 x 坐标） */
  dir: 'h' | 'v'
  /** 线坐标（像素） */
  at: number
  /** 沿线分段数（每段一个锯齿） */
  segments: number
  /** 每段形态：1 凸 / -1 凹 / 0 平（相对基准矩形；对线另一侧符号取反） */
  pattern: number[]
  /** 每段深度系数（0.6-1.4，乘以 baseDepth） */
  depths: number[]
  /** 基础深度比例（CutParams.tabDepth 固化到线规格，渲染时免传参） */
  baseDepth: number
}

/** 块定义（矩形区域 + 四边锯齿引用 + 区分度评分） */
export interface PieceDef {
  index: number
  row: number
  col: number
  /** 源图矩形（像素坐标） */
  x: number
  y: number
  w: number
  h: number
  /** 四边锯齿（null = 图像外边缘，直线） */
  top: TabSpec | null
  right: TabSpec | null
  bottom: TabSpec | null
  left: TabSpec | null
  /** 视觉区分度评分（0-100，越高越易与其他块区分） */
  score: number
  /** 形状强化兜底标记：区分度仍不达标时加深该块锯齿（形状即线索） */
  shapeBoost: boolean
}

/** 切块方案（确定性产物：同图 + 同参数 + 同种子 → 同方案） */
export interface CutPlan {
  width: number
  height: number
  params: RequiredCutParams
  seed: number
  /** 行切割线 y 坐标（含 0 与 height，长度 = rows + 1，单调递增） */
  rowLines: number[]
  /** 列切割线 x 坐标（含 0 与 width，长度 = cols + 1） */
  colLines: number[]
  /** 内部切割线锯齿规格（h: 行内线；v: 列内线；外边缘无线） */
  hTabs: TabSpec[]
  vTabs: TabSpec[]
  /** 块列表（index = row * cols + col，共 rows × cols 个） */
  pieces: PieceDef[]
  /** 全部块最低区分度评分 */
  minScore: number
  /** 唯一性校验执行的切割线调整轮次 */
  adjusted: number
}
