#!/usr/bin/env node
// 内置图库真实素材获取（替代程序生成图；F-27 开源合规）
// 图源：Wikimedia Commons（许可 CC0 / CC-BY / PD，extmetadata 完整可追溯）
// 用法：
//   node scripts/fetch-gallery.mjs --dry-run            仅搜索并打印候选（不下载）
//   node scripts/fetch-gallery.mjs                       全量：搜索 + 下载 + 生成 thumbs.ts / CREDITS.md
//   node scripts/fetch-gallery.mjs --only space-01,cartoon-01  定向：只重取指定槽位，其余沿用现状
//   node scripts/fetch-gallery.mjs --skip-color-check   跳过彩色校验（应急；默认逐候选饱和度筛选）
// 选图规则（v1.1 验收四轮入档）：彩色、色彩鲜明、主体清晰、能引起孩子兴趣 ——
//   逐候选下载 192 缩略 → scripts/check-color.ps1（WIC）量化：饱和度均值 ≥ 0.12 且彩色像素占比 ≥ 0.15
//   才定稿；灰度/黑白候选自动跳换取下一候选（词条本身也须选彩色倾向的源）。
// 网络：优先经本地代理 CONNECT 隧道（注册表 ProxyServer，Clash 等），失败回退直连。
// 产物（id 与 complexity 分布恒定，游戏侧仅 file 后缀 .png → .jpg）：
//   public/assets/images/<topic>/<id>.jpg   2048 宽源图（仅绘制用）
//   src/games/jigsaw/thumbs.ts              192 长边 JPEG data URI（切块分析，防 canvas taint）
//   public/assets/images/CREDITS.md         作者/许可/来源页（F-27 可追溯）
// 零第三方依赖（node:http/https CONNECT 隧道手写实现；彩色校验经 PowerShell/WIC 子进程）。

import { execSync, execFileSync } from 'node:child_process'
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { join } from 'node:path'

const DRY_RUN = process.argv.includes('--dry-run')
/** 定向重取槽位集合（--only id1,id2；空 = 全量） */
const ONLY = (() => {
  const i = process.argv.indexOf('--only')
  if (i < 0 || !process.argv[i + 1]) return new Set()
  return new Set(process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean))
})()
/** 跳过彩色校验（--skip-color-check；应急通道） */
const SKIP_COLOR_CHECK = process.argv.includes('--skip-color-check')
const UA = 'LudoBurrow/1.1 (https://github.com/CastleZJC/LudoBurrow; puzzle gallery assets)'
const ROOT = process.cwd()
const IMG_ROOT = join(ROOT, 'public', 'assets', 'images')
const SOURCE_W = 2048 // 源图宽（服务端渲染缩放，本地无解码器依赖）
const THUMB_W = 192 // 分析缩略长边（与 downscaleToAnalysis 口径一致）

// ---- 四专题词条表：每专题 6 条，顺序 = id 顺序 = complexity 分布 1/2/2/3/3/3（由简到难递增，验收四轮）----
// 词条设计：c1 主体突出（低关）→ c3 细节丰富（高关）；主词失败自动换备选词；
// 彩色规则：词条选彩色倾向源（彩色插画家分类 / 彩色行星照片），候选再经饱和度校验兜底拦截
const TOPIC_QUERIES = [
  {
    topic: 'animals',
    queries: [
      ['red panda portrait', 'giant panda eating'],
      ['arctic fox snow', 'snow leopard'],
      ['owl perched branch', 'eagle portrait'],
      ['sika deer', 'fallow deer'],
      ['coral reef fish', 'tropical fish aquarium'],
      ['hummingbird flower', 'kingfisher bird'],
    ],
  },
  {
    topic: 'space',
    queries: [
      // space-01（c1 主体突出）：蓝色大理石地球替代灰度月面（验收四轮：彩色、鲜明、清晰）
      ['earth blue marble apollo', 'planet earth from space'],
      ['jupiter planet photo', 'mars planet'],
      ['saturn rings', 'saturn planet photo'],
      ['andromeda galaxy', 'whirlpool galaxy'],
      ['orion nebula', 'eagle nebula pillars'],
      ['milky way stars night', 'star cluster photo'],
    ],
  },
  {
    topic: 'scenery',
    queries: [
      ['mountain lake reflection', 'alpine lake'],
      ['beach sunset ocean', 'tropical beach'],
      ['autumn forest path', 'autumn foliage'],
      ['lavender field', 'tulip field'],
      ['rice terraces', 'longji rice terrace'],
      ['city skyline night', 'mountain range valley'],
    ],
  },
  {
    topic: 'cartoon',
    // 彩色插画源（验收四轮：古典童书插画多黑白/单色，改选彩色插画家分类）
    // Dulac 彩色水彩 / Nielsen 金框彩绘 / Bilibin 俄国彩色民俗 / Goble 彩色童话
    queries: [
      ['category:Illustrations by Edmund Dulac', 'edmund dulac color illustration'],
      ['category:Illustrations by Kay Nielsen', 'kay nielsen illustration'],
      ['category:Illustrations by Ivan Bilibin', 'ivan bilibin color illustration'],
      ['category:Illustrations by Warwick Goble', 'warwick goble illustration'],
      ['category:Fairy tale illustrations', "category:Children's book illustrations"],
      ['category:Illustrations by Warwick Goble', 'warwick goble color fairy tale'],
    ],
  },
]

// ---- 代理探测（注册表 ProxyServer；ProxyEnable 未开也可能被 TUN 分流，故始终先试代理再直连）----
function detectProxy() {
  try {
    const out = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
      { encoding: 'utf8' },
    )
    const m = /(\d+\.\d+\.\d+\.\d+):(\d+)/.exec(out)
    if (m) return { host: m[1], port: Number(m[2]) }
  } catch {
    /* 未配置 */
  }
  return null
}

const PROXY = detectProxy()

/** 经代理 CONNECT 隧道的 HTTPS 请求；proxy=null 时直连 */
function httpsRequest(url, { proxy, headers = {}, timeoutMs = 20000 } = {}) {
  const target = new URL(url)
  const doRequest = (socket) =>
    new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: target.hostname,
          path: target.pathname + target.search,
          ...(socket ? { socket, agent: false } : {}),
          headers: { 'User-Agent': UA, ...headers },
          timeout: timeoutMs,
        },
        resolve,
      )
      req.on('error', reject)
      req.on('timeout', () => req.destroy(new Error(`request timeout: ${url.slice(0, 80)}`)))
      req.end()
    })

  if (!proxy) return doRequest(null)
  return new Promise((resolve, reject) => {
    const connectReq = http.request({
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || 443}`,
      timeout: timeoutMs,
    })
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy()
        reject(new Error(`proxy CONNECT ${res.statusCode}`))
        return
      }
      doRequest(socket).then(resolve, reject)
    })
    connectReq.on('error', reject)
    connectReq.on('timeout', () => connectReq.destroy(new Error('proxy CONNECT timeout')))
    connectReq.end()
  })
}

/** 带代理/直连双通道的请求（代理失败自动回退直连） */
async function fetchUrl(url, opts = {}) {
  if (PROXY) {
    try {
      return await httpsRequest(url, { ...opts, proxy: PROXY })
    } catch {
      /* 回退直连 */
    }
  }
  return httpsRequest(url, { ...opts, proxy: null })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchJson(url, attempt = 1) {
  const res = await fetchUrl(url, { timeoutMs: 25000 })
  const chunks = []
  for await (const c of res) chunks.push(c)
  const text = Buffer.concat(chunks).toString('utf8')
  // Commons 限流：429 或错误页含 "too many requests"，指数退避重试
  if (res.statusCode === 429 || /too many requests/i.test(text)) {
    if (attempt >= 4) throw new Error(`API 限流未恢复: ${url.slice(0, 80)}`)
    const wait = 2500 * attempt
    console.log(`  ⏳ API 限流，${wait}ms 后重试（${attempt}/3）`)
    await sleep(wait)
    return fetchJson(url, attempt + 1)
  }
  if (res.statusCode !== 200) throw new Error(`API ${res.statusCode}: ${url.slice(0, 100)}`)
  return JSON.parse(text)
}

async function fetchBuffer(url, timeoutMs = 90000) {
  const res = await fetchUrl(url, { timeoutMs })
  if (res.statusCode !== 200) throw new Error(`download ${res.statusCode}: ${url.slice(0, 100)}`)
  const chunks = []
  for await (const c of res) chunks.push(c)
  return Buffer.concat(chunks)
}

// ---- Commons 搜索与筛选 ----
const LICENSE_OK = /CC0|CC BY|Public Domain|pd/i

function stripHtml(s) {
  return String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** 搜索一个词条（或 category:分类名），返回全部合格候选（最多 limit 个；JPEG/PNG、原图宽 ≥1024、宽松许可、宽高比 0.5-2） */
async function searchCandidates(query, limit = 12) {
  const gen = query.startsWith('category:')
    ? `generator=categorymembers&gcmtitle=${encodeURIComponent(`Category:${query.slice(9)}`)}&gcmtype=file&gcmlimit=50`
    : `generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=25`
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&${gen}` +
    `&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=${SOURCE_W}`
  const json = await fetchJson(url)
  const pages = Object.values(json?.query?.pages ?? {})
  const out = []
  for (const page of pages) {
    const ii = page.imageinfo?.[0]
    if (!ii) continue
    if (ii.mime !== 'image/jpeg' && ii.mime !== 'image/png') continue
    if (ii.width < 1024 || ii.height < 768) continue
    const ratio = ii.width / ii.height
    if (ratio < 0.5 || ratio > 2) continue
    const meta = ii.extmetadata ?? {}
    const license = stripHtml(meta.LicenseShortName?.value ?? '')
    if (!LICENSE_OK.test(license)) continue
    if (!ii.thumburl) continue
    // 服务端缩略后的实际格式（jpeg 归一为 jpg）
    const extMatch = /\.(jpe?g|png)$/i.exec(new URL(ii.thumburl).pathname)
    const ext = extMatch ? extMatch[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'
    out.push({
      title: page.title,
      license,
      artist: stripHtml(meta.Artist?.value ?? '') || '(unknown)',
      pageUrl: ii.descriptionurl ?? '',
      sourceUrl: ii.thumburl, // 2048 宽服务端缩略
      thumbUrl: ii.thumburl.replace(/\/\d+px-/, `/${THUMB_W}px-`), // 192 长边
      ext,
      origWidth: ii.width,
      origHeight: ii.height,
    })
    if (out.length >= limit) break
  }
  return out
}

// ---- 彩色校验（内置选图规则：彩色、色彩鲜明；经 scripts/check-color.ps1 的 WIC 解码）----
/** 单文件饱和度量化；非 Windows / 无 PowerShell / 校验异常时返回 skipped（不阻断取图，词条彩色倾向兜底） */
function checkColorful(filePath) {
  if (SKIP_COLOR_CHECK || process.platform !== 'win32') return { colorful: true, skipped: true }
  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(ROOT, 'scripts', 'check-color.ps1'), filePath],
      { encoding: 'utf8', timeout: 30000 },
    )
    return JSON.parse(out)
  } catch {
    return { colorful: true, skipped: true }
  }
}

/** 为一个专题拉取指定槽位：逐候选「官方 192 缩略 → 彩色校验」，首个彩色合格且未用过的候选定稿（usedTitles 跨专题去重） */
async function pickForTopic(topic, slots, usedTitles) {
  const picks = []
  for (const { id, alternatives } of slots) {
    let picked = null
    for (const q of alternatives) {
      if (picked) break
      try {
        const hits = await searchCandidates(q)
        await sleep(300) // Commons 礼貌间隔
        for (const hit of hits) {
          if (usedTitles.has(hit.title)) continue
          // 官方缩略 URL（字符串替换 px 会被 thumb 服务拒 400）
          const map = await resolveThumbUrls([hit.title], THUMB_W)
          const thumbUrl = map[hit.title]
          if (!thumbUrl) continue
          let thumbBuf
          try {
            thumbBuf = await fetchBuffer(thumbUrl, 30000)
          } catch {
            continue
          }
          const color = checkColorfulThumb(thumbBuf, hit.ext)
          if (!color.colorful) {
            console.log(`    ↷ 跳过灰度候选 ${hit.title}（sat=${color.satMean} ratio=${color.colorRatio}）`)
            continue
          }
          picked = { ...hit, query: q, thumbUrl, thumbBuf, thumbMime: hit.ext === 'png' ? 'image/png' : 'image/jpeg' }
          usedTitles.add(hit.title)
          console.log(
            `  [${topic}] ${id} "${q}" -> ${hit.title} (${hit.license}, sat=${color.satMean} ratio=${color.colorRatio})`,
          )
          break
        }
        if (!picked) console.log(`  [${topic}] "${q}" 无彩色合格候选（命中 ${hits.length} 张），换备选词`)
      } catch (err) {
        console.log(`  [${topic}] "${q}" 搜索失败: ${err.message}`)
      }
    }
    if (!picked) throw new Error(`[${topic}] ${id} 全部备选词无彩色合格候选`)
    picks.push({ ...picked, id })
  }
  return picks
}

/** 缩略图落盘 → 校验 → 删除（WIC 按扩展名选解码器） */
function checkColorfulThumb(buf, ext) {
  const tmp = join(IMG_ROOT, `.tmp-color-check.${ext}`)
  writeFileSync(tmp, buf)
  try {
    return checkColorful(tmp)
  } finally {
    rmSync(tmp)
  }
}

/** 批量解析 title→官方 thumburl（指定宽）；避免字符串替换 px 被 thumb 服务拒 400（API 返回的路径 px 为内部规范值） */
async function resolveThumbUrls(titles, width) {
  const map = {}
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40)
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json` +
      `&titles=${encodeURIComponent(batch.join('|'))}&prop=imageinfo&iiprop=url&iiurlwidth=${width}`
    const json = await fetchJson(url)
    for (const page of Object.values(json?.query?.pages ?? {})) {
      const ii = page.imageinfo?.[0]
      if (ii?.thumburl) map[page.title] = ii.thumburl
    }
    await sleep(300)
  }
  return map
}

// ---- 主流程 ----
console.log(`代理: ${PROXY ? `${PROXY.host}:${PROXY.port}（失败自动回退直连）` : '未检测到（直连）'}`)
console.log(
  `模式: ${DRY_RUN ? 'dry-run（只搜索）' : ONLY.size ? `定向重取 ${[...ONLY].join(', ')}（其余沿用现状）` : '全量：搜索+下载+生成'}`,
)

// 全量槽位计划（id 稳定派生）；--only 校验（防手滑写错 id）
const PLAN = TOPIC_QUERIES.map(({ topic, queries }) => ({
  topic,
  slots: queries.map((alternatives, i) => ({ id: `${topic}-${String(i + 1).padStart(2, '0')}`, alternatives })),
}))
if (ONLY.size > 0) {
  const known = new Set(PLAN.flatMap((g) => g.slots.map((s) => s.id)))
  for (const id of ONLY) {
    if (!known.has(id)) throw new Error(`--only 未知槽位 ${id}（合法值：${[...known].join(', ')}）`)
  }
}

const all = [] // 重取项（含 title/许可/缩略图字节）
const keepSlots = [] // 沿用项（--only 模式：仅从现状读取，不重取）
const usedTitles = new Set()
for (const { topic, slots } of PLAN) {
  console.log(`\n=== 专题 ${topic} ===`)
  const refresh = ONLY.size === 0 ? slots : slots.filter((s) => ONLY.has(s.id))
  const keeping = ONLY.size === 0 ? [] : slots.filter((s) => !ONLY.has(s.id))
  if (refresh.length > 0) {
    const picks = await pickForTopic(topic, refresh, usedTitles)
    for (const p of picks) all.push({ ...p, topic })
  } else {
    console.log('  （无重取槽位，沿用现状）')
  }
  for (const s of keeping) keepSlots.push({ ...s, topic })
}

if (DRY_RUN) {
  console.log(`\n候选共 ${all.length} 张（dry-run 结束）`)
  process.exit(0)
}

// ---- 沿用槽位现状收集（--only 模式：源图文件名 + thumbs data URI + CREDITS 行，缺一报错）----
function parseExistingThumbs() {
  const map = new Map()
  const src = readFileSync(join(ROOT, 'src', 'games', 'jigsaw', 'thumbs.ts'), 'utf8')
  for (const m of src.matchAll(/'([a-z]+-\d\d)': '(data:[^']+)'/g)) map.set(m[1], m[2])
  return map
}
function parseExistingCredits() {
  const map = new Map()
  const src = readFileSync(join(IMG_ROOT, 'CREDITS.md'), 'utf8')
  for (const line of src.split('\n')) {
    const m = /^\| ([a-z]+-\d\d) \|/.exec(line)
    if (m) map.set(m[1], line)
  }
  return map
}
function existingFileOf(topic, id) {
  const dir = join(IMG_ROOT, topic)
  if (!existsSync(dir)) return null
  const hit = readdirSync(dir).find((n) => new RegExp(`^${id}\.(?:png|jpe?g)$`, 'i').test(n))
  return hit ?? null
}

const existingThumbs = keepSlots.length ? parseExistingThumbs() : null
const existingCredits = keepSlots.length ? parseExistingCredits() : null
for (const k of keepSlots) {
  const file = existingFileOf(k.topic, k.id)
  const thumbData = existingThumbs.get(k.id)
  const creditsLine = existingCredits.get(k.id)
  if (!file || !thumbData || !creditsLine) {
    throw new Error(`沿用槽位 ${k.id} 现状缺失（file=${Boolean(file)} thumb=${Boolean(thumbData)} credits=${Boolean(creditsLine)}）`)
  }
  k.file = file
  k.thumbData = thumbData
  k.creditsLine = creditsLine
}

// 旧文件清理：全量 = 每专题清空；--only = 只删被替换槽位的旧文件（防扩展名变化残留双文件）
for (const { topic } of TOPIC_QUERIES) {
  const dir = join(IMG_ROOT, topic)
  if (!existsSync(dir)) continue
  if (ONLY.size === 0) {
    for (const name of readdirSync(dir)) {
      if (/\.(png|jpe?g)$/i.test(name)) rmSync(join(dir, name))
    }
  } else {
    for (const item of all.filter((i) => i.topic === topic)) {
      for (const name of readdirSync(dir)) {
        if (new RegExp(`^${item.id}\.(?:png|jpe?g)$`, 'i').test(name)) rmSync(join(dir, name))
      }
    }
  }
}

const thumbs = {}
for (const item of all) {
  const dir = join(IMG_ROOT, item.topic)
  mkdirSync(dir, { recursive: true })
  item.file = `${item.id}.${item.ext}`
  let lastErr = new Error('not attempted')
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const buf = await fetchBuffer(item.sourceUrl)
      writeFileSync(join(dir, item.file), buf)
      // 缩略图用 pick 阶段已过彩色校验的官方 192 字节（不再二次下载）
      thumbs[item.id] = `data:${item.thumbMime};base64,${item.thumbBuf.toString('base64')}`
      console.log(`✓ ${item.topic}/${item.file} ${(buf.length / 1024).toFixed(0)} kB (thumb ${item.thumbBuf.length / 1024 <= 1 ? (item.thumbBuf.length / 1024).toFixed(2) : (item.thumbBuf.length / 1024).toFixed(1)} kB)`
      )
      lastErr = null
      break
    } catch (err) {
      lastErr = err
      console.log(`  重试 ${attempt}/3 ${item.id}: ${err.message}`)
    }
  }
  if (lastErr) throw new Error(`下载失败 ${item.id}: ${lastErr.message}`)
  await new Promise((r) => setTimeout(r, 400)) // Commons 礼貌间隔
}
for (const k of keepSlots) thumbs[k.id] = k.thumbData

// thumbs.ts 生成（结构与游戏侧契约一致：Record<id, data URI>，切块引擎无感；顺序 = 槽位计划序）
const ORDER = PLAN.flatMap((g) => g.slots.map((s) => s.id))
const thumbsTs =
  '// 自动生成：scripts/fetch-gallery.mjs（Wikimedia Commons 真实素材，勿手改）\n' +
  '// 分析缩略图：192 长边 JPEG data URI（切块引擎输入；data URI 不触发 canvas taint，file:// 离线可用）\n' +
  '// 源图：public/assets/images/<topic>/<id>.jpg（2048 宽，仅绘制用）；许可见 assets/images/CREDITS.md\n' +
  `export const THUMBS: Record<string, string> = {\n${ORDER.map((id) => `  '${id}': '${thumbs[id]}',`).join('\n')}\n}\n`
writeFileSync(join(ROOT, 'src', 'games', 'jigsaw', 'thumbs.ts'), thumbsTs)

// CREDITS.md（F-27 许可可追溯；--only 模式未重取槽位沿用原行）
const refreshById = new Map(all.map((i) => [i.id, i]))
const keepById = new Map(keepSlots.map((k) => [k.id, k]))
const credits = [
  '# 内置图库素材许可（LudoBurrow）',
  '',
  '素材来源：[Wikimedia Commons](https://commons.wikimedia.org/)，经 `scripts/fetch-gallery.mjs` 获取（2048 宽服务端缩略；彩色规则校验见 scripts/check-color.ps1）。',
  '按各自许可证使用；CC-BY 条目已署名。若需移除某图，替换同专题同复杂度图片并更新本文件。',
  '',
  '| id | 标题 | 作者 | 许可 | 来源页 |',
  '|----|------|------|------|--------|',
  ...ORDER.map((id) => {
    const r = refreshById.get(id)
    if (r) {
      return `| ${r.id} | ${r.title.replace(/\|/g, '\\|')} | ${r.artist.replace(/\|/g, '\\|')} | ${r.license} | ${r.pageUrl} |`
    }
    return keepById.get(id).creditsLine
  }),
  '',
]
writeFileSync(join(IMG_ROOT, 'CREDITS.md'), credits.join('\n'))

// gallery.ts file 字段同步（按实际扩展名；id/complexity 不变 → 选图与测试断言无感）
const galleryPath = join(ROOT, 'src', 'games', 'jigsaw', 'gallery.ts')
let gallerySrc = readFileSync(galleryPath, 'utf8')
for (const item of all) {
  gallerySrc = gallerySrc.replace(
    new RegExp(`file: '${item.id}\\.(?:png|jpe?g)'`),
    `file: '${item.file}'`,
  )
}
// gallery.ts 头部注释已是 fetch-gallery 口径（分发双轨 / 2048 宽 JPEG-PNG / 192 长边 data URI），无需再迁移
writeFileSync(galleryPath, gallerySrc)

console.log(
  `\n完成：重取 ${all.length} 张、沿用 ${keepSlots.length} 张（源图 + thumbs.ts ${ORDER.length} 条 + CREDITS.md + gallery.ts file 字段）`,
)
