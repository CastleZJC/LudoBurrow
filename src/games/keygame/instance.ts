// 键盘游戏实例（技术架构 §10.5）：虚拟键盘渲染 + 物理 keydown 比对
// 只经 hooks 与平台交互；elapsedMs 填 0，由平台 timer 权威覆写（core/types 约定）

import type { BaseLevelConfig, GameHooks, GameInstance } from '@/core/types'
import { i18n } from '@/i18n'
import { COMPACT_LAYOUT, FULL_LAYOUT, normalizeKeyEvent, type KeyDef } from './layout'
import { calcKeygameStars, KEYGAME_MODE_LABEL_KEY, type KeygameLevelConfig } from './level'

function el(tag: string, cls?: string): HTMLElement {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  return node
}

export function mountKeygame(
  container: HTMLElement,
  level: BaseLevelConfig,
  hooks: GameHooks,
): GameInstance {
  // GameModule.mount 契约收窄为具体关卡配置（与 stub 同模式）
  const cfg = level as KeygameLevelConfig
  const total = cfg.sequence.length
  let idx = 0
  let mistakes = 0
  let state: 'idle' | 'running' | 'paused' | 'done' | 'destroyed' = 'idle'

  const root = el('div', 'kg-root')
  const keyEls = new Map<string, HTMLElement[]>()
  const charEls: HTMLElement[] = []
  const pendingTimers: ReturnType<typeof setTimeout>[] = []

  // ---- HUD（模式名 / 失误 / 进度）----
  const hud = el('div', 'kg-hud')
  const modeEl = el('span', 'kg-mode')
  modeEl.dataset.kg = 'mode'
  modeEl.textContent = i18n.global.t(KEYGAME_MODE_LABEL_KEY[cfg.mode])
  const mistakesEl = el('span', 'kg-mistakes')
  mistakesEl.dataset.kg = 'mistakes'
  const progressEl = el('span', 'kg-progress')
  progressEl.dataset.kg = 'progress'
  hud.append(modeEl, mistakesEl, progressEl)

  const promptEl = el('div', 'kg-prompt')
  promptEl.textContent = i18n.global.t('keygame.prompt')

  const refreshHud = (): void => {
    mistakesEl.textContent = `${i18n.global.t('common.mistakes')} ${mistakes}`
    progressEl.textContent = `${idx}/${total}`
  }

  // ---- 目标区（分段展示；拼音段带汉字提示）----
  const targets = el('div', 'kg-targets')
  for (const seg of cfg.segments) {
    const segEl = el('div', 'kg-seg')
    if (seg.hint) {
      const hint = el('span', 'kg-hint')
      hint.textContent = seg.hint
      segEl.appendChild(hint)
    }
    for (const ch of seg.chars) {
      const chEl = el('span', 'kg-ch')
      chEl.textContent = ch
      segEl.appendChild(chEl)
      charEls.push(chEl)
    }
    targets.appendChild(segEl)
  }

  const refreshChars = (): void => {
    for (let i = 0; i < charEls.length; i++) {
      charEls[i].classList.toggle('done', i < idx)
      charEls[i].classList.toggle('cur', i === idx)
    }
  }

  // ---- 虚拟键盘（数据驱动渲染；主区 flex 行、数字小键盘区 grid）----
  const registerKey = (id: string, node: HTMLElement): void => {
    const list = keyEls.get(id) ?? []
    list.push(node)
    keyEls.set(id, list)
    // 小键盘数字键（numpad7 → '7'）同步注册到归一化数字 id：目标为数字时两处同时高亮
    const digit = /^numpad(\d)$/.exec(id)
    if (digit) registerKey(digit[1], node)
  }

  const buildKey = (key: KeyDef): HTMLElement => {
    const node = el('div', 'kg-key')
    node.dataset.key = key.id
    const label = el('span', 'kg-key-label')
    label.textContent = key.label
    node.appendChild(label)
    if (key.sublabel) {
      const sub = el('span', 'kg-key-sub')
      sub.textContent = key.sublabel
      node.appendChild(sub)
    }
    registerKey(key.id, node)
    return node
  }

  const keyboard = el('div', 'kg-kb')
  keyboard.dataset.layout = cfg.layout
  const main = el('div', 'kg-kb-main')
  for (const row of (cfg.layout === 'full' ? FULL_LAYOUT : COMPACT_LAYOUT).mainRows) {
    const rowEl = el('div', 'kg-row')
    for (const key of row) {
      const node = buildKey(key)
      // 键宽 = 单位 × 键宽权重（单位由 applyKbScale 自适应 52-104px）：键盘按实际尺寸居中呈现，不随容器拉伸失真
      node.style.width = `calc(var(--kg-u, 52px) * ${key.w ?? 1})`
      rowEl.appendChild(node)
    }
    main.appendChild(rowEl)
  }
  keyboard.appendChild(main)
  if (cfg.layout === 'full' && FULL_LAYOUT.numpadRows) {
    const pad = el('div', 'kg-kb-num')
    for (const row of FULL_LAYOUT.numpadRows) {
      for (const key of row) {
        const node = buildKey(key)
        node.style.gridColumn = `span ${key.w ?? 1}`
        node.style.gridRow = `span ${key.h ?? 1}`
        pad.appendChild(node)
      }
    }
    keyboard.appendChild(pad)
  }

  root.append(hud, promptEl, targets, keyboard)
  refreshHud()
  refreshChars()
  container.appendChild(root)

  // ---- 键盘等比缩放（反馈：放大 1 倍填补上下空白）----
  // 基准 52px 实测主键盘区自然宽度 → 容器可用宽度等比放大（上限 ×2 = 104px，下限原尺寸防溢出）；
  // 数字小键盘区 flex 可换行，不参与宽度约束。须在挂载后调用（scrollWidth 需布局）。
  const applyKbScale = (): void => {
    keyboard.style.setProperty('--kg-u', '52px')
    const natural = main.scrollWidth
    const cw = container.clientWidth || 960
    const scale = Math.min(2, Math.max(1, (cw - 24) / Math.max(1, natural)))
    keyboard.style.setProperty('--kg-u', `${Math.round(52 * scale)}px`)
  }
  applyKbScale()
  window.addEventListener('resize', applyKbScale)

  // ---- 高亮 / 反馈 ----
  const keysOf = (expected: string): HTMLElement[] => keyEls.get(expected) ?? []

  const highlightNext = (): void => {
    for (const nodes of keyEls.values()) {
      for (const node of nodes) node.classList.remove('kg-key-next')
    }
    if (state === 'running' && idx < total) {
      for (const node of keysOf(cfg.sequence[idx])) node.classList.add('kg-key-next')
    }
  }

  /** 短暂反馈样式（命中绿闪 / 错误红闪）；计时器统一收集，destroy 时清理 */
  const flash = (nodes: HTMLElement[], cls: string, ms: number): void => {
    for (const node of nodes) node.classList.add(cls)
    const timer = setTimeout(() => {
      for (const node of nodes) node.classList.remove(cls)
    }, ms)
    pendingTimers.push(timer)
  }

  const finish = (): void => {
    state = 'done'
    refreshChars()
    refreshHud()
    highlightNext()
    hooks.onComplete({
      gameId: 'keygame',
      n: cfg.n,
      elapsedMs: 0,
      mistakes,
      stars: calcKeygameStars(mistakes, total),
    })
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (state !== 'running') return
    const pressed = normalizeKeyEvent(event)
    if (pressed === null) return
    event.preventDefault()
    if (pressed === cfg.sequence[idx]) {
      flash(keysOf(pressed), 'kg-key-hit', 260)
      idx++
      // 进度先于完成上报（完成时平台覆写 elapsedMs 后结算）
      hooks.onProgress({ gameId: 'keygame', n: cfg.n, done: idx, total })
      if (idx >= total) {
        finish()
        return
      }
      refreshChars()
      refreshHud()
      highlightNext()
    } else {
      mistakes++
      flash(keysOf(cfg.sequence[idx]), 'kg-key-err', 320)
      flash([targets], 'kg-shake', 320)
      refreshHud()
    }
  }

  window.addEventListener('keydown', onKeyDown)
  return {
    start() {
      if (state !== 'idle') return
      state = 'running'
      highlightNext()
    },
    pause() {
      if (state !== 'running') return
      state = 'paused'
      highlightNext()
    },
    resume() {
      if (state !== 'paused') return
      state = 'running'
      highlightNext()
    },
    destroy() {
      state = 'destroyed'
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', applyKbScale)
      for (const timer of pendingTimers) clearTimeout(timer)
      pendingTimers.length = 0
      root.remove()
    },
  }
}
