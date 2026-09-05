import { describe, it, expect, beforeEach } from 'vitest'
import {
  createLocalAdapter, createWebAdapter, LOCAL_USER,
  createMemoryAssetStore, getEnvAdapter, resetEnvAdapter,
} from '@/services'
import type { ImageMeta } from '@/services'

function sampleMeta(): ImageMeta {
  return { name: 'photo.png', size: 1024, type: 'image/png', addedAt: 1_700_000_000_000 }
}

function makeBlob(): Blob {
  return new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
}

describe('LocalAdapter', () => {
  beforeEach(() => resetEnvAdapter())

  it('getCurrentUser 恒返回匿名本地用户（本地免登录）', () => {
    const adapter = createLocalAdapter({ store: createMemoryAssetStore() })
    expect(adapter.auth.getCurrentUser()).toEqual(LOCAL_USER)
    expect(adapter.auth.getCurrentUser()?.anonymous).toBe(true)
  })

  it('本地模式不提供 login/logout（匿名语义）', () => {
    const adapter = createLocalAdapter({ store: createMemoryAssetStore() })
    expect(adapter.auth.login).toBeUndefined()
    expect(adapter.auth.logout).toBeUndefined()
  })

  it('素材仓库 CRUD 闭环：保存 → 列表 → 加载 → 删除', async () => {
    const adapter = createLocalAdapter({ store: createMemoryAssetStore() })
    const ref = await adapter.assetRepo.saveImage(makeBlob(), sampleMeta())
    expect(ref.id).not.toBe('')

    const list = await adapter.assetRepo.listImages()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('photo.png')

    const blob = await adapter.assetRepo.loadImage(ref)
    expect(blob.size).toBe(4)

    await adapter.assetRepo.deleteImage(ref)
    expect(await adapter.assetRepo.listImages()).toHaveLength(0)
  })

  it('加载不存在的素材抛错（占位提示由 UI 层承接）', async () => {
    const adapter = createLocalAdapter({ store: createMemoryAssetStore() })
    await expect(adapter.assetRepo.loadImage({ id: 'nonexistent' })).rejects.toThrow(/不存在/)
  })

  it('getEnvAdapter 返回单例 LocalAdapter', () => {
    const a = getEnvAdapter()
    const b = getEnvAdapter()
    expect(a).toBe(b)
    expect(a.auth.getCurrentUser()).toEqual(LOCAL_USER)
  })
})

describe('WebAdapter 占位护栏', () => {
  it('构造即报二期能力（防止误装配）', () => {
    expect(() => createWebAdapter()).toThrow(/二期/)
  })
})
