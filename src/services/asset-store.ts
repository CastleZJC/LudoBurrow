// 素材存储后端抽象：IndexedDB 生产实现 + 内存实现（测试注入）
// 分层动机：CRUD 逻辑与 IDB 绑定解耦，单测用内存后端覆盖业务语义（测试规范 §3.3）。

import type { AssetMeta, ImageMeta } from './types'

interface StoredAsset extends AssetMeta {
  blob: Blob
}

export interface AssetStore {
  put(meta: ImageMeta, blob: Blob): Promise<AssetMeta>
  list(): Promise<AssetMeta[]>
  get(id: string): Promise<(AssetMeta & { blob: Blob }) | undefined>
  delete(id: string): Promise<void>
}

/** 生成素材 id：时间戳 + 递增序列 + 随机后缀，本地单机足够 */
function newAssetId(): string {
  assetSeq = (assetSeq + 1) % 0xffff
  return `img-${Date.now().toString(36)}-${assetSeq.toString(36)}-${Math.floor(Math.random() * 0xffff).toString(36)}`
}
let assetSeq = 0

/** 内存后端（测试注入 / IndexedDB 不可用兜底） */
export function createMemoryAssetStore(): AssetStore {
  const map = new Map<string, StoredAsset>()
  return {
    async put(meta, blob) {
      const asset: StoredAsset = { ...meta, id: newAssetId(), blob }
      map.set(asset.id, asset)
      const { blob: _omit, ...out } = asset
      return out
    },
    async list() {
      return [...map.values()].map(({ blob: _b, ...meta }) => meta)
    },
    async get(id) {
      return map.get(id)
    },
    async delete(id) {
      map.delete(id)
    },
  }
}

const DB_NAME = 'ludoburrow-assets'
const STORE = 'images'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

/**
 * IndexedDB 生产后端（file:// 与 https:// 均可用）。
 * IndexedDB 不可用时回退内存实现并 console.warn（当次会话可用，不中断功能）。
 */
export function createIdbAssetStore(): AssetStore {
  if (typeof indexedDB === 'undefined') {
    console.warn('[services] 当前环境无 IndexedDB，素材仓库回退内存实现（当次会话）')
    return createMemoryAssetStore()
  }
  const withStore = async <T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await openDb()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = run(tx.objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
      tx.oncomplete = () => db.close()
    })
  }
  return {
    async put(meta, blob) {
      const asset: StoredAsset = { ...meta, id: newAssetId(), blob }
      await withStore('readwrite', (s) => s.put(asset) as IDBRequest<IDBValidKey>)
      const { blob: _omit, ...out } = asset
      return out
    },
    async list() {
      const all = await withStore<StoredAsset[]>('readonly', (s) => s.getAll() as IDBRequest<StoredAsset[]>)
      return all.map(({ blob: _b, ...meta }) => meta)
    },
    async get(id) {
      return await withStore<StoredAsset | undefined>('readonly', (s) => s.get(id) as IDBRequest<StoredAsset | undefined>)
    },
    async delete(id) {
      await withStore('readwrite', (s) => s.delete(id) as unknown as IDBRequest<undefined>)
    },
  }
}
