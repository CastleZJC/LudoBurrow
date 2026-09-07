// 迷宫视图度量单测（开发计划 4.2：Canvas 渲染坐标抽纯函数）
import { describe, it, expect } from 'vitest'
import { cellCenter, clickFacing, computeView } from '@/games/maze/view'

describe('computeView（瓦片尺寸 = 可用空间整除，棋盘居中）', () => {
  it('正方形画布：tile = floor(w/tiles)，居中偏移对称', () => {
    const v = computeView(900, 900, 19)
    expect(v.tile).toBe(47)
    expect(v.ox).toBe(Math.floor((900 - 47 * 19) / 2))
    expect(v.oy).toBe(v.ox)
  })

  it('宽画布：以短边（高）为准，水平居中', () => {
    const v = computeView(1200, 640, 43)
    expect(v.tile).toBe(Math.floor(640 / 43)) // 14
    expect(v.ox).toBe(Math.floor((1200 - 14 * 43) / 2))
    expect(v.oy).toBe(Math.floor((640 - 14 * 43) / 2))
  })

  it('极小画布：tile 下限 4（保证可辨认）', () => {
    expect(computeView(50, 50, 43).tile).toBe(4)
  })
})

describe('cellCenter（cell 坐标 → 画布像素中心）', () => {
  it('cell 瓦片在 tilemap 奇数位：中心 = 原点 + (2c+1.5)×tile，相邻 cell 隔 2 tile', () => {
    const v = { tile: 10, ox: 5, oy: 7 }
    expect(cellCenter(0, 0, v)).toEqual({ x: 20, y: 22 })
    expect(cellCenter(2, 3, v)).toEqual({ x: 60, y: 82 })
  })
})

describe('clickFacing（鼠标点击方向：相对小人主轴，死区不动）', () => {
  const c = { x: 100, y: 100 }

  it('四方向：点击小人某侧 → 该方向', () => {
    expect(clickFacing(c, { x: 200, y: 100 }, 10)).toBe('right')
    expect(clickFacing(c, { x: 0, y: 100 }, 10)).toBe('left')
    expect(clickFacing(c, { x: 100, y: 200 }, 10)).toBe('down')
    expect(clickFacing(c, { x: 100, y: 0 }, 10)).toBe('up')
  })

  it('对角点击取主轴：|dx|>|dy| 横轴、|dy|>|dx| 纵轴', () => {
    expect(clickFacing(c, { x: 120, y: 110 }, 10)).toBe('right')
    expect(clickFacing(c, { x: 90, y: 80 }, 10)).toBe('up')
  })

  it('平局（|dx|===|dy|）取横轴（判定顺序确定）', () => {
    expect(clickFacing(c, { x: 130, y: 130 }, 10)).toBe('right')
    expect(clickFacing(c, { x: 70, y: 70 }, 10)).toBe('left')
  })

  it('死区：两轴位移均小于 deadPx → null（不动不失误）', () => {
    expect(clickFacing(c, { x: 105, y: 108 }, 10)).toBeNull()
    expect(clickFacing(c, c, 10)).toBeNull()
  })

  it('死区边界：单轴越界即按主轴出方向', () => {
    expect(clickFacing(c, { x: 111, y: 105 }, 10)).toBe('right')
    expect(clickFacing(c, { x: 95, y: 80 }, 10)).toBe('up')
  })
})
