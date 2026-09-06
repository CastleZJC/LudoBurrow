// 迷宫瓦片与角色资产生成器（开发计划 M4.2/M4.3，技术架构 §12.3/§12.4）
// 确定性程序化生成（零第三方依赖，M3.9 同口径：离线环境无外网 CC0 素材渠道）：
//   用法：node scripts/gen-maze-assets.mjs
//   产出：public/assets/tiles/<castle|garden|snow|volcano|ocean|jungle|station|mine>/{wall,floor,goal,start}.png（1024×1024，v1.0 验收返工高清化）
//         public/assets/sprites/hero.png（768×1024：4 行方向 down/left/right/up × 3 列帧 stand/walk1/walk2，帧 256×256）
//         public/assets/tiles/CREDITS.md（许可标注，同时覆盖 sprites/）
// 运行时绘制仅 drawImage（不读像素，无 canvas taint）；皮肤加载失败由 theme.ts 色板兜底。
// 高清化口径：像素画逻辑坐标系 T=32 不变（细节坐标零改动），Px 以整数倍率放大——
//   瓦片 ×32（→ 1024²）、hero 帧 ×8（→ 256²）：硬边无插值，高分辨率源缩小绘制更锐利。

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---- PNG 编码（RGBA8 + filter 0 + zlib deflate，手写 chunk/CRC32） ----
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

// ---- 像素画布（硬边 rect，像素风；逻辑坐标 × 整数倍率放大，验收返工高清化） ----
const T = 32
const TILE_SCALE = 32 // 瓦片：32×32 逻辑 → 1024×1024 物理
const HERO_SCALE = 8  // hero 帧：32×32 逻辑 → 256×256 物理（条带 768×1024）
class Px {
  constructor(size = T, scale = TILE_SCALE) {
    this.size = size
    this.scale = scale
    this.dim = size * scale
    this.data = new Uint8Array(this.dim * this.dim * 4)
  }
  rect(x, y, w, h, hex, alpha = 1) {
    const [r, g, b] = hexRgb(hex)
    const x0 = Math.max(0, x * this.scale)
    const y0 = Math.max(0, y * this.scale)
    const x1 = Math.min(this.dim, (x + w) * this.scale)
    const y1 = Math.min(this.dim, (y + h) * this.scale)
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.dim + xx) * 4
        const prev = this.data[i + 3] / 255
        this.data[i] = Math.round(r * alpha + this.data[i] * (1 - alpha) * prev)
        this.data[i + 1] = Math.round(g * alpha + this.data[i + 1] * (1 - alpha) * prev)
        this.data[i + 2] = Math.round(b * alpha + this.data[i + 2] * (1 - alpha) * prev)
        this.data[i + 3] = 255
      }
    }
  }
  /** 描边圆环（像素近似：四段弧块；cx/cy/r 以逻辑像素计） */
  ring(cx, cy, r, hex) {
    for (let a = 0; a < 64; a++) {
      const rad = (a / 64) * Math.PI * 2
      const x = Math.round(cx + Math.cos(rad) * r)
      const y = Math.round(cy + Math.sin(rad) * r)
      this.rect(x, y, 2, 2, hex)
    }
  }
  png() {
    return encodePng(this.dim, this.dim, this.data)
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
      // 叶簇下缘阴影 + 底缘暗线（验收返工二轮「像素加密」：立体感）
      for (const [cx, cy] of clusters) px.rect(cx, cy + 3, 4, 1, '#27522c')
      px.rect(0, 31, T, 1, '#27522c')
      px.rect(0, 0, T, 1, '#5e9b63')
    },
    floor(px) {
      px.rect(0, 0, T, T, '#7fb069')
      const dots = [
        [3, 4], [12, 2], [22, 6], [29, 3], [6, 12], [17, 11], [27, 14], [2, 21],
        [10, 19], [20, 22], [29, 20], [5, 28], [15, 27], [24, 28], [13, 8], [26, 9],
      ]
      for (const [dx, dy] of dots) px.rect(dx, dy, 2, 3, '#699e54')
      // 草丝 + 高光草斑 + 小花点缀（验收返工二轮「像素加密」：草地不再大面积纯色）
      const blades = [[8, 6], [20, 16], [29, 26], [1, 10], [12, 24], [25, 8], [5, 18], [17, 29]]
      for (const [bx, by] of blades) px.rect(bx, by, 1, 3, '#5e8f4c')
      for (const [hx, hy] of [[8, 7], [20, 17], [1, 11]]) px.rect(hx, hy, 2, 2, '#8fc47a')
      for (const [fx, fy] of [[14, 3], [4, 28], [27, 13]]) px.rect(fx, fy, 2, 2, '#f4f0d8')
    },
    goal(px) {
      THEMES.garden.floor(px)
      // 花园木门出口（验收返工二轮：门清晰可见，门楣留花点缀保留花园意象）
      px.rect(5, 3, 22, 28, '#7a5a3a') // 木门框
      px.rect(8, 6, 16, 24, '#8a6b4a') // 门板
      px.rect(9, 7, 6, 22, '#9a7b58') // 左门板
      px.rect(17, 7, 6, 22, '#9a7b58') // 右门板
      px.rect(8, 6, 16, 3, '#a58a64') // 门楣
      px.rect(15, 16, 2, 2, '#f2d06b') // 门把
      px.rect(4, 1, 24, 3, '#5e9b63') // 门楣绿化
      px.rect(6, 0, 3, 3, '#e05b5b') // 左花
      px.rect(14, 0, 4, 3, '#e05b5b') // 中花
      px.rect(23, 0, 3, 3, '#ef8a8a') // 右花
    },
    start(px) {
      THEMES.garden.floor(px)
      px.ring(16, 16, 9, '#f2d06b')
      px.ring(16, 16, 5, '#f8e39b')
    },
  },
  snow: {
    wall(px) {
      px.rect(0, 0, T, T, '#9db8cc') // 冰缝底
      for (let row = 0; row < 4; row++) {
        const y = row * 8
        const offset = row % 2 === 0 ? 0 : 8
        for (let bx = -16; bx < T; bx += 16) {
          px.rect(bx + offset + 1, y + 1, 14, 6, '#d5e4f0') // 冰砖
          px.rect(bx + offset + 1, y + 1, 14, 1, '#e8f2fa') // 顶高光
          px.rect(bx + offset + 3, y + 5, 4, 1, '#c0d4e4') // 冰纹
        }
      }
      px.rect(0, 0, T, 3, '#ffffff') // 顶部积雪
      px.rect(0, 3, T, 1, '#dfe9f2')
    },
    floor(px) {
      px.rect(0, 0, T, T, '#e8f0f8')
      const drifts = [[2, 3], [12, 2], [22, 5], [28, 2], [5, 12], [16, 10], [26, 14], [2, 21], [10, 19], [20, 22], [29, 20], [5, 28], [15, 27], [24, 28]]
      for (const [dx, dy] of drifts) px.rect(dx, dy, 3, 2, '#d3e2ee')
      for (const [sx, sy] of [[8, 7], [19, 16], [28, 26], [1, 11]]) px.rect(sx, sy, 2, 2, '#f6fafd')
    },
    goal(px) {
      THEMES.snow.floor(px)
      px.rect(6, 4, 20, 26, '#4a90d9') // 冰蓝门框
      px.rect(9, 7, 14, 23, '#1b4a6b') // 门洞
      px.rect(11, 9, 4, 19, '#a8d4f2') // 冰晶高光
      px.rect(19, 17, 2, 2, '#e8f2fa') // 门把
    },
    start(px) {
      THEMES.snow.floor(px)
      px.ring(16, 16, 9, '#9fd0f0')
      px.ring(16, 16, 5, '#c8e6f8')
    },
  },
  volcano: {
    wall(px) {
      px.rect(0, 0, T, T, '#241813') // 岩缝底
      const rocks = [
        [0, 0, 12, 10], [14, 0, 17, 8], [0, 12, 9, 9], [11, 10, 10, 11], [23, 10, 8, 10],
        [0, 23, 14, 8], [16, 22, 15, 9],
      ]
      for (const [x, y, w, h] of rocks) {
        px.rect(x + 1, y + 1, w - 2, h - 2, '#3a2a24') // 玄武岩块
        px.rect(x + 1, y + 1, w - 2, 1, '#4e3a30') // 顶高光
      }
      px.rect(12, 9, 2, 2, '#b8481f') // 裂缝岩浆微光
      px.rect(9, 21, 2, 3, '#b8481f')
      px.rect(25, 19, 2, 2, '#8a3517')
    },
    floor(px) {
      px.rect(0, 0, T, T, '#38221b')
      const grit = [[3, 4], [12, 2], [22, 6], [29, 3], [6, 12], [17, 11], [27, 14], [2, 21], [10, 19], [20, 22], [29, 20], [5, 28], [15, 27], [24, 28]]
      for (const [dx, dy] of grit) px.rect(dx, dy, 2, 2, '#502e24')
      for (const [gx, gy] of [[14, 8], [8, 26], [26, 9]]) px.rect(gx, gy, 2, 2, '#7a2f1a') // 余烬
    },
    goal(px) {
      THEMES.volcano.floor(px)
      px.rect(6, 4, 20, 26, '#241813') // 深岩框
      px.rect(9, 7, 14, 23, '#ff7a3c') // 熔岩门洞
      px.rect(11, 10, 10, 17, '#ffd24a') // 熔岩芯
      px.rect(19, 17, 2, 2, '#241813') // 门把
    },
    start(px) {
      THEMES.volcano.floor(px)
      px.ring(16, 16, 9, '#ffb347')
      px.ring(16, 16, 5, '#ffd88a')
    },
  },
  ocean: {
    wall(px) {
      px.rect(0, 0, T, T, '#1e5068') // 水体底
      const corals = [
        [2, 4], [12, 2], [22, 5], [5, 13], [15, 11], [25, 14], [2, 22], [11, 20], [21, 23], [28, 20], [7, 27], [18, 28],
      ]
      for (const [cx, cy] of corals) {
        px.rect(cx, cy, 5, 6, '#2e6f8e') // 礁石块
        px.rect(cx + 1, cy, 3, 2, '#55a0b8') // 亮边
      }
      px.rect(8, 6, 2, 5, '#d9776b') // 珊瑚枝
      px.rect(7, 8, 4, 1, '#d9776b')
      px.rect(24, 24, 2, 5, '#d9776b')
      px.rect(23, 26, 4, 1, '#d9776b')
    },
    floor(px) {
      px.rect(0, 0, T, T, '#1e4a68')
      const ripples = [[2, 5], [10, 3], [19, 7], [27, 4], [5, 14], [14, 12], [24, 16], [2, 23], [11, 21], [21, 24], [28, 22], [6, 29], [17, 28]]
      for (const [rx, ry] of ripples) px.rect(rx, ry, 4, 1, '#2a5c7d') // 沙纹
      for (const [bx, by] of [[15, 9], [8, 26], [26, 12]]) { // 气泡
        px.rect(bx, by, 2, 2, '#7fd8f5')
        px.rect(bx + 1, by - 2, 1, 1, '#7fd8f5')
      }
    },
    goal(px) {
      THEMES.ocean.floor(px)
      px.rect(6, 4, 20, 26, '#ffd166') // 金框
      px.rect(9, 7, 14, 23, '#0f3550') // 门洞
      px.rect(11, 9, 10, 8, '#ffd166') // 上浮雕
      px.rect(14, 12, 4, 3, '#f0f6fa') // 珍珠
      px.rect(19, 17, 2, 2, '#ffd166') // 门把
    },
    start(px) {
      THEMES.ocean.floor(px)
      px.ring(16, 16, 9, '#7fd8f5')
      px.ring(16, 16, 5, '#b8ecfa')
    },
  },
  jungle: {
    wall(px) {
      px.rect(0, 0, T, T, '#3a5030') // 苔底
      const stones = [
        [1, 4, 10, 9], [13, 2, 9, 8], [24, 4, 7, 9], [1, 15, 8, 9], [11, 12, 10, 10], [23, 15, 8, 8], [2, 26, 11, 5], [15, 24, 14, 6],
      ]
      for (const [x, y, w, h] of stones) {
        px.rect(x + 1, y + 1, w - 2, h - 2, '#5a6e46')
        px.rect(x + 1, y + 1, w - 2, 1, '#6b8452')
      }
      const moss = [[3, 6], [15, 4], [26, 6], [6, 17], [14, 14], [25, 17], [4, 28], [18, 26]]
      for (const [mx, my] of moss) px.rect(mx, my, 3, 2, '#6b9b4e') // 苔斑
      px.rect(6, 0, 2, 8, '#4a7a3a') // 顶部垂藤
      px.rect(18, 0, 2, 11, '#4a7a3a')
      px.rect(27, 0, 2, 6, '#4a7a3a')
      px.rect(5, 8, 4, 2, '#568f46') // 藤叶
      px.rect(17, 11, 4, 2, '#568f46')
    },
    floor(px) {
      px.rect(0, 0, T, T, '#6b5138')
      const leaves = [[3, 4], [12, 2], [22, 6], [29, 3], [6, 12], [17, 11], [27, 14], [2, 21], [10, 19], [20, 22], [29, 20], [5, 28], [15, 27], [24, 28]]
      for (const [lx, ly] of leaves) px.rect(lx, ly, 3, 2, '#7d6244') // 落叶
      const grass = [[8, 7], [19, 16], [28, 26], [1, 11], [13, 24], [25, 8]]
      for (const [gx, gy] of grass) px.rect(gx, gy, 1, 3, '#5e7a42') // 草
    },
    goal(px) {
      THEMES.jungle.floor(px)
      px.rect(6, 4, 20, 26, '#8a5a2a') // 木框
      px.rect(9, 7, 14, 23, '#4a3018') // 门洞
      px.rect(10, 10, 3, 17, '#a5754a') // 门板刻纹
      px.rect(15, 10, 3, 17, '#a5754a')
      px.rect(19, 10, 3, 17, '#a5754a')
      px.rect(19, 17, 2, 2, '#e8985a') // 门把
    },
    start(px) {
      THEMES.jungle.floor(px)
      px.ring(16, 16, 9, '#d4c05a')
      px.ring(16, 16, 5, '#e8da8a')
    },
  },
  station: {
    wall(px) {
      px.rect(0, 0, T, T, '#2a3242') // 板缝底
      px.rect(2, 2, 28, 13, '#3d4859') // 上板
      px.rect(2, 17, 28, 13, '#3d4859') // 下板
      px.rect(2, 2, 28, 1, '#55647a') // 板高光
      px.rect(2, 17, 28, 1, '#55647a')
      const rivets = [[4, 4], [27, 4], [4, 14], [27, 14], [4, 19], [27, 19], [4, 29], [27, 29], [15, 4], [15, 29]]
      for (const [rx, ry] of rivets) px.rect(rx, ry, 2, 2, '#8fa3b8') // 铆钉
      px.rect(2, 15, 28, 2, '#64f0c8') // 警示条
      px.rect(2, 15, 28, 1, '#8ff5da')
    },
    floor(px) {
      px.rect(0, 0, T, T, '#232a3d')
      for (let gy = 0; gy < T; gy += 16) {
        for (let gx = 0; gx < T; gx += 16) {
          px.rect(gx + 1, gy + 1, 14, 14, '#2b3448') // 面板
          px.rect(gx + 1, gy + 1, 14, 1, '#343f57')
        }
      }
      px.rect(8, 8, 2, 2, '#64f0c8') // 指示灯
      px.rect(24, 24, 2, 2, '#64f0c8')
    },
    goal(px) {
      THEMES.station.floor(px)
      px.rect(5, 3, 22, 27, '#8fa3b8') // 金属框
      px.rect(8, 6, 16, 22, '#10141f') // 门体
      px.rect(15, 6, 2, 22, '#232a3d') // 门缝
      px.rect(8, 6, 16, 2, '#64f0c8') // 荧光门楣
      px.rect(5, 3, 2, 27, '#aebfd0')
      px.rect(18, 17, 2, 2, '#8fa3b8') // 门把
    },
    start(px) {
      THEMES.station.floor(px)
      px.ring(16, 16, 9, '#9ab8f0')
      px.ring(16, 16, 5, '#c3d4f8')
    },
  },
  mine: {
    wall(px) {
      px.rect(0, 0, T, T, '#3a2f22') // 岩底
      const layers = [[0, 2, 32, 8], [0, 12, 32, 8], [0, 22, 32, 8]]
      for (const [x, y, w, h] of layers) {
        px.rect(x + 1, y + 1, w - 2, h - 2, '#4a3c2c')
        px.rect(x + 1, y + 1, w - 2, 1, '#5c4c38')
      }
      px.rect(0, 10, T, 3, '#7a5f42') // 木横梁
      px.rect(0, 20, T, 3, '#7a5f42')
      px.rect(1, 10, 2, 13, '#7a5f42') // 木立柱
      px.rect(29, 10, 2, 13, '#7a5f42')
      px.rect(3, 11, 1, 1, '#9a8a6a') // 钉
      px.rect(28, 11, 1, 1, '#9a8a6a')
      px.rect(3, 21, 1, 1, '#9a8a6a')
      px.rect(28, 21, 1, 1, '#9a8a6a')
    },
    floor(px) {
      px.rect(0, 0, T, T, '#33291e')
      const rubble = [[3, 4], [12, 2], [22, 6], [29, 3], [6, 12], [17, 11], [27, 14], [2, 21], [10, 19], [20, 22], [29, 20], [5, 28], [15, 27], [24, 28]]
      for (const [rx, ry] of rubble) px.rect(rx, ry, 2, 2, '#453728')
      px.rect(14, 8, 2, 2, '#c9a85c') // 金矿晶点
      px.rect(8, 26, 2, 2, '#c9a85c')
      px.rect(26, 9, 1, 1, '#e8d08a')
    },
    goal(px) {
      THEMES.mine.floor(px)
      px.rect(6, 4, 20, 26, '#2a2018') // 岩框
      px.rect(9, 7, 14, 23, '#1a1410') // 门洞
      px.rect(11, 10, 3, 18, '#f2d06b') // 金矿脉
      px.rect(16, 13, 2, 14, '#f2d06b')
      px.rect(19, 17, 2, 2, '#c9a85c') // 门把
    },
    start(px) {
      THEMES.mine.floor(px)
      px.ring(16, 16, 9, '#c9a85c')
      px.ring(16, 16, 5, '#e8d08a')
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
  const px = new Px(T, HERO_SCALE)
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
    const px = new Px(T, TILE_SCALE)
    tiles[kind](px)
    write(join(dir, `${kind}.png`), px.png())
  }
}

// sprite 条带：4 行方向 × 3 列帧（768×1024，帧 256²；行序 down/left/right/up 与 FACING_ROW 渲染序一致）
const FACINGS = ['down', 'left', 'right', 'up']
const FRAME = T * HERO_SCALE
const STRIP_W = FRAME * 3
const STRIP_H = FRAME * 4
const strip = new Uint8Array(STRIP_W * STRIP_H * 4)
FACINGS.forEach((facing, row) => {
  for (let col = 0; col < 3; col++) {
    const frame = heroFrame(facing, col)
    for (let y = 0; y < FRAME; y++) {
      const src = y * FRAME * 4
      const dst = (row * FRAME + y) * STRIP_W * 4 + col * FRAME * 4
      strip.set(frame.data.subarray(src, src + FRAME * 4), dst)
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

- \`<castle|garden|snow|volcano|ocean|jungle|station|mine>/{wall,floor,goal,start}.png\`：1024×1024 瓦片（v1.0 验收返工高清化：32×32 像素画逻辑网格 ×32 整数放大，硬边无插值；城堡=石砖/石板，花园=树篱/草地/木门，雪原=冰砖雪地，火山=玄武岩熔岩，海底=礁石气泡，丛林=苔石垂藤，太空站=金属面板，矿洞=岩层木支架）
- \`../sprites/hero.png\`：768×1024 像素小人条带（4 行方向 down/left/right/up × 3 列帧 stand/walk1/walk2，帧 256×256 = 32×32 逻辑 ×8）
- 重新生成：\`node scripts/gen-maze-assets.mjs\`（输出恒定，可复现）
`,
)

console.log(
  `[gen-maze-assets] ${fileCount} 个文件（${(totalBytes / 1024).toFixed(1)} KB）：32 张瓦片（8 主题 × 4）+ hero.png 条带 + CREDITS.md`,
)
