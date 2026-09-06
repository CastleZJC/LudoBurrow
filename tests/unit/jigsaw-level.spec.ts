// 拼图图库清单与资产落地单测（关卡生成见 jigsaw-schemes.spec「方案 = 关卡」目录）
import { describe, it, expect } from 'vitest'
import {
  GALLERY,
  GALLERY_TOPICS,
  galleryEntry,
  sourceSrc,
  loadAnalysisImage,
} from '@/games/jigsaw/gallery'

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

  it('每复杂度段至少 4 张（内置方案占位网格分档不枯竭）', () => {
    for (const c of [1, 2, 3] as const) {
      expect(GALLERY.filter((e) => e.complexity === c).length).toBeGreaterThanOrEqual(4)
    }
  })

  it('galleryEntry 未知 id 抛 RangeError', () => {
    expect(() => galleryEntry('nope-99')).toThrow(RangeError)
  })
})

describe('内置图库资产落地（真实开源素材）', () => {
  it('THUMBS 缩略表与 GALLERY 清单一一对齐（JPEG/PNG data URI）', async () => {
    const { THUMBS } = await import('@/games/jigsaw/thumbs')
    expect(Object.keys(THUMBS).sort()).toEqual(GALLERY.map((e) => e.id).sort())
    for (const uri of Object.values(THUMBS)) {
      expect(uri.startsWith('data:image/jpeg;base64,') || uri.startsWith('data:image/png;base64,')).toBe(true)
      expect(uri.length).toBeGreaterThan(1000)
    }
  })

  it('24 张源图文件存在且为合法图片（按后缀校验魔数 + 体积下限）', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    for (const e of GALLERY) {
      const buf = readFileSync(join(process.cwd(), 'public', 'assets', 'images', e.topic, e.file))
      expect(buf.length).toBeGreaterThan(10_000) // 源图体积下限
      if (e.file.toLowerCase().endsWith('.png')) {
        expect(buf[0]).toBe(0x89)
        expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
      } else {
        // JPEG 魔数 FF D8 FF
        expect(buf[0]).toBe(0xff)
        expect(buf[1]).toBe(0xd8)
        expect(buf[2]).toBe(0xff)
      }
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
