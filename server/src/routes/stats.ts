import { Hono } from 'hono'
import { db } from '../db.js'
import { decrypt } from '../lib/crypto.js'
import { authGuard, type JwtUser } from '../lib/auth.js'
import { createAdapter } from '../adapters/index.js'

export const statsRoutes = new Hono()
statsRoutes.use('*', authGuard)

/** 当前用户自己的桶（含解密后的配置）。数据按用户隔离，管理员不例外。 */
function accessibleBuckets(me: JwtUser) {
  const rows = db.prepare('SELECT * FROM buckets WHERE owner_id = ?').all(me.uid) as any[]
  return rows.map((r) => ({ ...r, config: JSON.parse(decrypt(r.config_enc)) }))
}

statsRoutes.get('/', (c) => {
  const me = c.get('user') as JwtUser
  const buckets = accessibleBuckets(me)

  // ---- 桶统计 ----
  const total = buckets.length
  const byProvider: Record<string, number> = {}
  for (const b of buckets) byProvider[b.type] = (byProvider[b.type] || 0) + 1
  const providerArr = Object.entries(byProvider).map(([provider, count]) => ({ provider, count }))

  // ---- 图片统计（仅统计可见桶）----
  let totalImages = 0
  let totalSize = 0
  let thisMonth = 0
  const perBucket: any[] = []
  for (const b of buckets) {
    const row = db
      .prepare('SELECT COUNT(*) AS c, COALESCE(SUM(size),0) AS s FROM images WHERE bucket_id = ?')
      .get(b.id) as any
    const m = db
      .prepare(
        "SELECT COUNT(*) AS c FROM images WHERE bucket_id = ? AND created_at >= date('now','start of month')"
      )
      .get(b.id) as any
    perBucket.push({ id: b.id, name: b.name, provider: b.type, count: row.c, size: row.s })
    totalImages += row.c
    totalSize += row.s
    thisMonth += m.c
  }
  perBucket.sort((a, b) => b.count - a.count)

  // ---- 最近上传（跨可见桶，取最新 12 条，附带可访问外链）----
  const ids = buckets.map((b) => b.id)
  let recent: any[] = []
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT i.*, b.name AS bucket_name, b.type AS provider
         FROM images i JOIN buckets b ON b.id = i.bucket_id
         WHERE i.bucket_id IN (${placeholders})
         ORDER BY i.id DESC LIMIT 12`
      )
      .all(...ids) as any[]
    recent = rows.map((r) => {
      const b = buckets.find((x) => x.id === r.bucket_id)
      let url = ''
      try {
        if (b) url = createAdapter(b.type, b.config).publicUrl(r.key)
      } catch {
        /* 某些服务商缺域名时不阻断统计 */
      }
      return {
        id: r.id,
        key: r.key,
        name: r.original_name,
        size: r.size,
        createdAt: r.created_at,
        url,
        bucketName: r.bucket_name,
        provider: r.provider
      }
    })
  }

  return c.json({
    buckets: { total, byProvider: providerArr },
    images: { total: totalImages, totalSize, thisMonth },
    perBucket,
    recent
  })
})
