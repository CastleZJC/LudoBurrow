// 键盘按键游戏模块入口（GameModule 契约实现，技术架构 §8 / §10）
// 多轨游戏（方案 B）：track = KeygameMode，每模式一条独立 1-50 进度轨；createLevel(n, track) 按模式生成曲线。
import type { GameModule } from '@/core/types'
import { createKeygameLevel, isKeygameMode, KEYGAME_MODES, KEYGAME_MODE_LABEL_KEY, type KeygameMode } from './level'
import { mountKeygame } from './instance'
import { getEnvAdapter } from '@/services'

export const keygameModule: GameModule = {
  id: 'keygame',
  name: 'game.keygame',
  icon: 'assets/icons/keygame.svg',
  // 四模式页签（选关页先选模式）；id = KeygameMode = 进度轨后缀
  tracks: KEYGAME_MODES.map((mode) => ({ id: mode, labelKey: KEYGAME_MODE_LABEL_KEY[mode] })),
  // track 收窄为合法模式；非法/缺省回落全键盘（选关页始终显式传模式）；
  // 词表配置经适配层读取（本地=存档单一配置无权限分割；Web=按用户隔离，二期），空配置=引擎默认词表
  createLevel: (n, track) => {
    const mode = isKeygameMode(track) ? track : ('full-random' as KeygameMode)
    return createKeygameLevel(n, mode, getEnvAdapter().wordbankRepo.getConfig())
  },
  mount: mountKeygame,
}

export { createKeygameLevel, KEYGAME_MODES, KEYGAME_MODE_LABEL_KEY, layoutOfMode, isKeygameMode, type KeygameMode } from './level'
export { mountKeygame } from './instance'
