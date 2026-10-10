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
 * 按当前用户校验桶的可访问性：只有桶主本人可访问，否则返回 null。
 * 数据按用户隔离，管理员不例外——管理员只多出「用户管理 / 系统设置」两项能力。
 */
export function getAccessibleBucket(id: number, me: JwtUser) {
  const row = db.prepare('SELECT * FROM buckets WHERE id = ? AND owner_id = ?').get(id, me.uid) as any
  if (!row) return null
  return { ...row, config: JSON.parse(decrypt(row.config_enc)) }
}

// 当前用户的默认图床（上传时自动选中，免每次手动选择）
bucketRoutes.get('/default', (c) => {
  const me = c.get('user') as JwtUser
  const row = db.prepare('SELECT default_bucket_id FROM users WHERE id = ?').get(me.uid) as any
  return c.json({ defaultBucketId: row?.default_bucket_id ?? null })
})

bucketRoutes.put('/default', async (c) => {
  const me = c.get('user') as JwtUser
  const { bucketId } = (await c.req.json().catch(() => ({}))) as { bucketId?: number }
  if (!bucketId || typeof bucketId !== 'number') return c.json({ error: '请指定 bucketId' }, 400)
  // 只能把自己拥有的桶设为默认，杜绝越权
  const owned = db.prepare('SELECT id FROM buckets WHERE id = ? AND owner_id = ?').get(bucketId, me.uid)
  if (!owned) return c.json({ error: '桶不存在或不属于你' }, 404)
  db.prepare('UPDATE users SET default_bucket_id = ? WHERE id = ?').run(bucketId, me.uid)
  return c.json({ ok: true, defaultBucketId: bucketId })
})

bucketRoutes.get('/', (c) => {
  const me = c.get('user') as JwtUser
  const rows = db.prepare('SELECT * FROM buckets WHERE owner_id = ? ORDER BY id').all(me.uid) as any[]
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

// ---- 桶设置导入 / 导出 ----
// 导出：把当前用户自己的桶配置以明文 JSON 返回，含解密后的密钥
bucketRoutes.get('/export', (c) => {
  const me = c.get('user') as JwtUser
  const rows = db.prepare('SELECT * FROM buckets WHERE owner_id = ? ORDER BY id').all(me.uid) as any[]
  const buckets = rows.map((r) => ({
    name: r.name,
    type: r.type,
    keyPrefix: r.key_prefix,
    config: JSON.parse(decrypt(r.config_enc))
  }))
  return c.json({
    app: 'imgbed',
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: me.username,
    buckets
  })
})

// 导入：逐桶处理，已存在的同名桶（同所有者）更新配置，否则新建；密钥重新加密入库
bucketRoutes.post('/import', async (c) => {
  const me = c.get('user') as JwtUser
  const body = await c.req.json().catch(() => ({}))
  const list = Array.isArray(body?.buckets) ? body.buckets : []
  let created = 0
  let updated = 0
  let failed = 0
  const errors: string[] = []
  for (const item of list) {
    const { name, type, config, keyPrefix } = item || {}
    if (!name || !VALID_TYPES.includes(type) || !config || typeof config !== 'object') {
      failed++
      errors.push(`已跳过无效项：${name || '(无名)'}（类型或配置缺失）`)
      continue
    }
    // 过滤占位符，避免把 "******" 当作真实密钥写入
    const clean: any = {}
    for (const [k, v] of Object.entries(config)) {
      if (v === '******' || v === undefined || v === null) continue
      clean[k] = v
    }
    const existing = db
      .prepare('SELECT * FROM buckets WHERE owner_id = ? AND name = ?')
      .get(me.uid, name) as any
    if (existing) {
      const merged = { ...JSON.parse(decrypt(existing.config_enc)) }
      for (const [k, v] of Object.entries(clean)) merged[k] = v
      db.prepare('UPDATE buckets SET type = ?, config_enc = ?, key_prefix = ? WHERE id = ?').run(
        type,
        encrypt(JSON.stringify(merged)),
        keyPrefix ?? existing.key_prefix,
        existing.id
      )
      updated++
    } else {
      db.prepare(
        'INSERT INTO buckets (name, type, config_enc, key_prefix, owner_id) VALUES (?, ?, ?, ?, ?)'
      ).run(name, type, encrypt(JSON.stringify(clean)), keyPrefix || '', me.uid)
      created++
    }
  }
  return c.json({ ok: true, created, updated, failed, errors })
})
