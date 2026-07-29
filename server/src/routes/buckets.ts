import { Hono } from 'hono'
import { db } from '../db.js'
import { encrypt, decrypt } from '../lib/crypto.js'
import { authGuard, type JwtUser } from '../lib/auth.js'
import { createAdapter, type BucketType } from '../adapters/index.js'

export const bucketRoutes = new Hono()
bucketRoutes.use('*', authGuard)

const VALID_TYPES: BucketType[] = ['r2', 's3', 'qiniu', 'upyun', 'aliyun-oss', 'tencent-cos']

/** 返回给前端时隐藏敏感字段 */
function maskConfig(type: string, config: any) {
  const masked = { ...config }
  for (const k of ['secretAccessKey', 'secretKey', 'password']) {
    if (masked[k]) masked[k] = '******'
  }
  return masked
}

export function getBucketWithConfig(id: number) {
  const row = db.prepare('SELECT * FROM buckets WHERE id = ?').get(id) as any
  if (!row) return null
  return { ...row, config: JSON.parse(decrypt(row.config_enc)) }
}

/**
 * 按当前用户校验桶的可访问性：
 * - 桶主本人：可访问，且 owned=true
 * - 管理员：可访问所有桶（用于查看/协助），但 owned 取决于是否本人拥有
 * - 其他用户：不可访问，返回 null
 */
export function getAccessibleBucket(id: number, me: JwtUser) {
  const row = db.prepare('SELECT * FROM buckets WHERE id = ?').get(id) as any
  if (!row) return null
  const owned = row.owner_id === me.uid
  if (me.role !== 'admin' && !owned) return null
  return { ...row, config: JSON.parse(decrypt(row.config_enc)), owned }
}

bucketRoutes.get('/', (c) => {
  const me = c.get('user') as JwtUser
  const rows =
    me.role === 'admin'
      ? (db.prepare('SELECT * FROM buckets ORDER BY id').all() as any[])
      : (db.prepare('SELECT * FROM buckets WHERE owner_id = ? ORDER BY id').all(me.uid) as any[])
  return c.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      keyPrefix: r.key_prefix,
      ownerId: r.owner_id,
      config: maskConfig(r.type, JSON.parse(decrypt(r.config_enc))),
      createdAt: r.created_at
    }))
  )
})

bucketRoutes.post('/', async (c) => {
  const me = c.get('user') as JwtUser
  const { name, type, config, keyPrefix } = await c.req.json()
  if (!name || !VALID_TYPES.includes(type) || !config) {
    return c.json({ error: '参数不完整' }, 400)
  }
  const res = db
    .prepare('INSERT INTO buckets (name, type, config_enc, key_prefix, owner_id) VALUES (?, ?, ?, ?, ?)')
    .run(name, type, encrypt(JSON.stringify(config)), keyPrefix || '', me.uid)
  return c.json({ id: res.lastInsertRowid })
})

bucketRoutes.put('/:id', async (c) => {
  const me = c.get('user') as JwtUser
  const b = getAccessibleBucket(Number(c.req.param('id')), me)
  if (!b) return c.json({ error: '桶不存在或无权限' }, 404)
  const { name, config, keyPrefix } = await c.req.json()
  const merged = { ...b.config }
  for (const [k, v] of Object.entries(config || {})) {
    if (v !== '******' && v !== undefined && v !== null) merged[k] = v
  }
  db.prepare('UPDATE buckets SET name = ?, config_enc = ?, key_prefix = ? WHERE id = ?').run(
    name || b.name,
    encrypt(JSON.stringify(merged)),
    keyPrefix ?? b.key_prefix,
    b.id
  )
  return c.json({ ok: true })
})

bucketRoutes.delete('/:id', async (c) => {
  const me = c.get('user') as JwtUser
  const b = getAccessibleBucket(Number(c.req.param('id')), me)
  if (!b) return c.json({ error: '桶不存在或无权限' }, 404)
  // 仅删除本站配置与记录；云端实际文件不在本系统删除（需桶主自行处理）
  db.prepare('DELETE FROM buckets WHERE id = ?').run(b.id)
  db.prepare('DELETE FROM images WHERE bucket_id = ?').run(b.id)
  return c.json({ ok: true })
})

bucketRoutes.post('/:id/test', async (c) => {
  const me = c.get('user') as JwtUser
  const b = getAccessibleBucket(Number(c.req.param('id')), me)
  if (!b) return c.json({ error: '桶不存在或无权限' }, 404)
  try {
    await createAdapter(b.type, b.config).test()
    return c.json({ ok: true, message: '连接成功' })
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || String(e) }, 400)
  }
})
