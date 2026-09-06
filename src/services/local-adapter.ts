// LocalAdapter：本地模式全量实现（一期）——匿名单用户 + IndexedDB 素材仓库
// 本地端永不需要登录、素材不隔离、词表无权限分割（技术架构 §7.4 分叉表）

import type { AppUser, AssetMeta, AssetRef, EnvAdapter, ImageMeta } from './types'
import { createIdbAssetStore, type AssetStore } from './asset-store'
import { loadSave, persistSave } from '@/core/save'
import type { SaveData, WordbankConfig } from '@/core/save'

/** 本地匿名用户（恒定，F-26：本地免登录直接玩） */
export const LOCAL_USER: AppUser = { id: 'local', name: 'local-user', anonymous: true }

export interface LocalAdapterOptions {
  /** 测试注入内存后端；缺省用 IndexedDB 生产后端 */
  store?: AssetStore
}

export function createLocalAdapter(options: LocalAdapterOptions = {}): EnvAdapter {
  const store = options.store ?? createIdbAssetStore()
  return {
    auth: {
      getCurrentUser: () => LOCAL_USER,
      // 本地模式无登录/登出（login/logout 不提供）
    },
    assetRepo: {
      async saveImage(image: Blob, meta: ImageMeta): Promise<AssetRef> {
        const saved: AssetMeta = await store.put(meta, image)
        return { id: saved.id }
      },
      listImages: () => store.list(),
      async loadImage(ref: AssetRef): Promise<Blob> {
        const asset = await store.get(ref.id)
        if (!asset) throw new Error(`assetRepo: 素材不存在 "${ref.id}"`)
        return asset.blob
      },
      async deleteImage(ref: AssetRef): Promise<void> {
        await store.delete(ref.id)
      },
    },
    wordbankRepo: {
      // 本地单一配置：直读存档 wordbank 段（无用户隔离）；缺省 = 空配置 → 引擎默认词表
      getConfig(): WordbankConfig {
        return loadSave().wordbank ?? {}
      },
      saveConfig(config: WordbankConfig): void {
        const next: SaveData = { ...loadSave() }
        // 空配置（无 english / pinyin 覆盖）归一为移除自定义段，保持存档精简
        if (config.english || config.pinyin) next.wordbank = config
        else delete next.wordbank
        persistSave(next)
      },
    },
  }
}
