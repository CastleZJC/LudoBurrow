// 拼图游戏实例（技术架构 §11.2-§11.4 / 开发计划 3.3-3.5）
// Canvas 五区渲染 + Pointer Events 拖拽 + 网格级吸附 + 帮助/放弃分步演示。
// 验收返工（布局零失真）：参考图/块缩略恒等比 contain；拖拽按拼板槽位原尺寸；参考图点击弹框放大。
// 渲染坐标/布局/命中全部经 layout.ts 纯函数；盘面语义全部委托 board.ts（本层不含玩法规则）。
// 图片解析双轨（gallery.ts）：分析缩略图（data URI，切块引擎输入）+ 源图（相对路径，仅绘制）。
// 测试注入：deps { analysisImage, sourceImage } 完全绕开资源加载。

import type { BaseLevelConfig, GameHooks, GameInstance } from '@/core/types'
import { createCutPlan, type CutPlan, type CutParams, type ImageDataLike } from '@/engines/jigsaw-cutter'
import { createCutPlanFromSuggestion, normalizeSuggestion } from '@/engines/jigsaw-cutter/suggest'
import { i18n } from '@/i18n'
import { getEnvAdapter } from '@/services'
import { JigsawBoard } from './board'
import { downscaleToAnalysis, galleryEntry, loadAnalysisImage, loadSourceImage, sourceSrc } from './gallery'
import { buildPieceOutline } from './pieces'
import {
  boardContentRect,
  computeLayout,
  fitRectAspect,
  hitTestSlot,
  pointInRect,
  slotRect,
  type Rect,
  type ZoneRects,
} from './layout'
import type { JigsawLevelConfig } from './level'

/** 挂载依赖注入（测试用；生产缺省走 gallery 资源加载） */
export interface JigsawMountDeps {
  analysisImage?: ImageDataLike
  sourceImage?: CanvasImageSource & { width: number; height: number }
  /** 剩余队列推出顺序（测试注入；缺省 = seed 派生确定性洗牌，验收四轮一） */
  deck?: number[]
}

type Phase = 'loading' | 'idle' | 'running' | 'paused' | 'demo' | 'done' | 'destroyed'

interface Flight {
  index: number
  from: { x: number; y: number }
  to: { x: number; y: number }
  start: number
  dur: number
}

/** 帮助/放弃演示动画时长（v1.0 验收返工：240 → 1000，慢速可看清去向） */
const DEMO_STEP_MS = 1000
/** 帮助让位块（被挤入暂存）动画：快于主飞行，先让位后落位的层次感 */
const DISPLACE_MS = 600

function el(tag: string, cls?: string): HTMLElement {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  return node
}

export function mountJigsaw(
  container: HTMLElement,
  level: BaseLevelConfig,
  hooks: GameHooks,
  deps: JigsawMountDeps = {},
): GameInstance {
  const cfg = level as JigsawLevelConfig
  let phase: Phase = 'loading'
  let pendingStart = false
  let dirty = true

  // ---- DOM 骨架（HUD + 画布；资源就绪前画布显示 loading）----
  const root = el('div', 'jg-root')
  const hud = el('div', 'jg-hud')
  const gridEl = el('span', 'jg-grid')
  gridEl.dataset.jg = 'grid'
  const helpsEl = el('span', 'jg-helps')
  helpsEl.dataset.jg = 'helps'
  const progressEl = el('span', 'jg-progress')
  progressEl.dataset.jg = 'progress'
  const helpBtn = document.createElement('button')
  helpBtn.className = 'jg-btn'
  helpBtn.type = 'button'
  helpBtn.dataset.jg = 'help'
  helpBtn.textContent = i18n.global.t('jigsaw.help')
  const abandonBtn = document.createElement('button')
  abandonBtn.className = 'jg-btn jg-btn-warn'
  abandonBtn.type = 'button'
  abandonBtn.dataset.jg = 'abandon'
  abandonBtn.textContent = i18n.global.t('jigsaw.abandon')
  hud.append(gridEl, helpsEl, progressEl, helpBtn, abandonBtn)

  const canvas = el('canvas', 'jg-canvas') as HTMLCanvasElement
  root.append(hud, canvas)
  container.appendChild(root)

  const ctxMaybe = canvas.getContext('2d')
  if (!ctxMaybe) {
    phase = 'destroyed'
    showError(i18n.global.t('jigsaw.loadError'))
    return stubInstance()
  }
  const ctx = ctxMaybe

  // ---- 尺寸 / 布局 ----
  let cssW = Math.max(container.clientWidth || 0, 960)
  let cssH = Math.max(container.clientHeight || 0, 600)
  let rects: ZoneRects = computeLayout(cssW, cssH)
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1

  let board: JigsawBoard | null = null
  let plan: CutPlan | null = null
  let source: CanvasImageSource & { width: number; height: number } | null = null
  let hiScale = 1
  const pieceCanvases = new Map<number, HTMLCanvasElement>()
  const pieceOutlines = new Map<number, ReturnType<typeof buildPieceOutline>>()
  const timers: ReturnType<typeof setTimeout>[] = []
  let rafId = 0
  let flights: Flight[] = []
  let drag: { index: number; fromZone: string; x: number; y: number } | null = null
  let hoverSlot: { row: number; col: number } | null = null
  let misplacedFlashUntil = 0
  /** 飞行结束后强制续渲窗口（反馈 2.4 二轮：不依赖到期帧 dirty 记账的结构性兜底） */
  let dirtyUntil = 0
  /** 参考图放大弹框（点击左上缩略图开/关，验收返工「布局零失真」） */
  let previewZoom = false

  function showError(msg: string): void {
    const err = el('div', 'jg-error')
    err.dataset.jg = 'error'
    err.textContent = msg
    root.appendChild(err)
  }

  function refreshHud(): void {
    if (!board || !plan) return
    // 方案模式 rows ≠ cols 时直接拼数字（语言无关）
    const { rows, cols } = plan.params
    gridEl.textContent = rows === cols
      ? i18n.global.t('jigsaw.grid', { n: rows })
      : `${rows}×${cols}`
    helpsEl.textContent = i18n.global.t('jigsaw.helps', { n: board.helps })
    const done = board.getState().pieces.filter((s) => board!.isCorrectlyPlaced(s.index)).length
    progressEl.textContent = `${done}/${plan.pieces.length}`
  }

  // ---- 块位图预渲染（源图分辨率 clip 轮廓，屏幕绘制按比例缩放）----
  function buildPieceBitmaps(): void {
    if (!plan || !source) return
    const tabPx = plan.params.tabDepth * (Math.min(plan.width, plan.height) / Math.max(plan.params.rows, plan.params.cols))
    for (const piece of plan.pieces) {
      const outline = buildPieceOutline(piece, plan, tabPx)
      pieceOutlines.set(piece.index, outline)
      const w = Math.ceil(outline.bounds.w * hiScale) + 2
      const h = Math.ceil(outline.bounds.h * hiScale) + 2
      const pc = document.createElement('canvas')
      pc.width = Math.max(1, w)
      pc.height = Math.max(1, h)
      const pctx = pc.getContext('2d')
      if (!pctx) continue
      pctx.save()
      pctx.scale(hiScale, hiScale)
      pctx.translate(1 / hiScale - outline.bounds.x, 1 / hiScale - outline.bounds.y)
      pctx.beginPath()
      outline.points.forEach((p, i) => (i === 0 ? pctx.moveTo(p.x, p.y) : pctx.lineTo(p.x, p.y)))
      pctx.closePath()
      pctx.clip()
      pctx.imageSmoothingEnabled = true
      pctx.imageSmoothingQuality = 'high'
      pctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, plan.width, plan.height)
      pctx.restore()
      // 轮廓描边（拼合线索：细线轻描——反馈 4.2：1.2/0.45 粗线致边缘糊且失真）
      pctx.save()
      pctx.scale(hiScale, hiScale)
      pctx.translate(1 / hiScale - outline.bounds.x, 1 / hiScale - outline.bounds.y)
      pctx.beginPath()
      outline.points.forEach((p, i) => (i === 0 ? pctx.moveTo(p.x, p.y) : pctx.lineTo(p.x, p.y)))
      pctx.closePath()
      pctx.lineWidth = 0.7
      pctx.strokeStyle = 'rgba(0,0,0,0.35)'
      pctx.stroke()
      pctx.restore()
      pieceCanvases.set(piece.index, pc)
    }
  }

  // ---- 各区块的屏幕矩形（稳定位置）----
  function contentRect(): Rect {
    return boardContentRect(rects.board, plan!)
  }

  function pieceHomeRect(index: number): Rect {
    if (!board || !plan) return { x: 0, y: 0, w: 0, h: 0 }
    const s = board.pieceAt(index)
    const content = contentRect()
    if (s.zone === 'board' && s.slotRow !== null && s.slotCol !== null) {
      return slotRect(content, plan, s.slotRow, s.slotCol)
    }
    // 等比适配（验收返工：块缩略零失真——槽盒按块宽高比 contain，不再硬拉成正方形）
    if (s.zone === 'current') return fitRectAspect(fitInto(currentHome(), 0.9), plan.pieces[index]!.w, plan.pieces[index]!.h)
    if (s.zone === 'staging') return stagingSlotRect(s.index)
    return remainingSlotRect(s.index)
  }

  function currentHome(): Rect {
    return rects.current
  }

  /** 暂存区第 k 个槽（k = 暂存列表序）：槽盒 58²，块按宽高比等比缩略居中 */
  function stagingSlotRect(index: number): Rect {
    const list = board!.stagingList
    const k = Math.max(0, list.indexOf(index))
    const cols = Math.max(1, Math.floor(rects.staging.w / 66))
    const cx = rects.staging.x + 6 + (k % cols) * 66
    const cy = rects.staging.y + 6 + Math.floor(k / cols) * 66
    const p = plan!.pieces[index]!
    return fitRectAspect({ x: cx, y: cy, w: 58, h: 58 }, p.w, p.h)
  }

  /** 剩余区缩略示意（剩余队列序；列数按剩余区宽度自适应）：槽盒 34²，块按宽高比等比缩略居中 */
  function remainingSlotRect(index: number): Rect {
    const order = board!.remainingOrder
    const k = Math.max(0, order.indexOf(index))
    const cols = Math.max(1, Math.floor(rects.remaining.w / 40))
    const cx = rects.remaining.x + 6 + (k % cols) * 40
    const cy = rects.remaining.y + 6 + Math.floor(k / cols) * 40
    const p = plan!.pieces[index]!
    return fitRectAspect({ x: cx, y: cy, w: 34, h: 34 }, p.w, p.h)
  }

  /** 区盒内缩（ratio 比例；只缩盒不失真——图片绘制前还需 fitRectAspect 等比适配） */
  function fitInto(rect: Rect, ratio: number): Rect {
    const w = rect.w * ratio
    const h = rect.h * ratio
    return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h }
  }

  /** 块位图屏幕矩形：块矩形 target 外扩锯齿区（图坐标 bounds 相对块矩形的偏移按屏幕比例换算） */
  function pieceBitmapRect(index: number, target: Rect): Rect {
    const outline = pieceOutlines.get(index)
    if (!outline || !plan) return target
    const piece = plan.pieces[index]
    const kx = target.w / piece.w
    const ky = target.h / piece.h
    return {
      x: target.x - (piece.x - outline.bounds.x) * kx,
      y: target.y - (piece.y - outline.bounds.y) * ky,
      w: outline.bounds.w * kx,
      h: outline.bounds.h * ky,
    }
  }

  function drawPiece(index: number, target: Rect): void {
    const pc = pieceCanvases.get(index)
    if (!pc) return
    const r = pieceBitmapRect(index, target)
    ctx.drawImage(pc, r.x, r.y, r.w, r.h)
  }

  // ---- 渲染 ----
  function render(ts: number): void {
    ctx.clearRect(0, 0, cssW, cssH)
    if (!board || !plan || !source) return

    // 左上效果图（等比清晰缩略 + 点击放大弹框，验收返工「布局零失真」）
    const pv = fitRectAspect(fitInto(rects.preview, 0.96), source.width, source.height)
    ctx.drawImage(source, 0, 0, source.width, source.height, pv.x, pv.y, pv.w, pv.h)
    ctx.strokeStyle = '#8a8f98'
    ctx.lineWidth = 1
    ctx.strokeRect(pv.x, pv.y, pv.w, pv.h)
    ctx.fillStyle = 'rgba(90, 96, 108, 0.95)'
    ctx.font = '12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(
      i18n.global.t('jigsaw.previewHint'),
      rects.preview.x + rects.preview.w / 2,
      Math.min(rects.preview.y + rects.preview.h - 8, pv.y + pv.h + 16),
    )
    ctx.textAlign = 'left'

    // 中间拼图区：底座网格（非均匀切割线）
    const content = contentRect()
    ctx.fillStyle = '#f4f5f7'
    ctx.fillRect(content.x, content.y, content.w, content.h)
    ctx.save()
    ctx.beginPath()
    ctx.strokeStyle = '#d4d7dc'
    ctx.lineWidth = 1
    for (let r = 1; r < plan.params.rows; r++) {
      const y = content.y + (plan.rowLines[r] / plan.height) * content.h
      ctx.moveTo(content.x, y)
      ctx.lineTo(content.x + content.w, y)
    }
    for (let c = 1; c < plan.params.cols; c++) {
      const x = content.x + (plan.colLines[c] / plan.width) * content.w
      ctx.moveTo(x, content.y)
      ctx.lineTo(x, content.y + content.h)
    }
    ctx.stroke()
    ctx.restore()
    ctx.strokeStyle = '#a8adb5'
    ctx.strokeRect(content.x, content.y, content.w, content.h)

    // 吸附悬停槽高亮
    if (drag && hoverSlot) {
      const r = slotRect(content, plan, hoverSlot.row, hoverSlot.col)
      ctx.fillStyle = 'rgba(58,110,165,0.18)'
      ctx.fillRect(r.x, r.y, r.w, r.h)
    }

    // 盘面块（跳过飞行/拖拽中的）
    for (const s of board.getState().pieces) {
      if (s.zone !== 'board') continue
      if (isInFlightOrDrag(s.index)) continue
      drawPiece(s.index, pieceHomeRect(s.index))
    }

    // 错位闪烁（三区全空但有错位时的校验提示）
    if (ts < misplacedFlashUntil && Math.floor((misplacedFlashUntil - ts) / 240) % 2 === 0) {
      ctx.save()
      ctx.strokeStyle = '#c0392b'
      ctx.lineWidth = 2
      for (const i of board.misplacedOnBoard()) {
        const r = pieceHomeRect(i)
        ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4)
      }
      ctx.restore()
    }

    // 区框：暂存 / 当前 / 剩余
    drawZoneFrame(rects.staging, '#8a8f98')
    drawZoneFrame(rects.current, '#3a6ea5')
    drawZoneFrame(rects.remaining, '#8a8f98')

    // 暂存块 / 当前块 / 剩余块
    for (const i of board.stagingList) {
      if (isInFlightOrDrag(i)) continue
      drawPiece(i, pieceHomeRect(i))
    }
    const cur = board.currentIndex
    if (cur !== null && !isInFlightOrDrag(cur)) {
      const r = pieceHomeRect(cur)
      drawPiece(cur, r)
    }
    for (const i of board.remainingOrder) {
      if (isInFlightOrDrag(i)) continue
      drawPiece(i, pieceHomeRect(i))
    }

    // 飞行块（插值位置；尺寸取终点块位图矩形 × 轻微拋物缩放）
    // A1：飞行到期的帧静态层尚未绘制该块（isInFlightOrDrag 命中旧数组）→ 置 dirty 下一帧补绘；tick 先清后画保证该 dirty 不被吞
    const aliveFlights = flights.filter((f) => ts - f.start < f.dur)
    if (aliveFlights.length !== flights.length) dirty = true
    flights = aliveFlights
    for (const f of flights) {
      const t = Math.min(1, (ts - f.start) / f.dur)
      const ease = t * (2 - t) // easeOutQuad
      const pc = pieceCanvases.get(f.index)
      if (!pc) continue
      const bmp = pieceBitmapRect(f.index, pieceHomeRect(f.index))
      const scaleT = 1 + 0.15 * Math.sin(Math.PI * t)
      const w = bmp.w * scaleT
      const h = bmp.h * scaleT
      const cx = f.from.x + (f.to.x - f.from.x) * ease
      const cy = f.from.y + (f.to.y - f.from.y) * ease
      ctx.drawImage(pc, cx - w / 2, cy - h / 2, w, h)
    }

    // 拖拽块：按拼板槽位原尺寸绘制（从缩略区拿起放大回实际大小，与吸附槽零缩放跳变）
    if (drag) {
      const pc = pieceCanvases.get(drag.index)
      if (pc) {
        const piece = plan.pieces[drag.index]!
        const dragContent = contentRect()
        const bmp = pieceBitmapRect(drag.index, {
          x: 0,
          y: 0,
          w: (piece.w / plan.width) * dragContent.w,
          h: (piece.h / plan.height) * dragContent.h,
        })
        ctx.drawImage(pc, drag.x - bmp.w / 2, drag.y - bmp.h / 2, bmp.w, bmp.h)
      }
    }

    // 参考图放大弹框：遮罩 + 居中等比大图（点击任意处关闭）
    if (previewZoom) {
      ctx.fillStyle = 'rgba(15, 18, 24, 0.85)'
      ctx.fillRect(0, 0, cssW, cssH)
      const big = fitRectAspect(
        { x: 56, y: 56, w: Math.max(40, cssW - 112), h: Math.max(40, cssH - 112) },
        source.width,
        source.height,
      )
      ctx.drawImage(source, 0, 0, source.width, source.height, big.x, big.y, big.w, big.h)
      ctx.strokeStyle = '#8a8f98'
      ctx.lineWidth = 2
      ctx.strokeRect(big.x, big.y, big.w, big.h)
      ctx.fillStyle = '#e8eaee'
      ctx.font = '14px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(
        i18n.global.t('jigsaw.previewClose'),
        cssW / 2,
        Math.min(cssH - 20, big.y + big.h + 28),
      )
      ctx.textAlign = 'left'
    }
  }

  function drawZoneFrame(rect: Rect, color: string): void {
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
  }

  function isInFlightOrDrag(index: number): boolean {
    if (drag && drag.index === index) return true
    return flights.some((f) => f.index === index)
  }

  function tick(ts: number): void {
    if (phase === 'destroyed') return
    if (dirty || flights.length > 0 || drag || ts < misplacedFlashUntil || ts < dirtyUntil) {
      dirty = false // 先清后画：render 内「飞行到期」补设的 dirty 保留到下一帧，触发一次补绘（A1 根治）
      render(ts)
    }
    rafId = requestAnimationFrame(tick)
  }

  // ---- 结算 / 进度 ----
  function reportProgress(): void {
    if (!board || !plan) return
    const done = board.getState().pieces.filter((s) => board!.isCorrectlyPlaced(s.index)).length
    hooks.onProgress({ gameId: 'jigsaw', n: cfg.n, done, total: plan.pieces.length })
  }

  function finish(): void {
    phase = 'done'
    board!.settle()
    refreshHud()
    reportProgress()
    hooks.onComplete({
      gameId: 'jigsaw',
      n: cfg.n,
      elapsedMs: 0,
      mistakes: board!.helps,
      stars: board!.stars(),
      meta: { helps: board!.helps },
    })
  }

  /** 落子后统一检查：三区全空 → 全对结算 / 有错位闪烁提示（§11.2.4 校验时机） */
  function afterPlace(): void {
    if (!board) return
    refreshHud()
    reportProgress()
    if (board.allPlaced()) {
      if (board.isComplete()) {
        finish()
      } else {
        misplacedFlashUntil = performance.now() + 1600
        dirty = true
      }
    }
  }

  function centerOf(rect: Rect): { x: number; y: number } {
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
  }

  function pushFlight(index: number, from: Rect, to: Rect, dur: number): void {
    flights.push({ index, from: centerOf(pieceBitmapRect(index, from)), to: centerOf(pieceBitmapRect(index, to)), start: performance.now(), dur })
    // 到期后仍强制续渲一个窗口：静态层补绘链即使被任何 rAF/dirty 时序吞掉，窗口内每帧重绘兜底（反馈 2.4）
    const until = performance.now() + dur + 150
    if (until > dirtyUntil) dirtyUntil = until
    dirty = true
  }

  // ---- 帮助（§11.4）----
  function onHelpClick(): void {
    if (phase !== 'running' || !board || !plan) return
    // 先快照后改状态：from 位置在 board.help() 改变盘面前记录
    let target = board.currentIndex
    let fromRect: Rect
    if (target === null) {
      const next = board.remainingOrder[0]
      if (next === undefined) return
      target = next
      fromRect = remainingSlotRect(next)
    } else {
      fromRect = pieceHomeRect(target)
    }
    // 预判让位块：目标块正确槽的占用者将先移暂存（§11.4）
    const targetPiece = plan.pieces[target]
    const occupant = board.slotOccupant(targetPiece.row, targetPiece.col)
    const occupantBefore = occupant !== null && occupant !== target ? pieceHomeRect(occupant) : null

    const result = board.help()
    if (!result) return
    // A2：先快照下一块的剩余槽位（pushNext 会把它移出 remaining，之后位置计算错位）
    const nextUp = board.remainingOrder[0]
    const nextFrom = nextUp !== undefined ? remainingSlotRect(nextUp) : null
    if (result.displacedIndex !== undefined && occupantBefore) {
      pushFlight(result.displacedIndex, occupantBefore, pieceHomeRect(result.displacedIndex), DISPLACE_MS)
    }
    pushFlight(result.pieceIndex, fromRect, pieceHomeRect(result.pieceIndex), DEMO_STEP_MS)
    // A2：帮助落位后自动续推下一块（对齐拖拽路径 onPointerUp 的 pushNext，反馈 6；一次帮助只计一次）
    if (nextUp !== undefined && nextFrom) {
      const pushed = board.pushNext()
      if (pushed !== null) pushFlight(pushed, nextFrom, pieceHomeRect(pushed), DEMO_STEP_MS)
    }
    refreshHud()
    reportProgress()
    if (board.isComplete()) finish()
  }

  // ---- 放弃演示（§11.3 四阶段；验收四轮九：逐步真实落子，不再「先铺满再逐块覆盖」）----
  function onAbandonClick(): void {
    if (phase !== 'running' || !board || !plan) return
    phase = 'demo'
    helpBtn.disabled = true
    abandonBtn.disabled = true
    const content = contentRect()
    const steps = board.abandonSteps()

    const playStep = (k: number): void => {
      if (k >= steps.length) {
        // A3：演示播完复用正常完成结算链（onComplete → finishWithResult → SettlePanel，反馈 5）。
        // 恒 1 星（非独立完成）；meta.abandoned 仅数据标记；elapsedMs 由平台计时器权威覆写（含演示时间，用户决策）；
        // mergeLevelRecord 星级取高不覆盖历史，unlockedCount 前进 n+1 = 下一关照常解锁（用户决策）。
        board!.settle()
        phase = 'done'
        hooks.onComplete({
          gameId: 'jigsaw',
          n: cfg.n,
          elapsedMs: 0,
          mistakes: board!.helps,
          stars: 1,
          meta: { abandoned: true, helps: board!.helps },
        })
        return
      }
      const step = steps[k]
      // 落子前快照：applyAbandonStep 会改真实盘面（含让位块移入暂存）
      const from = pieceHomeRect(step.pieceIndex)
      const displacedFrom = step.displacedIndex !== undefined ? pieceHomeRect(step.displacedIndex) : null
      board!.applyAbandonStep(step)
      if (step.displacedIndex !== undefined && displacedFrom) {
        pushFlight(step.displacedIndex, displacedFrom, pieceHomeRect(step.displacedIndex), DISPLACE_MS)
      }
      const to = slotRect(content, plan!, step.toSlot.row, step.toSlot.col)
      pushFlight(step.pieceIndex, from, to, DEMO_STEP_MS)
      // 不走 afterPlace：演示中途 allPlaced 会误触结算/错位闪烁打断演示；终局统一由播完分支走 onComplete 完成结算链
      refreshHud()
      reportProgress()
      const timer = setTimeout(() => playStep(k + 1), DEMO_STEP_MS + 40)
      timers.push(timer)
    }
    playStep(0)
  }

  // ---- 指针交互（window 级监听，Pointer Events 统一鼠标/触摸）----
  const onPointerDown = (event: PointerEvent): void => {
    if (event.target !== canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    // 弹框开着：任意点击先关闭（不检查 phase，暂停/结算态也能关）
    if (previewZoom) {
      previewZoom = false
      dirty = true
      return
    }
    if (phase !== 'running' || !board || !plan) return
    // 点击参考图 → 放大弹框
    if (pointInRect(px, py, rects.preview, 4)) {
      previewZoom = true
      dirty = true
      event.preventDefault()
      return
    }
    let index: number | null = null
    if (board.currentIndex !== null && pointInRect(px, py, pieceHomeRect(board.currentIndex), 10)) {
      index = board.currentIndex
    } else {
      // 暂存块 → 盘面块（重摆）→ 当前块热区兜底（等比缩略后长条块可能偏小，区级兜底保证可点）
      index = hitStagingPiece(px, py) ?? hitBoardPiece(px, py)
      if (index === null && board.currentIndex !== null && pointInRect(px, py, rects.current, 8)) {
        index = board.currentIndex
      }
    }
    if (index === null) return
    event.preventDefault()
    drag = { index, fromZone: board.pieceAt(index).zone, x: px, y: py }
    dirty = true
  }

  function hitStagingPiece(px: number, py: number): number | null {
    if (!board) return null
    for (const i of board.stagingList) {
      if (pointInRect(px, py, pieceHomeRect(i), 6)) return i
    }
    return null
  }

  function hitBoardPiece(px: number, py: number): number | null {
    if (!board || !plan) return null
    const slot = hitTestSlot(px, py, rects.board, plan)
    if (!slot) return null
    const occupant = board.slotOccupant(slot.row, slot.col)
    return occupant
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || !plan) return
    const rect = canvas.getBoundingClientRect()
    drag.x = event.clientX - rect.left
    drag.y = event.clientY - rect.top
    hoverSlot = hitTestSlot(drag.x, drag.y, rects.board, plan)
    dirty = true
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (!drag || !board || !plan) return
    const rect = canvas.getBoundingClientRect()
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    const index = drag.index
    const fromZone = drag.fromZone
    drag = null
    hoverSlot = null
    dirty = true

    const slot = hitTestSlot(px, py, rects.board, plan)
    if (slot) {
      // 网格级吸附落子（猜错也稳稳卡进，§11.2.3）
      board.placePiece(index, slot.row, slot.col)
      if (fromZone === 'current') board.pushNext()
      afterPlace()
      return
    }
    if (pointInRect(px, py, rects.staging)) {
      board.moveToStaging(index)
      if (fromZone === 'current') board.pushNext()
      refreshHud()
      return
    }
    // 无效落点：块回原区（board 状态未变，仅重绘）
  }

  helpBtn.addEventListener('click', onHelpClick)
  abandonBtn.addEventListener('click', onAbandonClick)
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)

  // ---- 尺寸自适应 ----
  function resize(): void {
    if (phase === 'destroyed') return
    const w = Math.max(container.clientWidth || cssW, 320)
    const h = Math.max(container.clientHeight || cssH, 240)
    if (w === cssW && h === cssH) return
    cssW = w
    cssH = h
    applySize()
  }

  function applySize(): void {
    rects = computeLayout(cssW, cssH)
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // 块位图为源图分辨率，屏幕绘制是下采样——浏览器默认低质插值发糊，显式高质量插值（反馈 2.5）
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    dirty = true
  }
  applySize()

  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => resize())
    ro.observe(container)
  }
  window.addEventListener('resize', resize)

  rafId = requestAnimationFrame(tick)

  // ---- 异步初始化：解析图片 → 切块 → 建盘 → 首推 ----
  void (async () => {
    try {
      let analysis: ImageDataLike
      let src: CanvasImageSource & { width: number; height: number }
      if (deps.analysisImage && deps.sourceImage) {
        analysis = deps.analysisImage
        src = deps.sourceImage
      } else if (cfg.assetId) {
        // 自定义素材（§11.8 custom / M3.11）：IndexedDB blob → objectURL（同源不 taint，可读像素做梯度分析）
        const blob = await getEnvAdapter().assetRepo.loadImage({ id: cfg.assetId })
        const url = URL.createObjectURL(blob)
        try {
          src = await loadSourceImage(url)
          analysis = downscaleToAnalysis(src)
        } finally {
          URL.revokeObjectURL(url) // Image 已完成解码，URL 可释放
        }
      } else {
        const entry = galleryEntry(cfg.imageId)
        analysis = await loadAnalysisImage(entry)
        src = await loadSourceImage(sourceSrc(entry))
      }
      if ((phase as Phase) === 'destroyed') return
      // 方案模式：rows/cols/tabDepth/uniquenessThreshold 来自方案参数（§11.8）；内置模式用引擎默认值
      const cutBase: CutParams = {
        rows: cfg.rows ?? cfg.gridSize,
        cols: cfg.cols ?? cfg.gridSize,
        ...(cfg.tabDepth !== undefined ? { tabDepth: cfg.tabDepth } : {}),
        ...(cfg.uniquenessThreshold !== undefined ? { uniquenessThreshold: cfg.uniquenessThreshold } : {}),
      }
      // AI 建议权重（M5）：存档权重经再归一化后建线（网格阶梯进阶后长度不匹配 → 本地梯度算法）
      const normalized = cfg.suggestion
        ? normalizeSuggestion({
            rows: cutBase.rows,
            cols: cutBase.cols,
            rowWeights: cfg.suggestion.rowWeights,
            colWeights: cfg.suggestion.colWeights,
          })
        : ({ ok: false, reason: 'invalid-schema' } as const)
      plan = normalized.ok
        ? createCutPlanFromSuggestion(analysis, normalized.suggestion, cutBase, cfg.seed)
        : createCutPlan(analysis, cutBase, cfg.seed)
      source = src
      // 反馈 4.1：位图分辨率取「源图比例」与「设备像素盘面比例」较大者——
      // 源图低于屏幕显示分辨率时（块位图被放大绘制）按盘面设备像素下限重建，切块不再糊于原图
      const boardPx = boardContentRect(rects.board, plan).w * dpr
      hiScale = Math.max(src.width / plan.width, boardPx / plan.width)
      board = new JigsawBoard(plan, deps.deck)
      buildPieceBitmaps()
      board.pushNext()
      refreshHud()
      reportProgress()
      dirty = true
      phase = 'idle'
      if (pendingStart) {
        pendingStart = false
        phase = 'running'
      }
    } catch (err) {
      if ((phase as Phase) === 'destroyed') return
      phase = 'destroyed'
      showError(i18n.global.t('jigsaw.loadError'))
      console.warn('[jigsaw] 初始化失败:', err)
    }
  })()

  function stubInstance(): GameInstance {
    return {
      start() {},
      pause() {},
      resume() {},
      destroy() {
        root.remove()
      },
    }
  }

  return {
    start() {
      if (phase === 'loading') {
        pendingStart = true
        return
      }
      if (phase !== 'idle') return
      phase = 'running'
      dirty = true
    },
    pause() {
      if (phase !== 'running') return
      phase = 'paused'
      drag = null
      previewZoom = false
      dirty = true
    },
    resume() {
      if (phase !== 'paused') return
      phase = 'running'
      dirty = true
    },
    destroy() {
      phase = 'destroyed'
      cancelAnimationFrame(rafId)
      for (const t of timers) clearTimeout(t)
      timers.length = 0
      helpBtn.removeEventListener('click', onHelpClick)
      abandonBtn.removeEventListener('click', onAbandonClick)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('resize', resize)
      ro?.disconnect()
      root.remove()
    },
  }
}
