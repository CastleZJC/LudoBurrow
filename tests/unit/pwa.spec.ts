// M6.2 PWA：Service Worker 注册条件（纯函数）+ PWA 产物资产落地 + 缓存版本与 package.json 同步
// 设计口径（部署规范 §5.3）：在线版（https 或 localhost）一次访问后离线可玩；
// file:// 本地版不依赖 SW（免安装即玩），注册条件不满足时静默跳过。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { shouldRegisterSw, registerServiceWorker } from '@/pwa'

describe('shouldRegisterSw（注册条件：https / localhost http；file:// 不注册）', () => {
  it.each([
    ['https:', 'pages.github.io', true, '在线部署（默认 GitHub Pages）'],
    ['https:', 'ludoburrow.vercel.app', true, '其他 https 静态托管'],
    ['http:', 'localhost', true, '本地开发 localhost'],
    ['http:', '127.0.0.1', true, '本地开发回环地址'],
    ['http:', '192.168.1.10', false, '内网非回环 http（SW 不可用，跳过）'],
    ['file:', 'localhost', false, 'file:// 本地模式不依赖 SW'],
  ])('%s://%s → %s（%s）', (protocol, hostname, expected) => {
    expect(shouldRegisterSw(protocol, hostname)).toBe(expected)
  })
})

describe('registerServiceWorker（注册行为与降级）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('环境无 serviceWorker API：静默跳过不抛错', () => {
    expect(() => registerServiceWorker()).not.toThrow()
  })

  it('条件满足时注册 ./sw.js，注册失败不影响主功能', async () => {
    const register = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('navigator', { serviceWorker: { register } })
    registerServiceWorker() // happy-dom location = http://localhost → 条件满足，挂 load 监听
    window.dispatchEvent(new Event('load'))
    await Promise.resolve()
    expect(register).toHaveBeenCalledWith('./sw.js')
    // 拒绝被吞（.catch 兜底），无未处理异常
    await new Promise((r) => setTimeout(r, 0))
  })
})

describe('PWA 产物资产落地（M6.2）', () => {
  const pub = (...parts: string[]) => join(process.cwd(), 'public', ...parts)

  it('manifest.webmanifest 存在且字段齐备（start_url/icons 相对路径）', () => {
    const manifest = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf-8'))
    expect(manifest.name).toBe('LudoBurrow')
    expect(manifest.start_url).toBe('./index.html')
    expect(manifest.scope).toBe('./')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons).toHaveLength(2)
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('./')).toBe(true)
      expect(icon.type).toBe('image/png')
    }
  })

  it('sw.js 存在且三大事件策略齐备（install 预缓存 / activate 清旧 / fetch 拦截）', () => {
    const sw = readFileSync(pub('sw.js'), 'utf-8')
    expect(sw).toContain("addEventListener('install'")
    expect(sw).toContain("addEventListener('activate'")
    expect(sw).toContain("addEventListener('fetch'")
    expect(sw).toContain('skipWaiting')
    expect(sw).toContain('clients.claim')
    // 安全边界：非 GET 与跨域（AI Provider API）放行不拦截
    expect(sw).toContain("req.method !== 'GET'")
    expect(sw).toContain('url.origin !== self.location.origin')
  })

  it('sw.js 缓存版本与 package.json version 一致（缓存失效策略，bump 漏改即失败）', () => {
    const sw = readFileSync(pub('sw.js'), 'utf-8')
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'))
    const m = sw.match(/CACHE_VERSION\s*=\s*['"]v([\d.]+)['"]/)
    expect(m).not.toBeNull()
    expect(m![1]).toBe(pkg.version)
  })

  it('图标 192/512 PNG 存在且为合法 PNG（魔数）', () => {
    for (const name of ['icon-192.png', 'icon-512.png']) {
      const buf = readFileSync(pub('icons', name))
      expect(buf.length).toBeGreaterThan(100) // 纯色几何图体积小，仅防空文件
      expect(buf[0]).toBe(0x89)
      expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
    }
  })

  it('index.html 引用 manifest 与 theme-color', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf-8')
    expect(existsSync(pub('manifest.webmanifest'))).toBe(true)
    expect(html).toMatch(/<link[^>]+rel="manifest"/)
    expect(html).toMatch(/<meta[^>]+name="theme-color"/)
  })
})
