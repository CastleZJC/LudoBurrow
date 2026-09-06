// 迷宫主题皮肤（开发计划 4.2/4.3 / 技术架构 §12.3/§12.4）
// 皮肤双轨：PNG 资产（scripts/gen-maze-assets.mjs 生成，相对路径 drawImage，无 taint）
//           + paletteSkin 色板几何绘制（加载失败兜底 / 测试注入，行为与 PNG 皮肤同构）。
// TileSkin 是渲染层唯一绘制入口：instance.ts 不感知皮肤来源。

import type { MazeTheme } from './level'
import type { Facing } from './walk'

export type TileKind = 'wall' | 'floor' | 'goal' | 'start'

/** 主题调色板（paletteSkin 与 CSS 背景共用单一出处） */
export interface ThemePalette {
  bg: string
  wall: string
  wallEdge: string
  floor: string
  floorDot: string
  goal: string
  goalCore: string
  start: string
}

export const THEME_PALETTES: Record<MazeTheme, ThemePalette> = {
  castle: {
    bg: '#2b2e38',
    wall: '#8a8f9c',
    wallEdge: '#c3c8d2',
    floor: '#b9bdc6',
    floorDot: '#a3a7b0',
    goal: '#d9a441',
    goalCore: '#4a3b2a',
    start: '#e8c877',
  },
  garden: {
    bg: '#243620',
    wall: '#3f7a44',
    wallEdge: '#5e9b63',
    floor: '#7fb069',
    floorDot: '#699e54',
    goal: '#e05b5b',
    goalCore: '#f2d06b',
    start: '#f2d06b',
  },
}

/** 主题显示名 i18n key（语言包 maze 段） */
export const THEME_LABEL_KEY: Record<MazeTheme, string> = {
  castle: 'maze.themeCastle',
  garden: 'maze.themeGarden',
}

export function tilePath(theme: MazeTheme, kind: TileKind): string {
  return `assets/tiles/${theme}/${kind}.png`
}

export const HERO_SPRITE_PATH = 'assets/sprites/hero.png'

/** sprite 条带行序（与 gen-maze-assets.mjs FACINGS 一致） */
const FACING_ROW: Record<Facing, number> = { down: 0, left: 1, right: 2, up: 3 }
/** 条带帧尺寸（v1.0 验收返工高清化：256×256 × 3 帧 × 4 方向，条带 768×1024，与 gen-maze-assets.mjs 一致） */
export const SPRITE_FRAME = 256

/** 渲染皮肤：瓦片与角色的统一绘制入口 */
export interface TileSkin {
  drawTile(ctx: CanvasRenderingContext2D, kind: TileKind, x: number, y: number, px: number): void
  drawHero(ctx: CanvasRenderingContext2D, facing: Facing, frame: 0 | 1 | 2, x: number, y: number, px: number): void
}

/** 色板几何皮肤（兜底 / 测试）：像素小人以帽/衣/腿三段色块呈现（非小黑点，§12.4） */
export function paletteSkin(theme: MazeTheme): TileSkin {
  const p = THEME_PALETTES[theme]
  return {
    drawTile(ctx, kind, x, y, px) {
      ctx.fillStyle = kind === 'wall' ? p.wall : p.floor
      ctx.fillRect(x, y, px, px)
      if (kind === 'wall') {
        ctx.fillStyle = p.wallEdge
        ctx.fillRect(x, y, px, Math.max(1, px * 0.12))
        ctx.fillRect(x, y, Math.max(1, px * 0.12), px)
      } else if (kind === 'floor') {
        ctx.fillStyle = p.floorDot
        const dot = Math.max(1, Math.round(px / 8))
        ctx.fillRect(x + Math.round(px * 0.3), y + Math.round(px * 0.55), dot, dot)
        ctx.fillRect(x + Math.round(px * 0.62), y + Math.round(px * 0.25), dot, dot)
      } else if (kind === 'goal') {
        ctx.fillStyle = p.goal
        const r = px * 0.32
        ctx.beginPath()
        ctx.arc(x + px / 2, y + px / 2, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = p.goalCore
        ctx.beginPath()
        ctx.arc(x + px / 2, y + px / 2, r * 0.45, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // start：出发标记环
        ctx.strokeStyle = p.start
        ctx.lineWidth = Math.max(1, px / 10)
        ctx.beginPath()
        ctx.arc(x + px / 2, y + px / 2, px * 0.36, 0, Math.PI * 2)
        ctx.stroke()
      }
    },
    drawHero(ctx, facing, frame, x, y, px) {
      // 几何小人：帽（红）/ 脸（肤）/ 衣（蓝）/ 腿（深蓝），走路帧腿部位移
      const u = px / 32 // 与 32×32 帧网格对齐的单位
      const cy = y + px / 2
      // 腿
      ctx.fillStyle = '#2d4a8a'
      ctx.fillRect(x + 11 * u, cy + 3 * u + (frame === 1 ? 0 : u), 4 * u, 6 * u)
      ctx.fillRect(x + 17 * u, cy + 3 * u + (frame === 2 ? 0 : u), 4 * u, 6 * u)
      // 身
      ctx.fillStyle = '#4a7bd0'
      ctx.fillRect(x + 10 * u, cy - 6 * u, 12 * u, 9 * u)
      // 脸 + 帽
      ctx.fillStyle = '#f2c9a0'
      ctx.fillRect(x + 10 * u, cy - 13 * u, 12 * u, 7 * u)
      ctx.fillStyle = '#d94f4f'
      ctx.fillRect(x + 9 * u, cy - 16 * u, 14 * u, 3 * u)
      // 朝向指示：脸部前缘的点
      ctx.fillStyle = '#26221f'
      const dot = 2 * u
      if (facing === 'down') {
        ctx.fillRect(x + 13 * u, cy - 10 * u, dot, dot)
        ctx.fillRect(x + 18 * u, cy - 10 * u, dot, dot)
      } else if (facing === 'left') {
        ctx.fillRect(x + 11 * u, cy - 10 * u, dot, dot)
      } else if (facing === 'right') {
        ctx.fillRect(x + 19 * u, cy - 10 * u, dot, dot)
      }
      // up：背影不画点（帽已覆盖）
    },
  }
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`maze: 皮肤加载失败 ${src}`))
    img.src = src
  })
}

/**
 * 加载 PNG 皮肤（4 瓦片 + hero 条带）；任一失败 → paletteSkin 兜底（§12.3 皮肤制的可靠性分支）。
 */
export async function loadTileSkin(theme: MazeTheme): Promise<TileSkin> {
  const palette = paletteSkin(theme)
  try {
    const [wall, floor, goal, start, hero] = await Promise.all([
      loadImg(tilePath(theme, 'wall')),
      loadImg(tilePath(theme, 'floor')),
      loadImg(tilePath(theme, 'goal')),
      loadImg(tilePath(theme, 'start')),
      loadImg(HERO_SPRITE_PATH),
    ])
    const tiles: Record<TileKind, HTMLImageElement> = { wall, floor, goal, start }
    return {
      drawTile(ctx, kind, x, y, px) {
        ctx.drawImage(tiles[kind], x, y, px, px)
      },
      drawHero(ctx, facing, frame, x, y, px) {
        const sx = frame * SPRITE_FRAME
        const sy = FACING_ROW[facing] * SPRITE_FRAME
        ctx.drawImage(hero, sx, sy, SPRITE_FRAME, SPRITE_FRAME, x, y, px, px)
      },
    }
  } catch {
    return palette
  }
}
