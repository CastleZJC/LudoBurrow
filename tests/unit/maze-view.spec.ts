// 迷宫视图度量单测（开发计划 4.2：Canvas 渲染坐标抽纯函数）
import { describe, it, expect } from 'vitest'
import { computeView, cellCenter } from '@/games/maze/view'

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
