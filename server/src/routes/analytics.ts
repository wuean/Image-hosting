import { Hono } from 'hono'
import crypto from 'node:crypto'
import { db } from '../db.js'
import { authGuard, requireAdmin } from '../lib/auth.js'
import { clientIp } from '../lib/net.js'

export const analyticsRoutes = new Hono()

// 访客指纹加盐用；与 JWT 共用密钥即可（仅本地哈希，不对外暴露）
const SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me'

/** 只接受站内 SPA 路径，拒绝 /api 与可疑输入 */
function normalizePath(p: unknown): string | null {
  if (typeof p !== 'string') return null
  const s = p.trim().split('?')[0]
  if (!s.startsWith('/') || s.startsWith('/api') || s.length > 120) return null
  if (!/^\/[A-Za-z0-9/_-]*$/.test(s)) return null
  return s
}

// ---- 公开：页面访问上报（必须注册在守卫之前，参考 settings.ts 的顺序技巧）----
analyticsRoutes.post('/track', async (c) => {
  let body: any = {}
  try {
    body = await c.req.json()
  } catch {
    /* 非法 body 忽略 */
  }
  const path = normalizePath(body?.path)
  if (!path) return c.body(null, 204)

  const ua = c.req.header('user-agent') || ''
  const referer = typeof body?.referer === 'string' ? body.referer.slice(0, 300) : null
  const visitor = crypto.createHash('sha256').update(`${clientIp(c)}|${ua}|${SECRET}`).digest('hex')

  db.prepare('INSERT INTO page_views (path, referer, visitor) VALUES (?, ?, ?)').run(path, referer, visitor)
  return c.body(null, 204)
})

// ---- 以下仅限管理员 ----
analyticsRoutes.use('*', authGuard, requireAdmin)

analyticsRoutes.get('/', (c) => {
  const days = Math.min(365, Math.max(1, Number(c.req.query('days') || 30)))
  const since = `-${days - 1} days` // 含今天共 days 天

  const todayPV = (db.prepare("SELECT COUNT(*) AS c FROM page_views WHERE date(created_at) = date('now')").get() as any).c
  const todayUV = (
    db.prepare("SELECT COUNT(DISTINCT visitor) AS c FROM page_views WHERE date(created_at) = date('now')").get() as any
  ).c
  const rangePV = (db.prepare('SELECT COUNT(*) AS c FROM page_views WHERE created_at >= datetime(\'now\', ?)').get(since) as any).c
  const rangeUV = (
    db.prepare('SELECT COUNT(DISTINCT visitor) AS c FROM page_views WHERE created_at >= datetime(\'now\', ?)').get(since) as any
  ).c

  // 按天聚合 + 补齐空缺日期
  const rows = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS pv, COUNT(DISTINCT visitor) AS uv
       FROM page_views WHERE created_at >= datetime('now', ?)
       GROUP BY day`
    )
    .all(since) as any[]
  const map = new Map(rows.map((r) => [r.day, r]))
  const daily: any[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = (db.prepare("SELECT date('now', ?) AS d").get(`-${i} days`) as any).d
    const r = map.get(day)
    daily.push({ date: day, pv: r?.pv || 0, uv: r?.uv || 0 })
  }

  // 来源：取原始 referer 后在 JS 里解析主机名，剔除站内跳转
  const refRows = db
    .prepare(
      `SELECT referer, COUNT(*) AS count FROM page_views
       WHERE created_at >= datetime('now', ?) AND referer IS NOT NULL AND referer != ''
       GROUP BY referer ORDER BY count DESC LIMIT 200`
    )
    .all(since) as any[]
  const selfHost = (process.env.PUBLIC_BASE_URL || c.req.header('host') || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
  const byHost: Record<string, number> = {}
  for (const r of refRows) {
    try {
      const host = new URL(r.referer).host.toLowerCase()
      if (selfHost && host === selfHost) continue
      byHost[host] = (byHost[host] || 0) + r.count
    } catch {
      /* 非法 URL 忽略 */
    }
  }
  const topReferers = Object.entries(byHost)
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const loginLogs = db
    .prepare('SELECT username, ip, created_at FROM login_logs ORDER BY id DESC LIMIT 20')
    .all() as any[]

  return c.json({
    days,
    summary: { todayPV, todayUV, rangePV, rangeUV },
    daily,
    topReferers,
    loginLogs
  })
})