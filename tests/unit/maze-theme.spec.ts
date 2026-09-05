// 迷宫皮肤加载单测（开发计划 4.2/4.3：PNG 资产齐备 / 失败兜底 paletteSkin 双轨分流）
// happy-dom 无真实图片解码 → stub Image 控制加载成败，断言 TileSkin 绘制路径。

import { describe, it, expect, afterEach, vi } from 'vitest'
import { HERO_SPRITE_PATH, loadTileSkin, paletteSkin, tilePath } from '@/games/maze/theme'

type CtxLike = { __calls: { op: string; args: unknown[] }[] }

function ctx2d(): CanvasRenderingContext2D & CtxLike {
  const canvas = document.createElement('canvas')
  return canvas.getContext('2d') as unknown as CanvasRenderingContext2D & CtxLike
}

/** stub Image：src 赋值后按 mode 同步触发 onload/onerror（loadImg 已先挂回调） */
function stubImage(mode: 'load' | 'error'): void {
  vi.stubGlobal(
    'Image',
    class {
      width = 32
      height = 128
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private _src = ''
      get src(): string {
        return this._src
      }
      set src(v: string) {
        this._src = v
        if (mode === 'load') this.onload?.()
        else this.onerror?.()
      }
    },
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('loadTileSkin（皮肤双轨 §12.3）', () => {
  it('资源齐备 → PNG 皮肤：drawTile/drawHero 走 drawImage 分支', async () => {
    stubImage('load')
    const skin = await loadTileSkin('castle')
    const ctx = ctx2d()
    skin.drawTile(ctx, 'wall', 0, 0, 16)
    skin.drawHero(ctx, 'down', 1, 0, 0, 16)
    expect(ctx.__calls.filter((c) => c.op === 'drawImage')).toHaveLength(2)
  })

  it('任一资源失败 → paletteSkin 兜底：drawTile 走 fillRect 分支', async () => {
    stubImage('error')
    const skin = await loadTileSkin('garden')
    const ctx = ctx2d()
    skin.drawTile(ctx, 'floor', 0, 0, 16)
    expect(ctx.__calls.some((c) => c.op === 'fillRect')).toBe(true)
    expect(ctx.__calls.some((c) => c.op === 'drawImage')).toBe(false)
  })

  it('paletteSkin 几何小人朝向差异：down 双眼点、up 背影无（§12.4 非小黑点）', () => {
    const skin = paletteSkin('castle')
    const down = ctx2d()
    skin.drawHero(down, 'down', 0, 0, 0, 32)
    const up = ctx2d()
    skin.drawHero(up, 'up', 0, 0, 0, 32)
    // 眼点 = 以深色为当前 fillStyle 的 fillRect（fillStyle 赋值在朝向分支前，不能只数 set）
    const eyeDots = (c: CtxLike): number => {
      let fill = ''
      let n = 0
      for (const call of c.__calls) {
        if (call.op === 'set:fillStyle') fill = call.args[0] as string
        else if (call.op === 'fillRect' && fill === '#26221f') n += 1
      }
      return n
    }
    expect(eyeDots(down)).toBe(2)
    expect(eyeDots(up)).toBe(0)
  })
})

describe('资产路径口径（与 gen-maze-assets.mjs 产物一致）', () => {
  it('瓦片按主题/类型分目录，角色为条带单文件', () => {
    expect(tilePath('castle', 'wall')).toBe('assets/tiles/castle/wall.png')
    expect(tilePath('garden', 'goal')).toBe('assets/tiles/garden/goal.png')
    expect(HERO_SPRITE_PATH).toBe('assets/sprites/hero.png')
  })
})
