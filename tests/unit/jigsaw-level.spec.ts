// 拼图关卡曲线与图库配对单测（开发计划 3.8 / 技术架构 §11.5）
import { describe, it, expect } from 'vitest'
import { levelSeed } from '@/engines/rng'
import { createJigsawLevel, gridForLevel } from '@/games/jigsaw/level'
import {
  GALLERY,
  GALLERY_TOPICS,
  complexityForLevel,
  galleryEntry,
  pickImageForLevel,
  sourceSrc,
  loadAnalysisImage,
} from '@/games/jigsaw/gallery'

describe('gridForLevel（3×3 → 9×9 阶梯，约每 5 关进阶）', () => {
  it.each([
    [1, 3], [5, 3], [6, 4], [10, 4], [11, 5], [25, 7], [26, 8], [30, 8], [31, 9], [50, 9],
  ])('第 %i 关 → %i×%i', (n, expected) => {
    expect(gridForLevel(n)).toBe(expected)
  })
})

describe('createJigsawLevel', () => {
  it('结构完整且确定性（同关卡两次生成全等）', () => {
    const a = createJigsawLevel(7)
    const b = createJigsawLevel(7)
    expect(a).toEqual(b)
    expect(a.gameId).toBe('jigsaw')
    expect(a.n).toBe(7)
    expect(a.seed).toBe(levelSeed('jigsaw', 7))
    expect(a.gridSize).toBe(4)
    expect(GALLERY.some((e) => e.id === a.imageId)).toBe(true)
  })

  it('图片复杂度配对：低关 1 段 / 中关 2 段 / 高关 3 段', () => {
    expect(complexityForLevel(1)).toBe(1)
    expect(complexityForLevel(20)).toBe(1)
    expect(complexityForLevel(21)).toBe(2)
    expect(complexityForLevel(40)).toBe(2)
    expect(complexityForLevel(41)).toBe(3)
    expect(complexityForLevel(50)).toBe(3)
    for (let n = 1; n <= 50; n++) {
      const cfg = createJigsawLevel(n)
      expect(galleryEntry(cfg.imageId).complexity).toBe(complexityForLevel(n))
    }
  })

  it('非法关卡号抛 RangeError', () => {
    expect(() => createJigsawLevel(0)).toThrow(RangeError)
    expect(() => createJigsawLevel(51)).toThrow(RangeError)
  })
})

describe('内置图库清单（§15.3 每专题 ≥5 张；M6.1 高难度段扩充）', () => {
  it('4 专题 × 每专题 6 张，复杂度分布 2/2/2', () => {
    expect(GALLERY).toHaveLength(24)
    expect(GALLERY_TOPICS).toHaveLength(4)
    for (const topic of GALLERY_TOPICS) {
      const items = GALLERY.filter((e) => e.topic === topic.id)
      expect(items.length).toBeGreaterThanOrEqual(5)
      expect(items.filter((e) => e.complexity === 1)).toHaveLength(2)
      expect(items.filter((e) => e.complexity === 2)).toHaveLength(2)
      expect(items.filter((e) => e.complexity === 3)).toHaveLength(2)
    }
  })

  it('id 全局唯一；文件名与专题目录一致', () => {
    expect(new Set(GALLERY.map((e) => e.id)).size).toBe(GALLERY.length)
    for (const e of GALLERY) {
      expect(sourceSrc(e)).toBe(`assets/images/${e.topic}/${e.file}`)
    }
  })

  it('每复杂度段至少 4 张（50 关轮换不枯竭）', () => {
    for (const c of [1, 2, 3] as const) {
      expect(GALLERY.filter((e) => e.complexity === c).length).toBeGreaterThanOrEqual(4)
    }
  })
})

describe('pickImageForLevel（段内确定性轮换）', () => {
  it('同关卡恒定；同段关卡按序轮换覆盖全部图片', () => {
    expect(pickImageForLevel(3).id).toBe(pickImageForLevel(3).id)
    const seen = new Set<number>()
    for (let n = 1; n <= 20; n++) seen.add(GALLERY.indexOf(pickImageForLevel(n)))
    expect(seen.size).toBe(8) // c1 段 8 张全部轮到
  })

  it('galleryEntry 未知 id 抛 RangeError', () => {
    expect(() => galleryEntry('nope-99')).toThrow(RangeError)
  })
})

describe('内置图库资产落地（M3.9）', () => {
  it('THUMBS 缩略表与 GALLERY 清单一一对齐（PNG data URI）', async () => {
    const { THUMBS } = await import('@/games/jigsaw/thumbs')
    expect(Object.keys(THUMBS).sort()).toEqual(GALLERY.map((e) => e.id).sort())
    for (const uri of Object.values(THUMBS)) {
      expect(uri.startsWith('data:image/png;base64,')).toBe(true)
      expect(uri.length).toBeGreaterThan(1000)
    }
  })

  it('24 张源图 PNG 文件存在且为合法 PNG（魔数 + 体积下限）', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    for (const e of GALLERY) {
      const buf = readFileSync(join(process.cwd(), 'public', 'assets', 'images', e.topic, e.file))
      expect(buf.length).toBeGreaterThan(10_000) // 1024 源图体积下限
      expect(buf[0]).toBe(0x89)
      expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
    }
  })

  it('CREDITS.md 许可标注存在（M3.9 可追溯要求）', async () => {
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    expect(existsSync(join(process.cwd(), 'public', 'assets', 'images', 'CREDITS.md'))).toBe(true)
  })

  it('loadAnalysisImage 未知条目防御：缺缩略图时明确报错', async () => {
    await expect(
      loadAnalysisImage({ id: 'nope-99', topic: 'animals', file: 'nope-99.png', complexity: 1 }),
    ).rejects.toThrow(/缺失/)
  })
})
