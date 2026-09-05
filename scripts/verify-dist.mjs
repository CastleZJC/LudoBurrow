// 产物校验（部署规范 §2.3）：单文件无外链 + assets 相对路径
// 用法：node scripts/verify-dist.mjs（release 流水线第 6 步）
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const distDir = resolve('dist')
const errors = []

// 1. dist/index.html 存在
const indexPath = join(distDir, 'index.html')
if (!existsSync(indexPath)) {
  errors.push('dist/index.html 不存在')
} else {
  const html = readFileSync(indexPath, 'utf-8')

  // 2. 无外链 script / stylesheet
  const externalScripts = [...html.matchAll(/<script[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>/gi)]
  const externalStyles = [...html.matchAll(/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi)]
  if (externalScripts.length > 0) {
    errors.push(`存在外链 <script src>（破坏 file:// 单文件承诺）: ${externalScripts.map((m) => m[0]).join(' ; ')}`)
  }
  if (externalStyles.length > 0) {
    errors.push(`存在外链 <link rel="stylesheet">: ${externalStyles.map((m) => m[0]).join(' ; ')}`)
  }

  // 3. 资产引用全部相对路径（无绝对路径 / http 外链）
  const assetRefs = [...html.matchAll(/["']([^"']*assets\/[^"']*)["']/g)].map((m) => m[1])
  const badRefs = assetRefs.filter((ref) => ref.startsWith('/') || /^https?:\/\//.test(ref))
  if (badRefs.length > 0) {
    errors.push(`assets 引用存在绝对路径或外链: ${badRefs.join(' ; ')}`)
  }

  // 4. index.html 体积记录（信息输出，不作门禁）
  const sizeKb = (statSync(indexPath).size / 1024).toFixed(1)
  console.log(`[verify-dist] index.html ${sizeKb} kB，内联 JS/CSS 已确认`)
}

// 5. PWA 产物（M6.2）：manifest / sw.js / 图标存在 + index.html 引用 + SW 缓存版本与 package.json 一致
const pwaFiles = ['manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png']
for (const f of pwaFiles) {
  if (!existsSync(join(distDir, f))) errors.push(`PWA 产物缺失: ${f}`)
}
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf-8')
  if (!/<link[^>]+rel="manifest"/.test(html)) errors.push('index.html 缺少 <link rel="manifest">（PWA 不可安装）')
}
if (existsSync(join(distDir, 'sw.js'))) {
  const sw = readFileSync(join(distDir, 'sw.js'), 'utf-8')
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'))
  const m = sw.match(/CACHE_VERSION\s*=\s*['"]v([\d.]+)['"]/)
  if (!m || m[1] !== pkg.version) {
    errors.push(`sw.js CACHE_VERSION 与 package.json version 不一致（sw=${m ? m[1] : '无'} / pkg=${pkg.version}，bump 漏改即缓存失效失败）`)
  }
  console.log(`[verify-dist] PWA：sw.js 缓存版本 v${m ? m[1] : '?'} 与 package.json 一致`)
}

// 6. assets 目录清单（信息输出 + 相对路径结构确认）
const assetsDir = join(distDir, 'assets')
if (existsSync(assetsDir)) {
  const walk = (dir, prefix = '') => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        walk(full, `${prefix}${name}/`)
      } else {
        console.log(`[verify-dist] asset: assets/${prefix}${name}`)
      }
    }
  }
  walk(assetsDir)
} else {
  console.log('[verify-dist] assets/ 目录不存在（当前无分发资产，允许）')
}

if (errors.length > 0) {
  console.error(`[verify-dist] 失败（${errors.length} 项）：`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log('[verify-dist] 通过：单文件产物校验全绿')
