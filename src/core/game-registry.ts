// 游戏注册表：GameModule 在此注册即接入（技术架构 §7.1）
// 平台 UI 一律经本注册表动态获取游戏模块，不直接 import games/。

import type { GameModule } from './types'

const registry = new Map<string, GameModule>()

/** 注册游戏模块；重复 id 直接抛错（编程错误，开发期暴露） */
export function registerGame(module: GameModule): void {
  if (registry.has(module.id)) {
    throw new Error(`game-registry: 游戏 id 重复注册 "${module.id}"`)
  }
  registry.set(module.id, module)
}

/** 注销（仅测试用） */
export function unregisterGame(id: string): void {
  registry.delete(id)
}

/** 全部已注册游戏（主菜单渲染入口） */
export function listGames(): GameModule[] {
  return [...registry.values()]
}

/** 按 id 获取游戏模块；未注册返回 undefined */
export function getGame(id: string): GameModule | undefined {
  return registry.get(id)
}
