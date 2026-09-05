// 迷宫瓦片与角色资产生成器（开发计划 M4.2/M4.3，技术架构 §12.3/§12.4）
// 确定性程序化生成（零第三方依赖，M3.9 同口径：离线环境无外网 CC0 素材渠道）：
//   用法：node scripts/gen-maze-assets.mjs
//   产出：public/assets/tiles/<castle|garden>/{wall,floor,goal,start}.png（32×32）
//         public/assets/sprites/hero.png（96×128：4 行方向 down/left/right/up × 3 列帧 stand/walk1/walk2，帧 32×32）
//         public/assets/tiles/CREDITS.md（许可标注，同时覆盖 sprites/）
// 运行时绘制仅 drawImage（不读像素，无 canvas taint）；皮肤加载失败由 theme.ts 色板兜底。

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---- PNG 编码（RGBA8 + filter 0 + zlib；与 gen-gallery.mjs 同实现口径） ----
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
    raw[y * (stride + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- 像素画布（硬边 rect，像素风） ----
const T = 32
class Px {
  constructor(size = T) {
    this.size = size
    this.data = new Uint8Array(size * size * 4)
  }
  rect(x, y, w, h, hex, alpha = 1) {
    const [r, g, b] = hexRgb(hex)
    for (let yy = Math.max(0, y); yy < Math.min(this.size, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.size, x + w); xx++) {
        const i = (yy * this.size + xx) * 4
        const prev = this.data[i + 3] / 255
        this.data[i] = Math.round(r * alpha + this.data[i] * (1 - alpha) * prev)
        this.data[i + 1] = Math.round(g * alpha + this.data[i + 1] * (1 - alpha) * prev)
        this.data[i + 2] = Math.round(b * alpha + this.data[i + 2] * (1 - alpha) * prev)
        this.data[i + 3] = 255
      }
    }
  }
  /** 描边圆环（像素近似：四段弧块；cx/cy/r 以像素计） */
  ring(cx, cy, r, hex) {
    for (let a = 0; a < 64; a++) {
      const rad = (a / 64) * Math.PI * 2
      const x = Math.round(cx + Math.cos(rad) * r)
      const y = Math.round(cy + Math.sin(rad) * r)
      this.rect(x, y, 2, 2, hex)
    }
  }
  png() {
    return encodePng(this.size, this.size, this.data)
  }
}
function hexRgb(hex) {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

// ---- 主题瓦片（确定性图案，无随机维度） ----
const THEMES = {
  castle: {
    wall(px) {
      px.rect(0, 0, T, T, '#6d7280') // 砖缝底
      for (let row = 0; row < 4; row++) {
        const y = row * 8
        const offset = row % 2 === 0 ? 0 : 8
        for (let bx = -16; bx < T; bx += 16) {
          px.rect(bx + offset + 1, y + 1, 14, 6, '#a8adb8') // 砖块
          px.rect(bx + offset + 1, y + 1, 14, 1, '#b8bdc8') // 顶高光
        }
      }
      px.rect(0, 0, T, 2, '#c3c8d2')
    },
    floor(px) {
      px.rect(0, 0, T, T, '#b9bdc6')
      for (let gy = 0; gy < T; gy += 16) {
        for (let gx = 0; gx < T; gx += 16) {
          px.rect(gx + 1, gy + 1, 14, 14, '#c4c8d1')
          px.rect(gx + 3, gy + 3, 3, 3, '#aeb2bb') // 石纹点
        }
      }
    },
    goal(px) {
      THEMES.castle.floor(px)
      px.rect(6, 4, 20, 26, '#d9a441') // 金框
      px.rect(9, 7, 14, 23, '#4a3b2a') // 门洞
      px.rect(11, 9, 10, 19, '#2f2519')
      px.rect(19, 17, 2, 2, '#d9a441') // 门把
    },
    start(px) {
      THEMES.castle.floor(px)
      px.ring(16, 16, 9, '#d9a441')
      px.ring(16, 16, 5, '#e8c877')
    },
  },
  garden: {
    wall(px) {
      px.rect(0, 0, T, T, '#2f5e36')
      // 叶簇：固定图案表（确定性）
      const clusters = [
        [2, 2], [10, 1], [18, 3], [26, 2], [5, 8], [13, 7], [21, 9], [28, 7],
        [1, 14], [9, 13], [17, 15], [25, 13], [4, 20], [12, 19], [20, 21], [27, 19],
        [2, 26], [10, 25], [18, 27], [26, 25], [7, 5], [23, 5], [15, 11], [7, 23], [23, 23],
      ]
      for (const [cx, cy] of clusters) px.rect(cx, cy, 4, 4, '#3f7a44')
      for (const [cx, cy] of clusters) px.rect(cx + 1, cy, 2, 2, '#5e9b63')
      px.rect(0, 0, T, 1, '#5e9b63')
    },
    floor(px) {
      px.rect(0, 0, T, T, '#7fb069')
      const dots = [
        [3, 4], [12, 2], [22, 6], [29, 3], [6, 12], [17, 11], [27, 14], [2, 21],
        [10, 19], [20, 22], [29, 20], [5, 28], [15, 27], [24, 28], [13, 8], [26, 9],
      ]
      for (const [dx, dy] of dots) px.rect(dx, dy, 2, 3, '#699e54')
      for (const [dx, dy] of [[8, 6], [19, 16], [28, 26], [1, 10]]) px.rect(dx, dy, 2, 2, '#8fc47a')
    },
    goal(px) {
      THEMES.garden.floor(px)
      // 红花出口标记
      px.rect(14, 6, 4, 8, '#3f7a44') // 茎
      px.rect(11, 4, 10, 7, '#e05b5b') // 花冠
      px.rect(13, 3, 6, 2, '#ef8a8a')
      px.rect(12, 11, 3, 3, '#5e9b63') // 叶
      px.rect(18, 12, 3, 3, '#5e9b63')
      px.rect(15, 18, 2, 10, '#8a6b4a') // 花杆
      px.ring(16, 25, 4, '#f2d06b')
    },
    start(px) {
      THEMES.garden.floor(px)
      px.ring(16, 16, 9, '#f2d06b')
      px.ring(16, 16, 5, '#f8e39b')
    },
  },
}

// ---- 像素小人（§12.4 马里奥式卡通小人：帽 + 脸 + 身 + 腿；4 方向 × 3 帧） ----
const SKIN = '#f2c9a0'
const HAT = '#d94f4f'
const HAIR = '#6b4a2f'
const SHIRT = '#4a7bd0'
const PANTS = '#2d4a8a'
const SHOE = '#3a2f2a'
const EYE = '#26221f'

function heroFrame(facing, frame) {
  const px = new Px(T)
  // 帽 + 脸
  px.rect(10, 3, 12, 4, HAT)
  px.rect(9, 6, 14, 2, HAT) // 帽檐
  if (facing === 'up') {
    px.rect(10, 8, 12, 7, HAIR) // 后脑勺
  } else {
    px.rect(10, 8, 12, 7, SKIN)
    if (facing === 'down') {
      px.rect(13, 11, 2, 2, EYE)
      px.rect(18, 11, 2, 2, EYE)
    } else if (facing === 'left') {
      px.rect(12, 11, 2, 2, EYE)
    } else {
      px.rect(19, 11, 2, 2, EYE)
    }
  }
  // 身体与手臂
  px.rect(10, 15, 12, 9, SHIRT)
  if (facing === 'left') {
    px.rect(9, 16, 2, 6, SKIN) // 前臂
  } else if (facing === 'right') {
    px.rect(21, 16, 2, 6, SKIN)
  } else {
    px.rect(8, 16, 2, 6, SKIN)
    px.rect(22, 16, 2, 6, SKIN)
  }
  // 腿（帧 0 站立 / 1 左迈 / 2 右迈；上下方向双腿并排，左右方向前后错位）
  const legY = 24
  if (facing === 'left' || facing === 'right') {
    const front = facing === 'left' ? 12 : 16
    const back = facing === 'left' ? 16 : 12
    if (frame === 1) {
      px.rect(front, legY, 4, 5, PANTS)
      px.rect(back, legY + 1, 4, 5, PANTS)
    } else if (frame === 2) {
      px.rect(front, legY + 1, 4, 5, PANTS)
      px.rect(back, legY, 4, 5, PANTS)
    } else {
      px.rect(12, legY, 4, 6, PANTS)
      px.rect(16, legY, 4, 6, PANTS)
    }
  } else if (frame === 1) {
    px.rect(12, legY, 3, 5, PANTS)
    px.rect(18, legY + 1, 3, 6, PANTS)
  } else if (frame === 2) {
    px.rect(12, legY + 1, 3, 6, PANTS)
    px.rect(18, legY, 3, 5, PANTS)
  } else {
    px.rect(12, legY, 3, 6, PANTS)
    px.rect(18, legY, 3, 6, PANTS)
  }
  // 鞋（与腿同步）
  const shoes = frame === 1 ? [[12, 29], [18, 30]] : frame === 2 ? [[12, 30], [18, 29]] : [[12, 30], [18, 30]]
  for (const [sx, sy] of shoes) px.rect(sx, Math.min(sy, 30), 3, 2, SHOE)
  return px
}

// ---- 主流程 ----
let fileCount = 0
let totalBytes = 0
const write = (file, buf) => {
  writeFileSync(file, buf)
  fileCount++
  totalBytes += buf.length
}

for (const [themeId, tiles] of Object.entries(THEMES)) {
  const dir = join(ROOT, 'public', 'assets', 'tiles', themeId)
  mkdirSync(dir, { recursive: true })
  for (const kind of ['wall', 'floor', 'goal', 'start']) {
    const px = new Px(T)
    tiles[kind](px)
    write(join(dir, `${kind}.png`), px.png())
  }
}

// sprite 条带：4 行方向 × 3 列帧（96×128，行序 down/left/right/up 与 DIRS 渲染序一致）
const FACINGS = ['down', 'left', 'right', 'up']
const STRIP_W = T * 3
const STRIP_H = T * 4
const strip = new Uint8Array(STRIP_W * STRIP_H * 4)
FACINGS.forEach((facing, row) => {
  for (let col = 0; col < 3; col++) {
    const frame = heroFrame(facing, col)
    for (let y = 0; y < T; y++) {
      const src = y * T * 4
      const dst = (row * T + y) * STRIP_W * 4 + col * T * 4
      strip.set(frame.data.subarray(src, src + T * 4), dst)
    }
  }
})
const spriteDir = join(ROOT, 'public', 'assets', 'sprites')
mkdirSync(spriteDir, { recursive: true })
write(join(spriteDir, 'hero.png'), encodePng(STRIP_W, STRIP_H, strip))

// 许可标注（M4.2/M4.3：程序化生成，随项目 MIT；覆盖 tiles 与 sprites）
writeFileSync(
  join(ROOT, 'public', 'assets', 'tiles', 'CREDITS.md'),
  `# 迷宫瓦片与角色素材许可标注

全部素材由本项目脚本 \`scripts/gen-maze-assets.mjs\` 确定性程序化生成（像素图案硬边绘制，无随机维度），
非第三方素材，无版权与许可限制，随本项目 LICENSE（见仓库根目录）一同发布：

- \`<castle|garden>/{wall,floor,goal,start}.png\`：32×32 瓦片（城堡=石砖/石板，花园=树篱/草地）
- \`../sprites/hero.png\`：96×128 像素小人条带（4 行方向 down/left/right/up × 3 列帧 stand/walk1/walk2，帧 32×32）
- 重新生成：\`node scripts/gen-maze-assets.mjs\`（输出恒定，可复现）
`,
)

console.log(
  `[gen-maze-assets] ${fileCount} 个文件（${(totalBytes / 1024).toFixed(1)} KB）：8 张瓦片 + hero.png 条带 + CREDITS.md`,
)
