// 运行环境适配层接口（技术架构 §7.4，Web 二期框架预留）
// 全部分叉点（登录态 / 自定义素材仓库 / 词表配置）收拢于此；业务代码禁止绕过适配层直连 IndexedDB / 远端 API。

import type { WordbankConfig } from '@/core/save'

/** 应用用户（本地模式恒为匿名本地用户） */
export interface AppUser {
  id: string
  name: string
  /** 本地匿名用户为 true；Web 登录用户为 false */
  anonymous: boolean
}

/** Web 模式登录凭据（仅 WebAdapter 实现 login 时使用） */
export interface LoginCredentials {
  account: string
  password: string
}

/** 素材元信息（导入时由调用方提供，id 由仓库分配） */
export interface ImageMeta {
  name: string
  /** 字节大小 */
  size: number
  /** MIME 类型，如 image/png */
  type: string
  addedAt: number
}

/** 素材元信息 + 仓库 id（列表返回形态） */
export interface AssetMeta extends ImageMeta {
  id: string
}

/** 素材引用（存档/方案中只存引用不存图体） */
export interface AssetRef {
  id: string
}

/** 登录态分叉点：本地=匿名单用户；Web=登录+会话（二期） */
export interface AuthService {
  getCurrentUser(): AppUser | null
  /** 仅 Web 实现提供（本地匿名模式无登录） */
  login?(credentials: LoginCredentials): Promise<AppUser>
  /** 仅 Web 实现提供 */
  logout?(): Promise<void>
}

/** 自定义素材仓库分叉点：本地=IndexedDB；Web=服务端按用户隔离（二期） */
export interface AssetRepo {
  saveImage(image: Blob, meta: ImageMeta): Promise<AssetRef>
  listImages(): Promise<AssetMeta[]>
  loadImage(ref: AssetRef): Promise<Blob>
  deleteImage(ref: AssetRef): Promise<void>
}

/**
 * 词表配置分叉点：本地=单一配置无权限分割（存于存档 wordbank 段）；
 * Web=服务端按用户权限隔离（二期）。业务代码经此读写词表，勿直连存档。
 */
export interface WordbankRepo {
  /** 读取当前词表配置（无自定义时返回空配置 = 全用引擎默认词表） */
  getConfig(): WordbankConfig
  /** 写入词表配置（空配置归一为移除自定义段） */
  saveConfig(config: WordbankConfig): void
}

/** 运行环境适配器：登录态 + 素材仓库 + 词表配置 */
export interface EnvAdapter {
  auth: AuthService
  assetRepo: AssetRepo
  wordbankRepo: WordbankRepo
}
