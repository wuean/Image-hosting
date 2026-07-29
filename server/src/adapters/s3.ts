import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  HeadBucketCommand
} from '@aws-sdk/client-s3'
import type { StorageAdapter, ListResult, S3Config } from './types.js'
import { joinUrl } from './types.js'
import type { Readable } from 'node:stream'
import { createReadStream, statSync } from 'node:fs'

/** R2 / AWS S3 / MinIO 共用适配器（S3 协议） */
export class S3Adapter implements StorageAdapter {
  private client: S3Client
  constructor(private cfg: S3Config) {
    this.client = new S3Client({
      region: cfg.region || 'auto',
      endpoint: cfg.endpoint || undefined,
      forcePathStyle: cfg.forcePathStyle ?? false,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey
      }
    })
  }

  async upload(key: string, body: Buffer | Readable | string, mime: string) {
    // 传文件路径时带 ContentLength，避免 SDK 用 chunked 编码导致 R2/S3 拒绝
    const extra = typeof body === 'string' ? { ContentLength: statSync(body).size } : {}
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: typeof body === 'string' ? createReadStream(body) : body,
        ContentType: mime,
        ...extra
      })
    )
  }

  async list(prefix: string, cursor?: string, limit = 50): Promise<ListResult> {
    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.cfg.bucket,
        Prefix: prefix || undefined,
        ContinuationToken: cursor || undefined,
        MaxKeys: limit
      })
    )
    return {
      items: (res.Contents || []).map((o) => ({
        key: o.Key!,
        size: o.Size || 0,
        lastModified: o.LastModified?.toISOString(),
        url: this.publicUrl(o.Key!)
      })),
      nextCursor: res.IsTruncated ? res.NextContinuationToken : undefined
    }
  }

  async remove(keys: string[]) {
    if (!keys.length) return
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.cfg.bucket,
        Delete: { Objects: keys.map((k) => ({ Key: k })) }
      })
    )
  }

  publicUrl(key: string): string {
    return joinUrl(this.cfg.customDomain, key)
  }

  async test() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.cfg.bucket }))
  }
}
