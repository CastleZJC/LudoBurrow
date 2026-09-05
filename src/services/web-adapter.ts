// WebAdapter 占位护栏：二期对接服务端（登录 + 素材按用户隔离）
// 一期不实现；构造即报「二期能力」，防止误装配（技术架构 §7.4 / 测试规范 §3.3）

import type { EnvAdapter } from './types'

export interface WebAdapterOptions {
  /** 服务端地址（二期定义） */
  serverBaseUrl?: string
}

export function createWebAdapter(_options: WebAdapterOptions = {}): EnvAdapter {
  throw new Error('WebAdapter 属二期能力：服务端未建设，当前版本请使用 LocalAdapter')
}
