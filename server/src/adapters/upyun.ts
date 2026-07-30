import upyun from 'upyun'
import type { StorageAdapter, ListResult, UpyunConfig } from './types.js'
import { joinUrl } from './types.js'
import type { Readable } from 'node:stream'
import { readFileSync } from 'node:fs'
import type { Readable } from 'node:stream'

/** 又拍云 USS 适配器 */
export class UpyunAdapter implements StorageAdapter {
  private client: any

  constructor(private cfg: UpyunConfig) {
    const service = new (upyun as any).Service(cfg.service, cfg.operator, cfg.password)
    this.client = new (upyun as any).Client(service)
  }

  async upload(key: string, body: Buffer | Readable | string, mime: string) {
    // upyun SDK 的 putFile 会把字符串参数直接当 body 内容发送，而不是读取文件路径。
    // 因此当收到临时文件路径时，必须先在服务端读取为 Buffer，再交给 SDK。
    let content: Buffer | Readable
    if (body instanceof Readable) {
      content = body
    } else if (typeof body === 'string') {
      content = readFileSync(body)
    } else {
      content = body
    }
    try {
      const ok = await this.client.putFile(`/${key}`, content, { 'Content-Type': mime })
      if (!ok) throw new Error('又拍云上传失败')
    } catch (e: any) {
      throw new Error('又拍云上传失败: ' + (e?.message || e))
    }
  }

  async list(prefix: string, cursor?: string, limit = 50): Promise<ListResult> {
    const dir = '/' + (prefix || '').replace(/^\/+/, '')
    const res = await this.client.listDir(dir, { limit, iter: cursor || undefined })
    if (res === false) return { items: [] }
    const base = dir === '/' ? '' : dir.replace(/^\/+/, '').replace(/\/+$/, '') + '/'
    return {
      items: (res.files || [])
        .filter((f: any) => f.type !== 'F')
        .map((f: any) => ({
          key: base + f.name,
          size: f.size || 0,
          lastModified: f.time ? new Date(f.time * 1000).toISOString() : undefined,
          url: this.publicUrl(base + f.name)
        })),
      nextCursor: res.next && res.next !== 'g2gCZAAEbmV4dGQAA2VvZg' ? res.next : undefined
    }
  }

  async remove(keys: string[]) {
    for (const k of keys) {
      await this.client.deleteFile(`/${k}`)
    }
  }

  publicUrl(key: string): string {
    return joinUrl(this.cfg.customDomain, key)
  }

  async test() {
    const res = await this.client.usage()
    if (res === false) throw new Error('又拍云连接失败，请检查服务名/操作员/密码')
  }
}
