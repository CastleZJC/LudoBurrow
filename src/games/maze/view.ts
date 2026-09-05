// 迷宫视图度量纯函数（开发计划 4.2：Canvas 坐标计算抽离保证可测）
// 棋盘 = 完整 tilemap（含外墙，边长 tiles = 2*size+1），按画布可用空间整除取瓦片尺寸并居中。

export interface MazeView {
  /** 单瓦片像素（CSS px，下限 4 保证可辨认） */
  tile: number
  /** 棋盘左上角在画布中的偏移（居中） */
  ox: number
  oy: number
}

export function computeView(canvasW: number, canvasH: number, tiles: number): MazeView {
  const tile = Math.max(4, Math.floor(Math.min(canvasW, canvasH) / tiles))
  return {
    tile,
    ox: Math.floor((canvasW - tile * tiles) / 2),
    oy: Math.floor((canvasH - tile * tiles) / 2),
  }
}

/** cell 坐标 → 该 cell 瓦片的画布像素中心（cell 在 tilemap 奇数位） */
export function cellCenter(cx: number, cy: number, view: MazeView): { x: number; y: number } {
  return {
    x: view.ox + (2 * cx + 1.5) * view.tile,
    y: view.oy + (2 * cy + 1.5) * view.tile,
  }
}
