import { Readable } from 'node:stream'

export interface FileItem {
  key: string
  size: number
  lastModified?: string
  url: string
}

export interface ListResult {
  items: FileItem[]
  nextCursor?: string
}

export interface StorageAdapter {
  /** 上传文件（Buffer / 流式 Readable / 临时文件路径 均可，流式可避免大文件占满内存） */
  upload(key: string, body: Buffer | Readable | string, mime: string): Promise<void>
  /** 直接列出桶内对象 */
  list(prefix: string, cursor?: string, limit?: number): Promise<ListResult>
  /** 批量删除 */
  remove(keys: string[]): Promise<void>
  /** 拼接公开访问外链 */
  publicUrl(key: string): string
  /** 连通性测试，失败抛异常 */
  test(): Promise<void>
}

export type BucketType = 'r2' | 's3' | 'qiniu' | 'upyun' | 'aliyun-oss' | 'tencent-cos'

export interface S3Config {
  endpoint?: string
  region?: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  customDomain: string
  forcePathStyle?: boolean
}

export interface QiniuConfig {
  accessKey: string
  secretKey: string
  bucket: string
  customDomain: string
  /** 存储区域，默认 z0（华东） */
  zone?: string
}

export interface UpyunConfig {
  service: string
  operator: string
  password: string
  customDomain: string
}

export function joinUrl(domain: string, key: string): string {
  const d = domain.replace(/\/+$/, '')
  const k = key.replace(/^\/+/, '')
  const base = /^https?:\/\//.test(d) ? d : `https://${d}`
  return `${base}/${encodeURI(k)}`
}
