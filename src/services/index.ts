// 适配层出口：业务代码一律经 getEnvAdapter() 获取当前环境适配器
// 一期恒为 LocalAdapter；二期按运行环境装配 WebAdapter（业务代码零改动）

import type { EnvAdapter } from './types'
import { createLocalAdapter } from './local-adapter'

export type { AppUser, LoginCredentials, ImageMeta, AssetMeta, AssetRef, AuthService, AssetRepo, WordbankRepo, EnvAdapter } from './types'
export { LOCAL_USER, createLocalAdapter } from './local-adapter'
export { createWebAdapter } from './web-adapter'
export { createMemoryAssetStore, createIdbAssetStore, type AssetStore } from './asset-store'

let current: EnvAdapter | null = null

/** 获取当前运行环境适配器（默认本地模式；单例） */
export function getEnvAdapter(): EnvAdapter {
  if (!current) {
    current = createLocalAdapter()
  }
  return current
}

/** 重置单例（仅测试用） */
export function resetEnvAdapter(): void {
  current = null
}
