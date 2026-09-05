// 虚拟键盘布局数据（技术架构 §10.1 / §10.5）
// 术语：大键盘 = 104 键全尺寸（含右侧数字小键盘区）；小键盘 = 紧凑布局（无小键盘区）
// DOM/CSS 数据驱动渲染；键 id = 归一化按键标识（字母大写 / 数字 / 功能键小写）

export interface KeyDef {
  /** 归一化键标识：'A'-'Z' / '0'-'9' / 功能键 'tab' 'space' 等 */
  id: string
  /** 主标签（shift 主档） */
  label: string
  /** 副标签（shift 档符号，仅字母数字行） */
  sublabel?: string
  /** 相对宽度（1 = 标准键宽） */
  w?: number
  /** 相对高度（1 = 标准键高；数字小键盘区竖向合并键用 2） */
  h?: number
  /** 数字小键盘区的数字键（大键盘模式下数字目标优先高亮于此） */
  numpad?: boolean
}

/** 主区布局（大/小键盘共用，不含小键盘区） */
const MAIN_ROWS: KeyDef[][] = [
  [
    { id: 'grave', label: '`', sublabel: '~' },
    { id: '1', label: '1', sublabel: '!' },
    { id: '2', label: '2', sublabel: '@' },
    { id: '3', label: '3', sublabel: '#' },
    { id: '4', label: '4', sublabel: '$' },
    { id: '5', label: '5', sublabel: '%' },
    { id: '6', label: '6', sublabel: '^' },
    { id: '7', label: '7', sublabel: '&' },
    { id: '8', label: '8', sublabel: '*' },
    { id: '9', label: '9', sublabel: '(' },
    { id: '0', label: '0', sublabel: ')' },
    { id: 'minus', label: '-', sublabel: '_' },
    { id: 'equal', label: '=', sublabel: '+' },
    { id: 'backspace', label: 'Backspace', w: 2 },
  ],
  [
    { id: 'tab', label: 'Tab', w: 1.5 },
    { id: 'Q', label: 'Q' }, { id: 'W', label: 'W' }, { id: 'E', label: 'E' },
    { id: 'R', label: 'R' }, { id: 'T', label: 'T' }, { id: 'Y', label: 'Y' },
    { id: 'U', label: 'U' }, { id: 'I', label: 'I' }, { id: 'O', label: 'O' },
    { id: 'P', label: 'P' },
    { id: 'bracketleft', label: '[', sublabel: '{' },
    { id: 'bracketright', label: ']', sublabel: '}' },
    { id: 'backslash', label: '\\', sublabel: '|', w: 1.5 },
  ],
  [
    { id: 'capslock', label: 'Caps', w: 1.75 },
    { id: 'A', label: 'A' }, { id: 'S', label: 'S' }, { id: 'D', label: 'D' },
    { id: 'F', label: 'F' }, { id: 'G', label: 'G' }, { id: 'H', label: 'H' },
    { id: 'J', label: 'J' }, { id: 'K', label: 'K' }, { id: 'L', label: 'L' },
    { id: 'semicolon', label: ';', sublabel: ':' },
    { id: 'quote', label: "'", sublabel: '"' },
    { id: 'enter', label: 'Enter', w: 2.25 },
  ],
  [
    { id: 'shiftleft', label: 'Shift', w: 2.25 },
    { id: 'Z', label: 'Z' }, { id: 'X', label: 'X' }, { id: 'C', label: 'C' },
    { id: 'V', label: 'V' }, { id: 'B', label: 'B' }, { id: 'N', label: 'N' },
    { id: 'M', label: 'M' },
    { id: 'comma', label: ',', sublabel: '<' },
    { id: 'period', label: '.', sublabel: '>' },
    { id: 'slash', label: '/', sublabel: '?' },
    { id: 'shiftright', label: 'Shift', w: 2.75 },
  ],
  [
    { id: 'controlleft', label: 'Ctrl', w: 1.25 },
    { id: 'metaleft', label: 'Win', w: 1.25 },
    { id: 'altleft', label: 'Alt', w: 1.25 },
    { id: 'space', label: 'Space', w: 6.5 },
    { id: 'altright', label: 'Alt', w: 1.25 },
    { id: 'metaright', label: 'Win', w: 1.25 },
    { id: 'contextmenu', label: 'Menu', w: 1.25 },
    { id: 'controlright', label: 'Ctrl', w: 1.25 },
  ],
]

/** 数字小键盘区（仅大键盘布局） */
const NUMPAD_ROWS: KeyDef[][] = [
  [
    { id: 'numlock', label: 'Num' },
    { id: 'numpaddivide', label: '/' },
    { id: 'numpadmultiply', label: '*' },
    { id: 'numpadsubtract', label: '-' },
  ],
  [
    { id: 'numpad7', label: '7', numpad: true },
    { id: 'numpad8', label: '8', numpad: true },
    { id: 'numpad9', label: '9', numpad: true },
    { id: 'numpadadd', label: '+', h: 2 },
  ],
  [
    { id: 'numpad4', label: '4', numpad: true },
    { id: 'numpad5', label: '5', numpad: true },
    { id: 'numpad6', label: '6', numpad: true },
  ],
  [
    { id: 'numpad1', label: '1', numpad: true },
    { id: 'numpad2', label: '2', numpad: true },
    { id: 'numpad3', label: '3', numpad: true },
    { id: 'numpadenter', label: 'Enter', h: 2 },
  ],
  [
    { id: 'numpad0', label: '0', numpad: true, w: 2 },
    { id: 'numpaddecimal', label: '.' },
  ],
]

export type KeyboardLayout = {
  kind: 'full' | 'compact'
  mainRows: KeyDef[][]
  numpadRows: KeyDef[][] | null
}

/** 104 键全尺寸布局（含数字小键盘区） */
export const FULL_LAYOUT: KeyboardLayout = {
  kind: 'full',
  mainRows: MAIN_ROWS,
  numpadRows: NUMPAD_ROWS,
}

/** 紧凑布局（无数字小键盘区） */
export const COMPACT_LAYOUT: KeyboardLayout = {
  kind: 'compact',
  mainRows: MAIN_ROWS,
  numpadRows: null,
}

/**
 * 物理按键 → 归一化键 id（字母大写单字符；数字来自主行或小键盘均归一到 '0'-'9'）。
 * 非字母数字返回 null（功能键不参与比对）。
 */
export function normalizeKeyEvent(event: KeyboardEvent): string | null {
  const key = event.key
  if (key.length === 1 && /[a-zA-Z0-9]/.test(key)) {
    return key.toUpperCase()
  }
  return null
}
