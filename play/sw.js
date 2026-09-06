// LudoBurrow Service Worker（M6.2，部署规范 §5.3）
// 策略：
//   - app shell（index.html / manifest / 图标）安装期预缓存
//   - assets/（图库 / 瓦片 / sprite）按需缓存：首次访问后进缓存（在线版离线可玩）
//   - 导航请求 network-first（保证更新及时），离线回退缓存的 index.html
//   - 仅拦截同源 GET；跨域请求（含 AI Provider API）与非 GET 一律放行
// 版本策略：CACHE_VERSION 与 package.json version 一致（tests/unit/pwa.spec.ts + verify-dist.mjs 双门禁校验，
//           bump 漏改即失败）；activate 时删除旧版本缓存，skipWaiting + clients.claim 立即接管。
const CACHE_VERSION = 'v1.1.0'
const CACHE_NAME = `ludoburrow-${CACHE_VERSION}`
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function cachePut(request, response) {
  if (!response || !response.ok) return
  const cache = await caches.open(CACHE_NAME)
  await cache.put(request, response)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    // 导航：network-first（新版本及时生效）+ 离线回退
    event.respondWith(
      fetch(req)
        .then((res) => {
          void cachePut('./index.html', res.clone())
          return res
        })
        .catch(() => caches.match('./index.html')),
    )
    return
  }

  // 静态资产：cache-first 按需缓存（命中返回；未命中取网络并回填）
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit
      return fetch(req)
        .then((res) => {
          void cachePut(req, res.clone())
          return res
        })
        .catch(() => caches.match(req))
    }),
  )
})
