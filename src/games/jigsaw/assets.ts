// 拼图自定义素材 I/O 公共工具
// 原 SchemeManager / SchemeEditor 各自重复的 Blob→dataURL 与入库元信息构造统一于此
import { getEnvAdapter } from '@/services'
import type { AssetRef } from '@/services'

/** Blob → dataURL（FileReader 包装） */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader 失败'))
    reader.readAsDataURL(blob)
  })
}

/** 本地图片文件入素材仓库，返回引用（方案只存引用不存图体，M3.11） */
export async function persistImageFile(file: File): Promise<AssetRef> {
  return await getEnvAdapter().assetRepo.saveImage(file, {
    name: file.name,
    size: file.size,
    type: file.type,
    addedAt: Date.now(),
  })
}
