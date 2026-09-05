// 拼图盘面纯逻辑单测（测试规范 §3.3 必测：区域状态机 / 吸附落子与让位 / 三区校验 / 帮助与放弃语义）
// 手工构造最小 CutPlan（board 只消费 rows/cols/pieces 网格坐标，与切块算法解耦）
import { describe, it, expect } from 'vitest'
import { JigsawBoard } from '@/games/jigsaw/board'
import type { CutPlan, PieceDef } from '@/engines/jigsaw-cutter/types'

function makePlan(rows: number, cols: number): CutPlan {
  const pieces: PieceDef[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pieces.push({
        index: r * cols + c,
        row: r,
        col: c,
        x: c * 10,
        y: r * 10,
        w: 10,
        h: 10,
        top: null,
        right: null,
        bottom: null,
        left: null,
        score: 50,
        shapeBoost: false,
      })
    }
  }
  return {
    width: cols * 10,
    height: rows * 10,
    params: { rows, cols, tabDepth: 0.16, uniquenessThreshold: 18 },
    seed: 1,
    rowLines: [],
    colLines: [],
    hTabs: [],
    vTabs: [],
    pieces,
    minScore: 50,
    adjusted: 0,
  }
}

describe('初始化与查询', () => {
  it('新盘面：全部块 remaining、current 空、三区非空', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    expect(board.remainingOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(board.currentIndex).toBeNull()
    expect(board.stagingList).toEqual([])
    expect(board.allPlaced()).toBe(false)
    expect(board.isComplete()).toBe(false)
    const { pieces, helps, settled } = board.getState()
    expect(pieces).toHaveLength(9)
    expect(pieces.every((s) => s.zone === 'remaining')).toBe(true)
    expect(helps).toBe(0)
    expect(settled).toBe(false)
  })

  it('pieceAt 非法索引抛 RangeError', () => {
    const board = new JigsawBoard(makePlan(2, 2))
    expect(() => board.pieceAt(4)).toThrow(RangeError)
    expect(() => board.pieceAt(-1)).toThrow(RangeError)
  })
})

describe('pushNext（剩余队列 FIFO 推送）', () => {
  it('依次推送队列首块；current 非空或剩余空时返回 null', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    expect(board.pushNext()).toBe(0)
    expect(board.currentIndex).toBe(0)
    // current 已有块 → 不再推送
    expect(board.pushNext()).toBeNull()
    // 清空 current 后推下一块
    board.placePiece(0, 0, 0)
    expect(board.pushNext()).toBe(1)
    board.placePiece(1, 1, 1)
    board.moveToStaging(1)
    board.promoteFromStaging(1)
    board.placePiece(1, 1, 1)
    // 抽干剩余队列
    for (let i = 2; i < 9; i++) {
      board.pushNext()
      board.placePiece(i, board.plan.pieces[i].row, board.plan.pieces[i].col)
    }
    expect(board.pushNext()).toBeNull()
  })
})

describe('placePiece（网格吸附落子与占用让位）', () => {
  it('空槽落子 ok，块进入 board 并记录槽位', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    const outcome = board.placePiece(4, 1, 1)
    expect(outcome).toEqual({ kind: 'ok' })
    expect(board.getState().pieces[4]).toMatchObject({ zone: 'board', slotRow: 1, slotCol: 1 })
    expect(board.slotOccupant(1, 1)).toBe(4)
  })

  it('目标槽被占：占用块移暂存并返回 ok-displaced（猜错也稳稳卡进，§11.2）', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    board.placePiece(4, 1, 2) // 块 4 错放块 5 的正确位
    const outcome = board.placePiece(5, 1, 2) // 块 5 强占，块 4 让位
    expect(outcome).toEqual({ kind: 'ok-displaced', displacedIndex: 4 })
    expect(board.slotOccupant(1, 2)).toBe(5)
    expect(board.stagingList).toContain(4)
    expect(board.getState().pieces[4]).toMatchObject({ zone: 'staging', slotRow: null, slotCol: null })
  })

  it('占用块恰好放对时仍让位（帮助同款语义）', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    board.placePiece(4, 1, 1) // 放对
    expect(board.isCorrectlyPlaced(4)).toBe(true)
    const outcome = board.placePiece(5, 1, 1) // 强占
    expect(outcome).toEqual({ kind: 'ok-displaced', displacedIndex: 4 })
    expect(board.misplacedOnBoard()).toEqual([5])
  })

  it('同块同槽重复放置幂等 ok；换槽则旧槽自动释放', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    board.placePiece(4, 1, 1)
    expect(board.placePiece(4, 1, 1)).toEqual({ kind: 'ok' })
    expect(board.placePiece(4, 0, 0)).toEqual({ kind: 'ok' })
    expect(board.slotOccupant(1, 1)).toBeNull()
    expect(board.slotOccupant(0, 0)).toBe(4)
  })

  it('槽位越界抛 RangeError', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    expect(() => board.placePiece(0, 3, 0)).toThrow(RangeError)
    expect(() => board.placePiece(0, 0, -1)).toThrow(RangeError)
  })
})

describe('moveToStaging / promoteFromStaging（暂存区往返）', () => {
  it('promoteFromStaging：暂存块升至 current，原 current 退回剩余队列首', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    board.pushNext() // current = 0
    board.moveToStaging(5) // 块 5 从 remaining 直入暂存（纯逻辑层允许）
    board.promoteFromStaging(5)
    expect(board.currentIndex).toBe(5)
    expect(board.remainingOrder).toEqual([0, 1, 2, 3, 4, 6, 7, 8]) // 块 0 回到队首
    // 放下块 5 后再推送 → 应推出退回的块 0
    board.placePiece(5, 0, 2)
    expect(board.pushNext()).toBe(0)
  })

  it('promoteFromStaging 非 staging 块抛错', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    expect(() => board.promoteFromStaging(0)).toThrow(/不在暂存区/)
  })

  it('moveToStaging 清空槽位，盘面块可撤回暂存', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    board.placePiece(4, 1, 1)
    board.moveToStaging(4)
    expect(board.slotOccupant(1, 1)).toBeNull()
    expect(board.stagingList).toEqual([4])
    expect(board.allPlaced()).toBe(false)
  })
})

describe('help（§11.4 帮助语义）', () => {
  it('current 空时自动推出下一块并归位，帮助计数 +1', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    const result = board.help()
    expect(result).toEqual({ pieceIndex: 0 })
    expect(board.isCorrectlyPlaced(0)).toBe(true)
    expect(board.helps).toBe(1)
    expect(board.currentIndex).toBeNull()
  })

  it('正确位被错块占用：错块先移暂存，返回 displacedIndex', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    board.placePiece(8, 0, 0) // 块 8 错占块 0 的正确位
    board.pushNext() // current = 0
    const result = board.help()
    expect(result).toEqual({ pieceIndex: 0, displacedIndex: 8 })
    expect(board.isCorrectlyPlaced(0)).toBe(true)
    expect(board.stagingList).toEqual([8])
  })

  it('无 current 且剩余空时返回 null；结算后帮助不可用', () => {
    const board = new JigsawBoard(makePlan(2, 2))
    expect(board.pushNext()).toBe(0)
    board.placePiece(0, 0, 0)
    expect(board.pushNext()).toBe(1)
    board.placePiece(1, 0, 1)
    expect(board.pushNext()).toBe(2)
    board.placePiece(2, 1, 0)
    expect(board.pushNext()).toBe(3)
    board.placePiece(3, 1, 1)
    // 三区全空 + 全部正确 → 无可帮助对象
    expect(board.isComplete()).toBe(true)
    expect(board.help()).toBeNull()
    board.settle()
    expect(board.getState().settled).toBe(true)
    expect(board.help()).toBeNull()
  })
})

describe('isComplete（三区校验，§11.2）', () => {
  it('全部正确归位 → complete；一块错位 → 不 complete；一块在暂存 → allPlaced false', () => {
    const board = new JigsawBoard(makePlan(2, 2))
    board.placePiece(0, 0, 0)
    board.placePiece(1, 0, 1)
    board.placePiece(2, 1, 0)
    expect(board.allPlaced()).toBe(false)
    board.placePiece(3, 1, 0) // 错位：强占块 2 的槽 → 块 2 让位进暂存
    expect(board.allPlaced()).toBe(false) // 块 2 在暂存区，三区非空
    expect(board.stagingList).toEqual([2])
    expect(board.isComplete()).toBe(false)
    board.placePiece(2, 1, 0) // 块 2 夺回槽位 → 块 3 让位进暂存
    board.placePiece(3, 1, 1) // 块 3 归位自己的空槽
    expect(board.isComplete()).toBe(true)
  })
})

describe('stars（帮助口径：0 帮助 3 星 / ≤总块数 10% 2 星 / 否则 1 星）', () => {
  it('无帮助 3 星；9 块盘 1 次帮助即 1 星（floor(0.9)=0）', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    expect(board.stars()).toBe(3)
    board.help()
    expect(board.stars()).toBe(1)
  })

  it('25 块盘：2 次帮助 2 星，3 次帮助 1 星', () => {
    const board = new JigsawBoard(makePlan(5, 5))
    board.help()
    board.help()
    expect(board.stars()).toBe(2)
    board.help()
    expect(board.stars()).toBe(1)
  })
})

describe('abandonSteps（放弃演示四阶段，§11.3）', () => {
  function mixedBoard(): JigsawBoard {
    // 3×3：块 5 错位在盘面；块 3、7 在暂存；块 0 为 current；其余 remaining
    const board = new JigsawBoard(makePlan(3, 3))
    board.placePiece(5, 2, 1) // 正确位 (1,2)，错放 (2,1)
    board.pushNext() // current = 0
    board.moveToStaging(3)
    board.moveToStaging(7)
    return board
  }

  it('固定顺序：①盘面错块 → ②暂存 → ③当前 → ④剩余；执行后盘面完整', () => {
    const board = mixedBoard()
    const steps = board.abandonSteps()
    expect(steps.map((s) => s.pieceIndex)).toEqual([5, 3, 7, 0, 1, 2, 4, 6, 8])
    // 阶段 ①：块 5 从错误槽 (2,1) 归位 (1,2)
    expect(steps[0]).toMatchObject({
      pieceIndex: 5,
      fromZone: 'board',
      fromSlot: { row: 2, col: 1 },
      toSlot: { row: 1, col: 2 },
      wasCorrect: false,
    })
    // 阶段 ②：暂存块 fromZone='staging' 且无 fromSlot
    expect(steps[1]).toMatchObject({ pieceIndex: 3, fromZone: 'staging', fromSlot: null, toSlot: { row: 1, col: 0 } })
    expect(steps[2]).toMatchObject({ pieceIndex: 7, fromZone: 'staging', toSlot: { row: 2, col: 1 } })
    // 阶段 ③：当前块归位
    expect(steps[3]).toMatchObject({ pieceIndex: 0, fromZone: 'current', toSlot: { row: 0, col: 0 } })
    // 阶段 ④：剩余块按顺序归位
    expect(steps.slice(4).every((s) => s.fromZone === 'remaining')).toBe(true)
    // 演示序列同步状态：执行完即完整拼图
    expect(board.isComplete()).toBe(true)
  })

  it('链式让位：归位时正确位被占的块先移暂存（步骤标记 displacedIndex）', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    board.placePiece(4, 1, 2) // 块 4 错占块 5 的正确位
    board.placePiece(5, 1, 1) // 块 5 错占块 4 的正确位
    const steps = board.abandonSteps()
    expect(steps[0]).toMatchObject({ pieceIndex: 4, displacedIndex: 5, toSlot: { row: 1, col: 1 } })
    // 块 5 被挤到暂存后仍会在序列中归位（在阶段 ① 快照内）
    expect(steps[1]).toMatchObject({ pieceIndex: 5, fromZone: 'staging', toSlot: { row: 1, col: 2 } })
    expect(board.isComplete()).toBe(true)
  })

  it('已放对的块不产生步骤', () => {
    const board = new JigsawBoard(makePlan(3, 3))
    board.placePiece(4, 1, 1) // 放对
    const steps = board.abandonSteps()
    expect(steps.map((s) => s.pieceIndex)).toEqual([0, 1, 2, 3, 5, 6, 7, 8])
    expect(board.isComplete()).toBe(true)
  })

  it('空盘面（全新）产生全部剩余块的归位序列', () => {
    const board = new JigsawBoard(makePlan(2, 2))
    const steps = board.abandonSteps()
    expect(steps).toHaveLength(4)
    expect(steps.every((s) => s.fromZone === 'remaining' && s.fromSlot === null)).toBe(true)
  })
})
