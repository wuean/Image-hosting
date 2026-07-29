import { Hono } from 'hono'
import crypto from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createWriteStream, unlinkSync } from 'node:fs'
import Busboy from 'busboy'
import { db } from '../db.js'
import { authGuard, type JwtUser } from '../lib/auth.js'
import { createAdapter } from '../adapters/index.js'
import { getAccessibleBucket } from './buckets.js'

export const imageRoutes = new Hono()
imageRoutes.use('*', authGuard)

function genKey(prefix: string, originalName: string): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const ext = (path.extname(originalName) || '.png').toLowerCase()
  const base = path.basename(originalName, path.extname(originalName)) || 'image'
  const p = prefix ? prefix.replace(/^\/+|\/+$/g, '') + '/' : ''
  return `${p}${yyyy}/${mm}/${base}${ext}`
}

/** 中转上传（流式转发：请求体边收边传，避免大文件占满内存）。仅桶主可上传到自己的桶。 */
imageRoutes.post('/upload', async (c) => {
  const me = c.get('user') as JwtUser
  const bucketId = Number(c.req.query('bucketId'))
  const bucket = getAccessibleBucket(bucketId, me)
  if (!bucket) return c.json({ error: '桶不存在或无权限' }, 404)
  if (!bucket.owned) return c.json({ error: '只能上传到你自己的存储桶' }, 403)

  const contentType = c.req.header('content-type') || ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return c.json({ error: '请使用 multipart/form-data 上传文件' }, 400)
  }
  const rawBody = (c.req.raw as any).body as ReadableStream<Uint8Array> | null
  if (!rawBody) return c.json({ error: '未收到请求体' }, 400)

  const adapter = createAdapter(bucket.type, bucket.config)
  const busboy = Busboy({ headers: { 'content-type': contentType } })
  const results: any[] = []
  const errors: string[] = []
  const tasks: Promise<void>[] = []

  busboy.on('file', (_field, fileStream, info) => {
    const filename = info.filename || `file-${Date.now()}`
    const mime = info.mimeType || 'application/octet-stream'
    const key = genKey(bucket.key_prefix, filename)
    const tmp = path.join(os.tmpdir(), `imgbed-${crypto.randomBytes(8).toString('hex')}`)
    let size = 0
    // 计数流：透传字节的同时统计大小，避免先缓存整文件
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        size += chunk.length
        cb(null, chunk)
      }
    })
    const src = fileStream.pipe(counter)
    // 流式写入临时文件（内存只占一个分块），再用文件句柄上传——彻底避免大文件占满内存
    tasks.push(
      pipeline(src, createWriteStream(tmp))
        .then(() => adapter.upload(key, tmp, mime))
        .then(() => {
          db.prepare(
            'INSERT INTO images (bucket_id, user_id, key, original_name, size, mime) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(bucketId, me.uid, key, filename, size, mime)
          results.push({
            key,
            url: adapter.publicUrl(key),
            markdown: `![${filename}](${adapter.publicUrl(key)})`,
            size,
            name: filename
          })
        })
        .catch((e) => errors.push(`${filename}: ${e?.message || e}`))
        .finally(() => {
          try {
            unlinkSync(tmp)
          } catch {
            /* 忽略清理失败 */
          }
        })
    )
  })

  const done = new Promise<void>((resolve, reject) => {
    busboy.on('error', reject)
    busboy.on('finish', resolve)
  })

  // 把原生请求体（Web ReadableStream）转成 Node Readable 后喂给 busboy
  const nodeReq = Readable.fromWeb(rawBody as any)
  nodeReq.on('error', (e) => busboy.emit('error', e))
  nodeReq.pipe(busboy)

  try {
    await done
  } catch (e: any) {
    return c.json({ error: `上传解析失败: ${e?.message || e}` }, 400)
  }
  // 等所有文件的云端上传完成（流式转发不保证 busboy.finish 时云端已写完）
  await Promise.allSettled(tasks)

  if (errors.length) {
    return c.json({ files: results, errors }, results.length ? 207 : 400)
  }
  return c.json({ files: results })
})

/** 上传记录（本站数据库，按桶归属可见） */
imageRoutes.get('/records', (c) => {
  const me = c.get('user') as JwtUser
  const bucketId = Number(c.req.query('bucketId'))
  const bucket = getAccessibleBucket(bucketId, me)
  if (!bucket) return c.json({ error: '桶不存在或无权限' }, 404)
  const page = Math.max(1, Number(c.req.query('page') || 1))
  const pageSize = 30
  const adapter = createAdapter(bucket.type, bucket.config)
  const total = (db.prepare('SELECT COUNT(*) AS c FROM images WHERE bucket_id = ?').get(bucketId) as any).c
  const rows = db
    .prepare('SELECT * FROM images WHERE bucket_id = ? ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(bucketId, pageSize, (page - 1) * pageSize) as any[]
  return c.json({
    total,
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.original_name,
      size: r.size,
      mime: r.mime,
      createdAt: r.created_at,
      url: adapter.publicUrl(r.key)
    }))
  })
})

/** 直接浏览桶内对象（按桶归属可见） */
imageRoutes.get('/browse', async (c) => {
  const me = c.get('user') as JwtUser
  const bucketId = Number(c.req.query('bucketId'))
  const bucket = getAccessibleBucket(bucketId, me)
  if (!bucket) return c.json({ error: '桶不存在或无权限' }, 404)
  try {
    const adapter = createAdapter(bucket.type, bucket.config)
    const res = await adapter.list(c.req.query('prefix') || '', c.req.query('cursor') || undefined, 50)
    return c.json(res)
  } catch (e: any) {
    return c.json({ error: e?.message || String(e) }, 400)
  }
})

/** 批量删除（仅桶主可删除远端实际文件，管理员也不行） */
imageRoutes.post('/delete', async (c) => {
  const me = c.get('user') as JwtUser
  const { bucketId, keys } = await c.req.json<{ bucketId: number; keys: string[] }>()
  const bucket = getAccessibleBucket(Number(bucketId), me)
  if (!bucket) return c.json({ error: '桶不存在或无权限' }, 404)
  if (!bucket.owned) return c.json({ error: '只有桶主可以删除桶内的实际文件' }, 403)
  if (!keys?.length) return c.json({ error: '未指定文件' }, 400)
  try {
    await createAdapter(bucket.type, bucket.config).remove(keys)
  } catch (e: any) {
    return c.json({ error: `远端删除失败: ${e?.message || e}` }, 400)
  }
  const stmt = db.prepare('DELETE FROM images WHERE bucket_id = ? AND key = ?')
  for (const k of keys) stmt.run(bucketId, k)
  return c.json({ ok: true })
})
