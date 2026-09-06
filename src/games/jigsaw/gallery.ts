// 内置图库清单与加载器（技术架构 §11.9 / §15.3）
// 分发双轨（真实开源素材由 scripts/fetch-gallery.mjs 获取（Wikimedia Commons），许可见 assets/images/CREDITS.md）：
//   源图（2048 宽 JPEG/PNG）走 public/assets/images/<topic>/ 相对路径 —— 只用于绘制（drawImage 不受 canvas taint 限制）
//   分析缩略图（192 长边 data URI）内嵌 thumbs.ts —— 切块梯度分析需要 getImageData，data URI 不污染 canvas，
//   保证 file:// 离线模式下切块引擎永远可用（§11.6 本地算法兜底）

import type { ImageDataLike } from '@/engines/jigsaw-cutter'
import { THUMBS } from './thumbs'

export type GalleryTopicId = 'animals' | 'space' | 'scenery' | 'cartoon'

/** 难度档（验收四轮五：三档 → 六档；每专题内关卡块数窗口互斥递增，见 optimize.ts COMPLEXITY_PIECES） */
export type ComplexityLevel = 1 | 2 | 3 | 4 | 5 | 6

export interface GalleryEntry {
  id: string
  topic: GalleryTopicId
  /** public/assets/images/<topic>/ 下的文件名 */
  file: string
  /** 图片难度档：1=最简（大块）→ 6=最难（小块）；决定该图候选规格的块数窗口（optimize.ts） */
  complexity: ComplexityLevel
}

/** 专题分组（i18n key 见语言包 jigsaw.topic*） */
export const GALLERY_TOPICS: readonly { id: GalleryTopicId; labelKey: string }[] = [
  { id: 'animals', labelKey: 'jigsaw.topicAnimals' },
  { id: 'space', labelKey: 'jigsaw.topicSpace' },
  { id: 'scenery', labelKey: 'jigsaw.topicScenery' },
  { id: 'cartoon', labelKey: 'jigsaw.topicCartoon' },
]

/** 内置图库清单（24 张：每专题 6 张，难度档 1-6 逐张递增 —— 专题内关卡块数严格递增，验收四轮五）
 *  选图规则（验收四轮入档）：彩色、色彩鲜明、主体清晰、能引起孩子兴趣；
 *  取图管线（fetch-gallery.mjs）逐候选饱和度校验（check-color.ps1），灰度/黑白候选自动跳过 */
export const GALLERY: readonly GalleryEntry[] = [
  { id: 'animals-01', topic: 'animals', file: 'animals-01.jpg', complexity: 1 },
  { id: 'animals-02', topic: 'animals', file: 'animals-02.jpg', complexity: 2 },
  { id: 'animals-03', topic: 'animals', file: 'animals-03.jpg', complexity: 3 },
  { id: 'animals-04', topic: 'animals', file: 'animals-04.jpg', complexity: 4 },
  { id: 'animals-05', topic: 'animals', file: 'animals-05.jpg', complexity: 5 },
  { id: 'animals-06', topic: 'animals', file: 'animals-06.jpg', complexity: 6 },
  { id: 'space-01', topic: 'space', file: 'space-01.jpg', complexity: 1 },
  { id: 'space-02', topic: 'space', file: 'space-02.jpg', complexity: 2 },
  { id: 'space-03', topic: 'space', file: 'space-03.jpg', complexity: 3 },
  { id: 'space-04', topic: 'space', file: 'space-04.jpg', complexity: 4 },
  { id: 'space-05', topic: 'space', file: 'space-05.jpg', complexity: 5 },
  { id: 'space-06', topic: 'space', file: 'space-06.jpg', complexity: 6 },
  { id: 'scenery-01', topic: 'scenery', file: 'scenery-01.jpg', complexity: 1 },
  { id: 'scenery-02', topic: 'scenery', file: 'scenery-02.jpg', complexity: 2 },
  { id: 'scenery-03', topic: 'scenery', file: 'scenery-03.jpg', complexity: 3 },
  { id: 'scenery-04', topic: 'scenery', file: 'scenery-04.jpg', complexity: 4 },
  { id: 'scenery-05', topic: 'scenery', file: 'scenery-05.jpg', complexity: 5 },
  { id: 'scenery-06', topic: 'scenery', file: 'scenery-06.jpg', complexity: 6 },
  { id: 'cartoon-01', topic: 'cartoon', file: 'cartoon-01.png', complexity: 1 },
  { id: 'cartoon-02', topic: 'cartoon', file: 'cartoon-02.png', complexity: 2 },
  { id: 'cartoon-03', topic: 'cartoon', file: 'cartoon-03.png', complexity: 3 },
  { id: 'cartoon-04', topic: 'cartoon', file: 'cartoon-04.png', complexity: 4 },
  { id: 'cartoon-05', topic: 'cartoon', file: 'cartoon-05.png', complexity: 5 },
  { id: 'cartoon-06', topic: 'cartoon', file: 'cartoon-06.png', complexity: 6 },
]

/** 源图分发路径（相对路径，file:// 直接可读，仅绘制用） */
export function sourceSrc(entry: GalleryEntry): string {
  return `assets/images/${entry.topic}/${entry.file}`
}

export function galleryEntry(imageId: string, gallery: readonly GalleryEntry[] = GALLERY): GalleryEntry {
  const found = gallery.find((e) => e.id === imageId)
  if (!found) throw new RangeError(`jigsaw: 未知图库条目 ${imageId}`)
  return found
}

/** data URI → 像素数据（分析缩略图解码；data URI 不触发 canvas taint） */
export function decodeDataUrlToImageData(dataUrl: string): Promise<ImageDataLike> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('jigsaw: Canvas 2D 不可用'))
        return
      }
      ctx.drawImage(img, 0, 0)
      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
        resolve({ width: data.width, height: data.height, data: data.data })
      } catch (err) {
        // 防御：data URI 理论不 taint，此处兜底转译
        reject(err instanceof Error ? err : new Error('jigsaw: 读取像素失败'))
      }
    }
    img.onerror = () => reject(new Error('jigsaw: 分析缩略图解码失败'))
    img.src = dataUrl
  })
}

/** 取某关卡图片的分析像素（切块引擎输入；缩略表由 fetch-gallery.mjs 生成，正常恒有数据） */
export async function loadAnalysisImage(entry: GalleryEntry): Promise<ImageDataLike> {
  const dataUrl = THUMBS[entry.id]
  if (!dataUrl) throw new Error(`jigsaw: 图库条目 ${entry.id} 的分析缩略图缺失（请运行 scripts/fetch-gallery.mjs 重新生成）`)
  return decodeDataUrlToImageData(dataUrl)
}

/** 源图加载（绘制用；file:// 相对路径或 blob URL，drawImage 不需要读像素所以不受 taint 限制） */
export function loadSourceImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`jigsaw: 源图加载失败 ${src}`))
    img.src = src
  })
}

/**
 * 自定义源图 → 分析缩略像素（192 长边；§11.8 custom 来源方案）。
 * blob URL 同源不触发 canvas taint，可直接 getImageData（区别于 file:// 相对路径源图）。
 */
export function downscaleToAnalysis(
  img: CanvasImageSource & { width: number; height: number },
  maxEdge = 192,
): ImageDataLike {
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('jigsaw: Canvas 2D 不可用')
  ctx.drawImage(img, 0, 0, w, h)
  try {
    const data = ctx.getImageData(0, 0, w, h)
    return { width: w, height: h, data: data.data }
  } catch (err) {
    throw err instanceof Error ? err : new Error('jigsaw: 读取像素失败')
  }
}
