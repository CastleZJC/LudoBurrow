// PWA 图标生成器（开发计划 M6.2）：确定性程序化生成 icon-192.png / icon-512.png
// 零第三方依赖：Node 内置 zlib 手写 PNG 编码（RGBA8 + filter 0 + deflate）。
// 用法：node scripts/gen-pwa-icons.mjs
// 产出：public/icons/icon-192.png、public/icons/icon-512.png（同配方不同分辨率）
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

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
function encodePng(size, rgba) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- 绘制（相对坐标 0-1，192 与 512 同配方 → 内容一致） ----
// 品牌蓝底 + 白色拼图块剪影（上凸右凹互锁形）+ 三枚彩色圆点（三游戏）
const BG = [58, 110, 165]
const WHITE = [255, 255, 255]
const DOTS = [
  { cx: 0.2, cy: 0.82, color: [255, 183, 3] },
  { cx: 0.32, cy: 0.82, color: [78, 205, 196] },
  { cx: 0.26, cy: 0.68, color: [255, 111, 145] },
]

function render(size) {
  const px = new Uint8Array(size * size * 4)
  const put = (x, y, c) => {
    const i = (y * size + x) * 4
    px[i] = c[0]
    px[i + 1] = c[1]
    px[i + 2] = c[2]
    px[i + 3] = 255
  }
  const inCircle = (x, y, cx, cy, r) => Math.hypot(x / size - cx, y / size - cy) <= r

  // 拼图块剪影（相对坐标）：中央方块 + 顶部凸起圆 + 右侧凹陷圆（背景色）
  const inPiece = (x, y) => {
    const u = x / size
    const v = y / size
    const body = u >= 0.3 && u <= 0.7 && v >= 0.34 && v <= 0.74
    const knob = inCircle(x, y, 0.5, 0.34, 0.09) // 顶部凸起
    const socketCenter = { cx: 0.7, cy: 0.54, r: 0.09 }
    const socket = inCircle(x, y, socketCenter.cx, socketCenter.cy, socketCenter.r) // 右侧凹陷
    return (body || knob) && !socket
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inPiece(x, y)) put(x, y, WHITE)
      else put(x, y, BG)
    }
  }
  for (const d of DOTS) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (inCircle(x, y, d.cx, d.cy, 0.055)) put(x, y, d.color)
      }
    }
  }
  return px
}

const outDir = join(ROOT, 'public', 'icons')
mkdirSync(outDir, { recursive: true })
let total = 0
for (const size of [192, 512]) {
  const png = encodePng(size, render(size))
  writeFileSync(join(outDir, `icon-${size}.png`), png)
  total += png.length
}
console.log(`[gen-pwa-icons] icon-192.png + icon-512.png 生成完毕（${(total / 1024).toFixed(1)} KB）`)
