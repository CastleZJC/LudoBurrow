// 内置图库生成器（开发计划 M3.9 / M6.1 高难度段扩充）：确定性程序化生成 24 张源图 + 24 张分析缩略图
// 零第三方依赖：Node 内置 zlib 手写 PNG 编码（真图无第三方版权，许可见 CREDITS.md）。
// 用法：node scripts/gen-gallery.mjs
// 产出：public/assets/images/<topic>/<id>.png（1024 源图，仅绘制）
//       src/games/jigsaw/thumbs.ts（192 分析缩略 data URI，切块引擎输入）
//       public/assets/images/CREDITS.md（许可标注）

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---- 确定性 RNG（mulberry32；种子 = 图 id 哈希，重跑恒定） ----
function hashSeed(str) {
  let h = 2166136261
  for (const ch of str) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function rng(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- 极简 PNG 编码（RGBA8 + filter 0 + zlib deflate） ----
const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}
function crc32(...bufs) {
  let c = 0xffffffff
  for (const buf of bufs) for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.from(type, 'ascii'), data), 8 + data.length)
  return out
}
function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- 画布（相对坐标 0-1，任意分辨率同配方渲染 → 源图与缩略内容一致） ----
function hex(c) {
  const v = parseInt(c.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
function jitter(c, r, amp) {
  return [
    Math.max(0, Math.min(255, Math.round(c[0] + (r() * 2 - 1) * amp))),
    Math.max(0, Math.min(255, Math.round(c[1] + (r() * 2 - 1) * amp))),
    Math.max(0, Math.min(255, Math.round(c[2] + (r() * 2 - 1) * amp))),
  ]
}

class Canvas {
  constructor(size) {
    this.size = size
    this.px = new Uint8Array(size * size * 4)
  }
  blend(x, y, color, alpha = 1) {
    const s = this.size
    if (x < 0 || y < 0 || x >= s || y >= s) return
    const i = (y * s + x) * 4
    const a = this.px[i + 3] / 255
    this.px[i] = Math.round(color[0] * alpha + this.px[i] * (1 - alpha))
    this.px[i + 1] = Math.round(color[1] * alpha + this.px[i + 1] * (1 - alpha))
    this.px[i + 2] = Math.round(color[2] * alpha + this.px[i + 2] * (1 - alpha))
    this.px[i + 3] = 255
  }
  diagGradient(c1, c2) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = (x / (this.size - 1) + y / (this.size - 1)) / 2
        const c = mix(c1, c2, t)
        const i = (y * this.size + x) * 4
        this.px[i] = c[0]
        this.px[i + 1] = c[1]
        this.px[i + 2] = c[2]
        this.px[i + 3] = 255
      }
    }
  }
  circle(cx, cy, radius, color, alpha = 1) {
    const s = this.size
    const r = radius * s
    const x0 = Math.max(0, Math.floor((cx * s) - r - 1))
    const x1 = Math.min(s - 1, Math.ceil((cx * s) + r + 1))
    const y0 = Math.max(0, Math.floor((cy * s) - r - 1))
    const y1 = Math.min(s - 1, Math.ceil((cy * s) + r + 1))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x / s - cx
        const dy = y / s - cy
        const d = Math.hypot(dx, dy)
        if (d <= r) {
          const edge = Math.min(1, (r - d) * s) // 1px 抗锯齿边
          this.blend(x, y, color, alpha * Math.max(0, Math.min(1, edge)))
        }
      }
    }
  }
  rect(rx, ry, rw, rh, color, alpha = 1) {
    const s = this.size
    for (let y = Math.floor(ry * s); y < Math.ceil((ry + rh) * s); y++) {
      for (let x = Math.floor(rx * s); x < Math.ceil((rx + rw) * s); x++) {
        this.blend(x, y, color, alpha)
      }
    }
  }
  band(y0, y1, color, alpha) {
    this.rect(0, y0, 1, y1 - y0, color, alpha)
  }
  tri(x0, y0, x1, y1, x2, y2, color, alpha = 1) {
    const s = this.size
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2) * s))
    const maxX = Math.min(s - 1, Math.ceil(Math.max(x0, x1, x2) * s))
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2) * s))
    const maxY = Math.min(s - 1, Math.ceil(Math.max(y0, y1, y2) * s))
    const sign = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x / s
        const py = y / s
        const d1 = sign(x0, y0, x1, y1, px, py)
        const d2 = sign(x1, y1, x2, y2, px, py)
        const d3 = sign(x2, y2, x0, y0, px, py)
        const neg = d1 < 0 || d2 < 0 || d3 < 0
        const pos = d1 > 0 || d2 > 0 || d3 > 0
        if (!(neg && pos)) this.blend(x, y, color, alpha)
      }
    }
  }
  noise(count, amp, r) {
    for (let k = 0; k < count; k++) {
      const x = Math.floor(r() * this.size)
      const y = Math.floor(r() * this.size)
      const i = (y * this.size + x) * 4
      const c = [this.px[i], this.px[i + 1], this.px[i + 2]]
      const j = jitter(c, r, amp)
      this.blend(x, y, j, 0.8)
    }
  }
}

// ---- 图库清单与专题配色（与 gallery.ts 对齐：每专题 5 张，复杂度 2/2/1） ----
const TOPICS = {
  animals: {
    bg: ['#f7e8d2', '#e3c193'],
    fg: ['#d9843b', '#b5651d', '#8c4a1f', '#f0b35c', '#7a3b10'],
  },
  space: {
    bg: ['#0b1030', '#231045'],
    fg: ['#e8e0ff', '#8f7bd9', '#5a4a9f', '#c9b8ff', '#3d2f7a'],
  },
  scenery: {
    bg: ['#cfe8f5', '#9fd0b5'],
    fg: ['#2e6f4e', '#4a90a4', '#1f4d3a', '#7fb069', '#27647b'],
  },
  cartoon: {
    bg: ['#fff3d6', '#ffe0ec'],
    fg: ['#ff6f91', '#ffb703', '#4ecdc4', '#a06cd5', '#ff9f1c'],
  },
}
// 每专题 6 张：复杂度 1,1,2,2,3,3（M6.1 高难度段 ×2，与 gallery.ts 清单一致）
const COMPLEXITY_PLAN = [1, 1, 2, 2, 3, 3]

/** 按复杂度配方渲染（相对坐标：源图 1024 与缩略 192 同配方 → 内容一致） */
function render(size, topicId, index, complexity) {
  const topic = TOPICS[topicId]
  const seed = rng(hashSeed(`${topicId}-${String(index).padStart(2, '0')}`))
  const canvas = new Canvas(size)
  const fg = topic.fg.map(hex)
  canvas.diagGradient(hex(topic.bg[0]), hex(topic.bg[1]))

  if (complexity === 1) {
    // 主体突出：2 大圆 + 1 大三角（低关：大色块分明）
    canvas.circle(0.36 + seed() * 0.08, 0.4 + seed() * 0.08, 0.26, fg[0])
    canvas.circle(0.68, 0.66, 0.18, fg[3])
    canvas.tri(0.55, 0.16, 0.88, 0.42, 0.52, 0.48, fg[1])
    canvas.band(0.86, 1.0, fg[2], 0.5)
  } else if (complexity === 2) {
    // 均衡：中形状组合 + 条带（中关：梯度适中）
    for (let k = 0; k < 7; k++) {
      const color = fg[Math.floor(seed() * fg.length)]
      const cx = 0.12 + seed() * 0.76
      const cy = 0.12 + seed() * 0.76
      if (seed() < 0.55) canvas.circle(cx, cy, 0.07 + seed() * 0.1, color)
      else canvas.rect(cx - 0.09, cy - 0.07, 0.14 + seed() * 0.12, 0.1 + seed() * 0.12, color)
    }
    canvas.band(0.06, 0.12, fg[4], 0.55)
    canvas.band(0.9, 0.96, fg[2], 0.55)
  } else {
    // 细节丰富色彩相近（高关：梯度密集、唯一性挑战）
    const near = [fg[0], fg[1], fg[2]]
    for (let k = 0; k < 64; k++) {
      const color = jitter(near[Math.floor(seed() * near.length)], seed, 10)
      const cx = 0.04 + seed() * 0.92
      const cy = 0.04 + seed() * 0.92
      if (seed() < 0.6) canvas.circle(cx, cy, 0.028 + seed() * 0.05, color, 0.85)
      else canvas.rect(cx - 0.04, cy - 0.035, 0.05 + seed() * 0.06, 0.04 + seed() * 0.06, color, 0.85)
    }
    for (let k = 0; k < 5; k++) {
      canvas.band(seed(), seed() + 0.05, jitter(near[k % 3], seed, 8), 0.3)
    }
    canvas.noise(Math.round(size * size * 0.004), 14, seed)
  }
  return canvas
}

// ---- 主流程：20 张图 → 源图 PNG + 缩略 data URI ----
const SOURCE_SIZE = 1024
const THUMB_SIZE = 192

const thumbs = {}
let totalSourceBytes = 0
for (const [topicId, topic] of Object.entries(TOPICS)) {
  const dir = join(ROOT, 'public', 'assets', 'images', topicId)
  mkdirSync(dir, { recursive: true })
  COMPLEXITY_PLAN.forEach((complexity, i) => {
    const id = `${topicId}-${String(i + 1).padStart(2, '0')}`

    const sourcePng = encodePng(SOURCE_SIZE, SOURCE_SIZE, render(SOURCE_SIZE, topicId, i + 1, complexity).px)
    writeFileSync(join(dir, `${id}.png`), sourcePng)
    totalSourceBytes += sourcePng.length

    const thumbPng = encodePng(THUMB_SIZE, THUMB_SIZE, render(THUMB_SIZE, topicId, i + 1, complexity).px)
    thumbs[id] = `data:image/png;base64,${thumbPng.toString('base64')}`
  })
  void topic
}

// thumbs.ts 生成（单一出处；gallery.ts 经 THUMBS 读分析缩略）
const thumbsTs = `// 自动生成：scripts/gen-gallery.mjs（M3.9 内置图库，勿手改）
// 分析缩略图：192 长边 PNG data URI（切块引擎输入；data URI 不触发 canvas taint，file:// 离线可用）
// 源图：public/assets/images/<topic>/<id>.png（1024，仅绘制用）
export const THUMBS: Record<string, string> = {
${Object.entries(thumbs)
  .map(([id, uri]) => `  '${id}': '${uri}',`)
  .join('\n')}
}
`
writeFileSync(join(ROOT, 'src', 'games', 'jigsaw', 'thumbs.ts'), thumbsTs)

// 许可标注（M3.9 要求：图库来源与许可可追溯）
writeFileSync(
  join(ROOT, 'public', 'assets', 'images', 'CREDITS.md'),
  `# 内置图库许可标注

全部 24 张图片（animals / space / scenery / cartoon 各 6 张）由本项目脚本
\`scripts/gen-gallery.mjs\` 确定性程序化生成（种子化几何图形 + 渐变），非第三方素材，
无版权与许可限制，随本项目 LICENSE（见仓库根目录）一同发布。

- 源图：\`<topic>/<id>.png\`（1024×1024，仅绘制用）
- 分析缩略：内嵌于 \`src/games/jigsaw/thumbs.ts\`（192 长边 data URI，切块引擎输入）
- 重新生成：\`node scripts/gen-gallery.mjs\`（输出恒定，可复现）
`,
)

const thumbKb = Math.round(Buffer.byteLength(thumbsTs) / 1024)
console.log(`[gen-gallery] 24 张源图（${(totalSourceBytes / 1024).toFixed(0)} KB）+ thumbs.ts（${thumbKb} KB）+ CREDITS.md 生成完毕`)
