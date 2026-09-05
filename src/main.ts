import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n, restoreLocaleFromSettings } from './i18n'
import { registerGame } from './core/game-registry'
import { keygameModule } from './games/keygame'
import { jigsawModule } from './games/jigsaw'
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

// PWA：在线版（https/localhost）注册 SW 实现一次访问后离线可玩；file:// 本地版静默跳过（M6.2）
registerServiceWorker()
