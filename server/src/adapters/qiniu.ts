import qiniu from 'qiniu'
import type { StorageAdapter, ListResult, QiniuConfig } from './types.js'
import { joinUrl } from './types.js'
import type { Readable } from 'node:stream'

/** 七牛云 Kodo 适配器 */
export class QiniuAdapter implements StorageAdapter {
  private mac: qiniu.auth.digest.Mac
  private bucketManager: qiniu.rs.BucketManager

  constructor(private cfg: QiniuConfig) {
    this.mac = new qiniu.auth.digest.Mac(cfg.accessKey, cfg.secretKey)
    const config = new qiniu.conf.Config()
    this.bucketManager = new qiniu.rs.BucketManager(this.mac, config)
  }

  async upload(key: string, body: Buffer | Readable | string, mime: string) {
    const putPolicy = new qiniu.rs.PutPolicy({ scope: `${this.cfg.bucket}:${key}`, insertOnly: 0 })
    const token = putPolicy.uploadToken(this.mac)
    const formUploader = new qiniu.form_up.FormUploader(new qiniu.conf.Config())
    const putExtra = new qiniu.form_up.PutExtra('', undefined, mime)
    await new Promise<void>((resolve, reject) => {
      const cb = (err: any, body2: any, info: any) => {
        if (err) return reject(err)
        if (info.statusCode !== 200) return reject(new Error(`七牛上传失败: ${info.statusCode} ${JSON.stringify(body2)}`))
        resolve()
      }
      // 文件路径直接 put（七牛 SDK 支持 Buffer / 字符串路径 / 流），天然带长度
      if (body instanceof Readable) formUploader.putStream(token, key, body, putExtra, cb)
      else formUploader.put(token, key, body as any, putExtra, cb)
    })
  }

  async list(prefix: string, cursor?: string, limit = 50): Promise<ListResult> {
    return new Promise((resolve, reject) => {
      this.bucketManager.listPrefix(
        this.cfg.bucket,
        { prefix: prefix || '', marker: cursor || '', limit },
        (err, respBody, respInfo) => {
          if (err) return reject(err)
          if (respInfo.statusCode !== 200) return reject(new Error(`七牛列表失败: ${respInfo.statusCode}`))
          resolve({
            items: (respBody.items || []).map((o: any) => ({
              key: o.key,
              size: o.fsize || 0,
              lastModified: o.putTime ? new Date(o.putTime / 10000).toISOString() : undefined,
              url: this.publicUrl(o.key)
            })),
            nextCursor: respBody.marker || undefined
          })
        }
      )
    })
  }

  async remove(keys: string[]) {
    if (!keys.length) return
    const ops = keys.map((k) => qiniu.rs.deleteOp(this.cfg.bucket, k))
    await new Promise<void>((resolve, reject) => {
      this.bucketManager.batch(ops, (err, respBody, respInfo) => {
        if (err) return reject(err)
        if (respInfo.statusCode !== 200 && respInfo.statusCode !== 298) {
          return reject(new Error(`七牛删除失败: ${respInfo.statusCode}`))
        }
        resolve()
      })
    })
  }

  publicUrl(key: string): string {
    return joinUrl(this.cfg.customDomain, key)
  }

  async test() {
    await this.list('', undefined, 1)
  }
}
