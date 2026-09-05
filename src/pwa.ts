// PWA Service Worker 注册（M6.2，部署规范 §5.3）
// 在线版（https 或 localhost）一次访问后离线可玩；file:// 本地版不依赖 SW（免安装即玩），条件不满足时静默跳过。
// SW 注册失败不影响主功能（在线可玩性优先，离线增强缺失可接受，非阻断）。

/** 注册条件：https 任意主机；http 仅限本地开发回环地址；其余（file:// 等）不注册 */
export function shouldRegisterSw(protocol: string, hostname: string): boolean {
  if (protocol === 'https:') return true
  if (protocol !== 'http:') return false
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

/** 应用启动后调用：load 后注册 ./sw.js（相对路径，任意子路径部署可用） */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (!shouldRegisterSw(location.protocol, location.hostname)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // 注册失败静默降级（SW 缓存路径 http 失败/权限限制等，不影响游戏功能）
    })
  })
}
