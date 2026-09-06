import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n, restoreLocaleFromSettings } from './i18n'
import { registerGame } from './core/game-registry'
import { keygameModule } from './games/keygame'
import { jigsawModule } from './games/jigsaw'
import { warmBuiltinOptima } from './games/jigsaw/optimize'
import { mazeModule } from './games/maze'
import { registerServiceWorker } from './pwa'
import './style.css'

// 游戏注册（三游戏全量：keygame / jigsaw / maze）
registerGame(keygameModule)
registerGame(jigsawModule)
registerGame(mazeModule)

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
restoreLocaleFromSettings()
app.mount('#app')

// 内置图库切块规格预热（验收返工「每图自动选最优切块」）：挂载后后台逐图分析，不阻塞首屏；
// 无 Canvas 像素能力或单图分析失败时静默回落复杂度兜底网格（选关页再预热一次，幂等）。
void warmBuiltinOptima()

// PWA：在线版（https/localhost）注册 SW 实现一次访问后离线可玩；file:// 本地版静默跳过（M6.2）
registerServiceWorker()
