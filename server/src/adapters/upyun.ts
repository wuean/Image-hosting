import upyun from 'upyun'
import type { StorageAdapter, ListResult, UpyunConfig } from './types.js'
import { joinUrl } from './types.js'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createWriteStream, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

/** 又拍云 USS 适配器 */
export class UpyunAdapter implements StorageAdapter {
  private client: any

  constructor(private cfg: UpyunConfig) {
    const service = new (upyun as any).Service(cfg.service, cfg.operator, cfg.password)
    this.client = new (upyun as any).Client(service)
  }

  async upload(key: string, body: Buffer | Readable | string, mime: string) {
    let tmp: string | null = null
    let content: Buffer | string
    if (body instanceof Readable) {
      tmp = path.join(os.tmpdir(), `upyun-${crypto.randomBytes(8).toString('hex')}`)
      await pipeline(body, createWriteStream(tmp))
      content = tmp
    } else {
      content = body
    }
    try {
      const ok = await this.client.putFile(`/${key}`, content, { 'Content-Type': mime })
      if (!ok) throw new Error('又拍云上传失败')
    } finally {
      if (tmp) {
        try {
          unlinkSync(tmp)
        } catch {
          /* 忽略清理失败 */
        }
      }
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
