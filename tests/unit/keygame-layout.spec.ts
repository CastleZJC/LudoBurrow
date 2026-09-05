// 虚拟键盘布局数据单测（键 id 唯一 / 大小键盘差异 / 归一化比对）
import { describe, it, expect } from 'vitest'
import { FULL_LAYOUT, COMPACT_LAYOUT, normalizeKeyEvent } from '@/games/keygame/layout'

function keyDown(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, cancelable: true })
}

describe('布局结构', () => {
  it('大键盘：主区 5 行 + 数字小键盘区 5 行', () => {
    expect(FULL_LAYOUT.kind).toBe('full')
    expect(FULL_LAYOUT.mainRows).toHaveLength(5)
    expect(FULL_LAYOUT.numpadRows).not.toBeNull()
    expect(FULL_LAYOUT.numpadRows).toHaveLength(5)
  })

  it('小键盘（紧凑）：主区 5 行、无数字小键盘区', () => {
    expect(COMPACT_LAYOUT.kind).toBe('compact')
    expect(COMPACT_LAYOUT.mainRows).toHaveLength(5)
    expect(COMPACT_LAYOUT.numpadRows).toBeNull()
  })

  it('两布局主区一致（小键盘 = 大键盘去掉数字区）', () => {
    expect(COMPACT_LAYOUT.mainRows).toEqual(FULL_LAYOUT.mainRows)
  })

  it('大键盘全部键 id 唯一', () => {
    const ids = [...FULL_LAYOUT.mainRows, ...(FULL_LAYOUT.numpadRows ?? [])]
      .flat()
      .map((key) => key.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('26 个字母键齐全', () => {
    const ids = new Set(FULL_LAYOUT.mainRows.flat().map((key) => key.id))
    for (let code = 'A'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
      expect(ids.has(String.fromCharCode(code)), `缺少字母键 ${String.fromCharCode(code)}`).toBe(true)
    }
  })

  it('主区数字行 0-9 齐全，数字小键盘区数字键带 numpad 标记', () => {
    const mainIds = new Set(FULL_LAYOUT.mainRows.flat().map((key) => key.id))
    for (const digit of '0123456789') expect(mainIds.has(digit)).toBe(true)

    const numKeys = (FULL_LAYOUT.numpadRows ?? []).flat().filter((key) => key.numpad)
    expect(numKeys.map((key) => key.id).sort()).toEqual(
      ['numpad0', 'numpad1', 'numpad2', 'numpad3', 'numpad4', 'numpad5', 'numpad6', 'numpad7', 'numpad8', 'numpad9'],
    )
  })

  it('数字小键盘区竖向合并键（+ / Enter）相对高度为 2', () => {
    const padKeys = (FULL_LAYOUT.numpadRows ?? []).flat()
    expect(padKeys.find((key) => key.id === 'numpadadd')?.h).toBe(2)
    expect(padKeys.find((key) => key.id === 'numpadenter')?.h).toBe(2)
  })
})

describe('normalizeKeyEvent（物理键 → 归一化 id）', () => {
  it.each([
    ['a', 'A'],
    ['z', 'Z'],
    ['A', 'A'],
    ['0', '0'],
    ['9', '9'],
  ])('键 %p 归一化为 %p', (key, expected) => {
    expect(normalizeKeyEvent(keyDown(key))).toBe(expected)
  })

  it.each(['Shift', 'Enter', 'F5', '!', ' ', 'ArrowLeft', 'Numpad5'])('功能键/符号 %p 不参与比对', (key) => {
    expect(normalizeKeyEvent(keyDown(key))).toBeNull()
  })
})
