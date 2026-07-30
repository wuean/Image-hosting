import qiniu from 'qiniu'
import type { StorageAdapter, ListResult, QiniuConfig } from './types.js'
import { joinUrl } from './types.js'
import { Readable } from 'node:stream'
import { readFileSync } from 'node:fs'

/** 七牛云 Kodo 适配器 */
export class QiniuAdapter implements StorageAdapter {
  private mac: qiniu.auth.digest.Mac
  private bucketManager: qiniu.rs.BucketManager

  constructor(private cfg: QiniuConfig) {
    this.mac = new qiniu.auth.digest.Mac(cfg.accessKey, cfg.secretKey)
    const config = new qiniu.conf.Config()
    const zoneMap: Record<string, any> = {
      z0: qiniu.zone.Zone_z0,
      z1: qiniu.zone.Zone_z1,
      z2: qiniu.zone.Zone_z2,
      na0: qiniu.zone.Zone_na0,
      as0: qiniu.zone.Zone_as0
    }
    if (cfg.zone && zoneMap[cfg.zone]) config.zone = zoneMap[cfg.zone]
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
      // 七牛 SDK 的 formUploader.put 会把字符串直接当文件内容发送（而非读取路径），
      // 因此收到临时文件路径时必须先读成 Buffer 再上传；Readable 走 putStream。
      const payload = typeof body === 'string' ? readFileSync(body) : body
      if (payload instanceof Readable) formUploader.putStream(token, key, payload, putExtra, cb)
      else formUploader.put(token, key, payload, putExtra, cb)
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
