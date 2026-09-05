// 发布流水线（部署规范 §三）：类型检查 → 全量测试 → 覆盖率门禁 → 翻译齐备 → 构建 → 产物校验 → 打包 zip + SHA-256 → Release 模板 + git tag 收尾（M6.3 终版）
// 用法：npm run release；任一步失败即终止（不允许带错误发布）
import { execSync } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync, rmSync, cpSync, writeFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const version = pkg.version
const zipName = `LudoBurrow-v${version}.zip`

function run(label, command) {
  console.log(`\n=== [release ${version}] ${label} ===`)
  execSync(command, { stdio: 'inherit', shell: process.platform === 'win32' ? 'powershell.exe' : undefined })
}

function fail(message) {
  console.error(`\n[release] 终止：${message}`)
  process.exit(1)
}

// ---- 1/8 类型检查 ----
run('1/8 类型检查', 'npm run typecheck')

// ---- 2/8 全量测试 ----
run('2/8 全量测试', 'npm run test')

// ---- 3/8 覆盖率门禁（整体 ≥80%；engines ≥90%、core ≥85%）----
console.log(`\n=== [release ${version}] 3/8 覆盖率门禁 ===`)
run('覆盖率统计', 'npm run test:coverage')  // 3/8 附带产物：coverage-summary.json 供第 8 步模板引用
const summaryPath = resolve('coverage/coverage-summary.json')
if (!existsSync(summaryPath)) fail('coverage/coverage-summary.json 不存在')
const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'))
const totalLines = summary.total.lines.pct
if (totalLines < 80) fail(`整体行覆盖率 ${totalLines}% < 80%`)
console.log(`[release] 整体行覆盖率 ${totalLines}% ≥ 80%`)

function groupCoverage(prefix) {
  const pcts = []
  for (const [file, data] of Object.entries(summary)) {
    if (file === 'total' || !file.replace(/\\/g, '/').includes(`/src/${prefix}/`)) continue
    if (data.lines.total > 0) pcts.push({ file: file.replace(/\\/g, '/').split('/src/')[1], pct: data.lines.pct })
  }
  return pcts
}
for (const [prefix, threshold] of [['engines', 90], ['core', 85]]) {
  const files = groupCoverage(prefix)
  const below = files.filter((f) => f.pct < threshold)
  if (below.length > 0) {
    fail(`${prefix}/ 覆盖率不足 ${threshold}%: ${below.map((f) => `${f.file} ${f.pct}%`).join(', ')}`)
  }
  console.log(`[release] ${prefix}/ ${files.length} 个文件全部 ≥ ${threshold}%`)
}

// ---- 4/8 翻译齐备门禁 ----
run('4/8 翻译齐备门禁', 'npm run check:i18n')

// ---- 5/8 构建（内嵌 typecheck）----
run('5/8 构建（IIFE 单文件）', 'npm run build')

// ---- 6/8 产物校验（含 PWA，M6.2 扩展） ----
run('6/8 产物校验', 'npm run verify:dist')

// ---- 7/8 打包 zip + SHA-256 ----
console.log(`\n=== [release ${version}] 7/8 打包 ${zipName} ===`)
const stageDir = resolve(`release-stage/LudoBurrow-v${version}`)
rmSync(resolve('release-stage'), { recursive: true, force: true })
mkdirSync(stageDir, { recursive: true })
cpSync(resolve('dist'), stageDir, { recursive: true })

let sha256 = ''
if (process.platform === 'win32') {
  execSync(
    `Compress-Archive -Path "${stageDir}" -DestinationPath "release-stage/${zipName}" -Force`,
    { stdio: 'inherit', shell: 'powershell.exe' },
  )
  sha256 = execSync(
    `(Get-FileHash "release-stage/${zipName}" -Algorithm SHA256).Hash`,
    { shell: 'powershell.exe', encoding: 'utf-8' },
  ).trim()
  console.log(`SHA-256: ${sha256}`)
} else {
  execSync(`cd release-stage && zip -r "${zipName}" "LudoBurrow-v${version}"`, { stdio: 'inherit' })
  sha256 = execSync(`shasum -a 256 "release-stage/${zipName}"`, { encoding: 'utf-8' })
    .trim()
    .split(/\s+/)[0]
  console.log(`SHA-256: ${sha256}`)
}

// ---- 8/8 发布收尾：Release 模板 + git tag 检查（正式发布人工动作收口，M6.3） ----
console.log(`\n=== [release ${version}] 8/8 发布收尾（Release 模板 + git tag 检查） ===`)
const zipBytes = statSync(resolve(`release-stage/${zipName}`)).size
const zipMb = (zipBytes / 1024 / 1024).toFixed(2)
const template = `# LudoBurrow v${version} Release Notes

## 产物
- \`${zipName}\`（${zipMb} MB，解压后双击 index.html 即玩；同一产物可在线部署）
- SHA-256：\`${sha256}\`

## 验证口径（release 流水线 8/8 自动）
- 类型检查 0 错；全量测试 __TESTS__ tests 全绿（发布者回填）；覆盖率 ${summary.total.lines.pct}%（门禁：整体 ≥80%、engines ≥90%、core ≥85%）
- 翻译齐备门禁全绿（zh↔en 键位 1:1、无空值）
- 单文件产物校验（无外链/相对路径）+ PWA 产物校验全绿

## 变更摘要
（发布者填写：交付内容 + 关键变更，与 README §版本迭代表一致）

## 升级说明
- 存档向前兼容（schema migration 链）；跨大版本回退不保证，发布说明须注明回退影响
- 在线版：SW 缓存版本随本次发布更新，用户侧 activate 自动换新
`
writeFileSync(resolve(`release-stage/RELEASE-TEMPLATE-v${version}.md`), template)
console.log(`[release] Release 模板已生成：release-stage/RELEASE-TEMPLATE-v${version}.md（填 __TESTS__ 与变更摘要）`)

let tagExists = false
try {
  execSync(`git rev-parse -q --verify refs/tags/v${version}`, { stdio: 'pipe' })
  tagExists = true
} catch {
  // 无 tag，正常首发/未打 tag
}
if (tagExists) {
  console.log(`[release] 提示：tag v${version} 已存在——同版本重跑（内部门禁验证）可忽略；对外发布需先 bump package.json version 与 sw.js CACHE_VERSION`)
} else {
  console.log(`[release] 正式发布收尾（人工）：git tag v${version} && git push origin v${version}；GitHub Release 附 ${zipName} + SHA-256 + 模板摘要；README §版本迭代追加一行`)
}

console.log(`\n[release ${version}] 全部门禁通过，产物：release-stage/${zipName}`)
