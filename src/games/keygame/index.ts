// 键盘按键游戏模块入口（GameModule 契约实现，技术架构 §8 / §10）
import type { GameModule } from '@/core/types'
import { createKeygameLevel } from './level'
import { mountKeygame } from './instance'

export const keygameModule: GameModule = {
  id: 'keygame',
  name: 'game.keygame',
  icon: 'assets/icons/keygame.svg',
  createLevel: createKeygameLevel,
  mount: mountKeygame,
}

export { createKeygameLevel } from './level'
export { mountKeygame } from './instance'
