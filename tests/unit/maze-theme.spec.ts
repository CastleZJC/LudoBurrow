// 迷宫皮肤加载单测（开发计划 4.2/4.3：PNG 资产齐备 / 失败兜底 paletteSkin 双轨分流）
// happy-dom 无真实图片解码 → stub Image 控制加载成败，断言 TileSkin 绘制路径。

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  HERO_SPRITE_PATH,
  THEME_LABEL_KEY,
  THEME_PALETTES,
  loadTileSkin,
  paletteSkin,
  tilePath,
} from '@/games/maze/theme'
import { MAZE_THEMES } from '@/games/maze/level'

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

describe('八主题注册（验收返工：城堡/花园 + 6 推荐主题雪原/火山/海底/丛林/太空站/矿洞）', () => {
  it('MAZE_THEMES 共 8 项且顺序稳定（主题选择器 = 此顺序）', () => {
    expect([...MAZE_THEMES]).toEqual(['castle', 'garden', 'snow', 'volcano', 'ocean', 'jungle', 'station', 'mine'])
  })

  it('调色板与 i18n 标签键全键覆盖（无缺漏主题，色值全 #RRGGBB）', () => {
    for (const t of MAZE_THEMES) {
      expect(THEME_LABEL_KEY[t]).toMatch(/^maze\.theme/)
      const palette = THEME_PALETTES[t]!
      for (const color of Object.values(palette)) expect(color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('新主题瓦片路径与生成脚本产物一致（主题/类型分目录）', () => {
    expect(tilePath('snow', 'wall')).toBe('assets/tiles/snow/wall.png')
    expect(tilePath('volcano', 'goal')).toBe('assets/tiles/volcano/goal.png')
    expect(tilePath('ocean', 'start')).toBe('assets/tiles/ocean/start.png')
    expect(tilePath('jungle', 'floor')).toBe('assets/tiles/jungle/floor.png')
    expect(tilePath('station', 'wall')).toBe('assets/tiles/station/wall.png')
    expect(tilePath('mine', 'goal')).toBe('assets/tiles/mine/goal.png')
  })

  it('loadTileSkin 新主题：资源齐备走 PNG 分支 / 失败走色板兜底', async () => {
    stubImage('load')
    const okSkin = await loadTileSkin('snow')
    const ctx = ctx2d()
    okSkin.drawTile(ctx, 'wall', 0, 0, 16)
    expect(ctx.__calls.some((c) => c.op === 'drawImage')).toBe(true)

    stubImage('error')
    const fallback = await loadTileSkin('mine')
    const ctx2 = ctx2d()
    fallback.drawTile(ctx2, 'floor', 0, 0, 16)
    expect(ctx2.__calls.some((c) => c.op === 'fillRect')).toBe(true)
    expect(ctx2.__calls.some((c) => c.op === 'drawImage')).toBe(false)
  })

  it('paletteSkin 八主题四类瓦片 + 角色全绘制不抛错（调色板字段完备）', () => {
    for (const t of MAZE_THEMES) {
      const skin = paletteSkin(t)
      const ctx = ctx2d()
      skin.drawTile(ctx, 'wall', 0, 0, 16)
      skin.drawTile(ctx, 'floor', 0, 0, 16)
      skin.drawTile(ctx, 'goal', 0, 0, 16)
      skin.drawTile(ctx, 'start', 0, 0, 16)
      skin.drawHero(ctx, 'down', 0, 0, 0, 16)
    }
  })
})
