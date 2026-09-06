// 拼图盘面纯逻辑（技术架构 §11.2-§11.4）：区域状态机 + 网格吸附 + 三区校验 + 帮助/放弃
// 无 DOM / 无 Canvas：渲染层（instance.ts）只消费状态与操作结果；全部语义可单测。

import type { CutPlan } from '@/engines/jigsaw-cutter'
import { createRng } from '@/engines/rng'

/** 推出顺序洗牌盐（与切块锯齿的 rng 流隔离：换切法 = 换锯齿形态 + 换块推出顺序） */
const DECK_SALT = 0x9e3779b9

/** Fisher-Yates 确定性洗牌（验收四轮一：块推出顺序不再从左到右、从上到下） */
export function shuffleDeck(count: number, rng: { next(): number }): number[] {
  const deck = Array.from({ length: count }, (_, i) => i)
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const t = deck[i]!
    deck[i] = deck[j]!
    deck[j] = t
  }
  return deck
}

/** 块所在区域（五区布局中块的四种归属） */
export type PieceZone = 'remaining' | 'current' | 'staging' | 'board'

export interface BoardPieceState {
  index: number
  zone: PieceZone
  /** zone='board' 时的槽位（盘面网格行/列）；其余为 null */
  slotRow: number | null
  slotCol: number | null
}

/** 放置结果语义 */
export type PlaceOutcome =
  | { kind: 'ok' }
  /** 目标槽被占用：占用块移入暂存区，目标块入槽（猜错也稳稳卡进，§11.2）
   *  occupiedIndex 仅在占用块为「错位块」时有意义；占用块恰好放对时仍让位（帮助语义同款） */
  | { kind: 'ok-displaced'; displacedIndex: number }

export interface AbandonStep {
  pieceIndex: number
  fromZone: PieceZone
  fromSlot: { row: number; col: number } | null
  toSlot: { row: number; col: number }
  /** 原本就放在正确位（演示时高亮标记，§11.3 ①） */
  wasCorrect: boolean
  /** 正确位被占用时先让位的块（移入暂存） */
  displacedIndex?: number
}

export interface HelpResult {
  pieceIndex: number
  displacedIndex?: number
}

/**
 * 拼图盘面：管理全部块的区域归属与槽位。
 * 生命周期 = 一关游戏；pieces 顺序与 CutPlan 对齐；推出顺序由 deck 决定
 * （验收四轮一：缺省 = plan.seed 派生确定性洗牌，不再从左到右上到下；测试可显式注入）。
 */
export class JigsawBoard {
  readonly plan: CutPlan
  readonly rows: number
  readonly cols: number
  private states: BoardPieceState[]
  /** 剩余队列推出顺序（全排列；remaining 按此序展示与推出） */
  private deck: number[]
  private helpsUsed = 0
  private settled = false

  constructor(plan: CutPlan, deck?: number[]) {
    this.plan = plan
    this.rows = plan.params.rows
    this.cols = plan.params.cols
    this.states = plan.pieces.map((p) => ({
      index: p.index,
      zone: 'remaining',
      slotRow: null,
      slotCol: null,
    }))
    this.deck = deck ?? shuffleDeck(this.states.length, createRng(plan.seed ^ DECK_SALT))
  }

  // ---- 查询 ----

  getState(): { pieces: readonly BoardPieceState[]; helps: number; settled: boolean } {
    return { pieces: this.states, helps: this.helpsUsed, settled: this.settled }
  }

  /** 当前块 index（右上区一次至多一块；null = 空） */
  get currentIndex(): number | null {
    const found = this.states.find((s) => s.zone === 'current')
    return found ? found.index : null
  }

  /** 剩余队列（按 deck 推出顺序；洗牌后不再从左到右上到下） */
  get remainingOrder(): number[] {
    return this.deck.filter((i) => this.pieceAt(i).zone === 'remaining')
  }

  /** 暂存区块列表 */
  get stagingList(): number[] {
    return this.states.filter((s) => s.zone === 'staging').map((s) => s.index)
  }

  pieceAt(index: number): BoardPieceState {
    const state = this.states[index]
    if (!state) throw new RangeError(`jigsaw: 非法块索引 ${index}`)
    return state
  }

  /** 块是否放在自己的正确槽位（源图网格位 = 盘面正确位） */
  isCorrectlyPlaced(index: number): boolean {
    const s = this.pieceAt(index)
    const p = this.plan.pieces[index]
    return s.zone === 'board' && s.slotRow === p.row && s.slotCol === p.col
  }

  /** 槽位占用者（null = 空槽） */
  slotOccupant(row: number, col: number): number | null {
    const found = this.states.find((s) => s.zone === 'board' && s.slotRow === row && s.slotCol === col)
    return found ? found.index : null
  }

  /** 盘面上错位的块（校验高亮 / 放弃演示 ① 的输入） */
  misplacedOnBoard(): number[] {
    return this.states
      .filter((s) => s.zone === 'board')
      .map((s) => s.index)
      .filter((i) => !this.isCorrectlyPlaced(i))
  }

  /** 三区（剩余/当前/暂存）是否全空 → 触发完整性校验的时机条件 */
  allPlaced(): boolean {
    return this.states.every((s) => s.zone === 'board')
  }

  /** 完整性校验：三区全空且全部正确 → 结算 */
  isComplete(): boolean {
    return this.allPlaced() && this.states.every((s) => this.isCorrectlyPlaced(s.index))
  }

  // ---- 操作（渲染层调用） ----

  /** 推送剩余队列首块到当前位（右上区空闲时）；返回推送的块或 null */
  pushNext(): number | null {
    if (this.currentIndex !== null) return null
    const next = this.remainingOrder[0]
    if (next === undefined) return null
    this.pieceAt(next).zone = 'current'
    return next
  }

  /** 块放置到槽位（网格级吸附后的落子）；目标槽被占时占用块移暂存（§11.2 猜与重摆） */
  placePiece(index: number, row: number, col: number): PlaceOutcome {
    this.assertRowCol(row, col)
    const s = this.pieceAt(index)
    if (s.zone === 'board' && s.slotRow === row && s.slotCol === col) return { kind: 'ok' }
    const occupant = this.slotOccupant(row, col)
    let displaced: number | undefined
    if (occupant !== null && occupant !== index) {
      const os = this.pieceAt(occupant)
      os.zone = 'staging'
      os.slotRow = null
      os.slotCol = null
      displaced = occupant
    }
    s.zone = 'board'
    s.slotRow = row
    s.slotCol = col
    return displaced === undefined ? { kind: 'ok' } : { kind: 'ok-displaced', displacedIndex: displaced }
  }

  /** 块移入暂存区（左下） */
  moveToStaging(index: number): void {
    const s = this.pieceAt(index)
    s.zone = 'staging'
    s.slotRow = null
    s.slotCol = null
  }

  /** 从暂存区取块到当前位；原当前块（若有）退回剩余队列首（保持一次一块） */
  promoteFromStaging(index: number): void {
    const s = this.pieceAt(index)
    if (s.zone !== 'staging') throw new Error(`jigsaw: 块 ${index} 不在暂存区`)
    const cur = this.currentIndex
    if (cur !== null) {
      this.pieceAt(cur).zone = 'remaining'
      this.deck = [cur, ...this.deck.filter((i) => i !== cur)]
    }
    s.zone = 'current'
  }

  /** 结算锁定（渲染层在 onComplete/onAbandon 后调用）：帮助不再可用 */
  settle(): void {
    this.settled = true
  }

  /** 帮助（§11.4）：当前块自动放正确位；正确位被错块占用时该块先移暂存；帮助次数 +1 */
  help(): HelpResult | null {
    if (this.settled) return null
    let target = this.currentIndex
    if (target === null) {
      target = this.pushNext()
      if (target === null) return null
    }
    this.helpsUsed++
    const piece = this.plan.pieces[target]
    const result = this.placePiece(target, piece.row, piece.col)
    return { pieceIndex: target, displacedIndex: result.kind === 'ok-displaced' ? result.displacedIndex : undefined }
  }

  /**
   * 放弃演示步骤序列（§11.3 固定顺序）：
   * ① 盘面错块逐个修正 → ② 暂存块归位（含阶段①被挤入暂存的块）→ ③ 当前块归位 → ④ 剩余块依次归位。
   * 纯计算（验收四轮九）：影子盘面预演，不改真实状态 —— 播放时经 applyAbandonStep 逐步落子，
   * 避免「盘面先铺满再逐块覆盖」；已放对的块不产生步骤；正确位被占时占用块先移暂存（步骤内标记）。
   */
  abandonSteps(): AbandonStep[] {
    const steps: AbandonStep[] = []
    const piece = (i: number) => this.plan.pieces[i]!
    const correctSlot = (i: number) => ({ row: piece(i).row, col: piece(i).col })

    // 影子盘面（预演专用：与 placePiece 让位语义同构）
    const zone: PieceZone[] = this.states.map((s) => s.zone)
    const slotRow: (number | null)[] = this.states.map((s) => s.slotRow)
    const slotCol: (number | null)[] = this.states.map((s) => s.slotCol)
    const occupantOf = (row: number, col: number): number | null => {
      for (let i = 0; i < zone.length; i++) {
        if (zone[i] === 'board' && slotRow[i] === row && slotCol[i] === col) return i
      }
      return null
    }
    const shadowPlace = (i: number, row: number, col: number): number | undefined => {
      const occ = occupantOf(row, col)
      let displaced: number | undefined
      if (occ !== null && occ !== i) {
        zone[occ] = 'staging'
        slotRow[occ] = null
        slotCol[occ] = null
        displaced = occ
      }
      zone[i] = 'board'
      slotRow[i] = row
      slotCol[i] = col
      return displaced
    }

    // 阶段①④输入快照；阶段②取预演现势暂存区（初始暂存 + 阶段①被挤入的，不重不漏）
    const misplaced: number[] = []
    const initialStaging: number[] = []
    for (let i = 0; i < zone.length; i++) {
      if (zone[i] === 'board' && !(slotRow[i] === piece(i).row && slotCol[i] === piece(i).col)) {
        misplaced.push(i)
      } else if (zone[i] === 'staging') {
        initialStaging.push(i)
      }
    }
    const current = this.currentIndex
    const remaining = [...this.remainingOrder]

    const emit = (i: number): void => {
      // 已被前序步骤归位的块不重复产生步骤（旧语义「已放对不动」）
      if (zone[i] === 'board' && slotRow[i] === piece(i).row && slotCol[i] === piece(i).col) return
      const fromZone = zone[i]!
      const fromSlot = fromZone === 'board' && slotRow[i] !== null && slotCol[i] !== null
        ? { row: slotRow[i]!, col: slotCol[i]! }
        : null
      const slot = correctSlot(i)
      const displaced = shadowPlace(i, slot.row, slot.col)
      steps.push({
        pieceIndex: i,
        fromZone,
        fromSlot,
        toSlot: slot,
        wasCorrect: false,
        ...(displaced !== undefined ? { displacedIndex: displaced } : {}),
      })
    }

    for (const i of misplaced) emit(i)
    const stagingNow: number[] = []
    for (let i = 0; i < zone.length; i++) if (zone[i] === 'staging') stagingNow.push(i)
    for (const i of [...initialStaging, ...stagingNow.filter((i) => !initialStaging.includes(i))]) emit(i)
    if (current !== null) emit(current)
    for (const i of remaining) emit(i)
    return steps
  }

  /** 播放一步放弃演示（验收四轮九）：真实落子（含让位），与 abandonSteps 预演同构 */
  applyAbandonStep(step: AbandonStep): void {
    this.placePiece(step.pieceIndex, step.toSlot.row, step.toSlot.col)
  }

  /** 帮助次数星级（口径与 keygame 失误一致：0 帮助 3 星、≤总块数 10% 2 星、否则 1 星） */
  stars(): 1 | 2 | 3 {
    if (this.helpsUsed <= 0) return 3
    if (this.helpsUsed <= Math.floor((this.rows * this.cols) * 0.1)) return 2
    return 1
  }

  get helps(): number {
    return this.helpsUsed
  }

  private assertRowCol(row: number, col: number): void {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      throw new RangeError(`jigsaw: 槽位越界 (${row}, ${col})`)
    }
  }
}
