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
  const rawIp = clientIp(c)
  const visitor = crypto.createHash('sha256').update(`${rawIp}|${ua}|${SECRET}`).digest('hex')
  // 仅含 IP 的哈希：用于统计「访问过站点的去重 IP 数」（visitor 混入 UA，不能用于此）
  const ipHash = crypto.createHash('sha256').update(`${rawIp}|${SECRET}`).digest('hex')

  db.prepare('INSERT INTO page_views (path, referer, visitor, ip_hash) VALUES (?, ?, ?, ?)').run(path, referer, visitor, ipHash)
  return c.body(null, 204)
})

// ---- 以下仅限管理员 ----
analyticsRoutes.use('*', authGuard, requireAdmin)

analyticsRoutes.get('/', (c) => {
  // days：0 = 今日；7 / 30 / 90 = 含今天共 N 天。页面所有内容都跟随这个范围。
  const raw = Number(c.req.query('days'))
  const days = [0, 7, 30, 90].includes(raw) ? raw : 30
  const isToday = days === 0
  // 统一的区间下界：今日 → 今天零点；其余 → (N-1) 天前这一刻
  const sinceSql = isToday ? "date('now')" : "datetime('now', ?)"
  const sinceParams: any[] = isToday ? [] : [`-${days - 1} days`]

  const pv = (db.prepare(`SELECT COUNT(*) AS c FROM page_views WHERE created_at >= ${sinceSql}`).get(...sinceParams) as any).c
  const uv = (
    db.prepare(`SELECT COUNT(DISTINCT visitor) AS c FROM page_views WHERE created_at >= ${sinceSql}`).get(...sinceParams) as any
  ).c
  // IP 数：访问过站点的去重 IP（取自 page_views.ip_hash，与登录记录无关）
  const ip = (db.prepare(`SELECT COUNT(DISTINCT ip_hash) AS c FROM page_views WHERE created_at >= ${sinceSql}`).get(...sinceParams) as any).c

  // 趋势：今日按小时（0-23 补全），其余按天（补齐空缺日期）
  const series: { label: string; pv: number; uv: number }[] = []
  if (isToday) {
    const rows = db
      .prepare(
        `SELECT strftime('%H', created_at) AS h, COUNT(*) AS pv, COUNT(DISTINCT visitor) AS uv
         FROM page_views WHERE created_at >= date('now') GROUP BY h`
      )
      .all() as any[]
    const map = new Map(rows.map((r) => [r.h, r]))
    for (let i = 0; i < 24; i++) {
      const h = String(i).padStart(2, '0')
      const r = map.get(h)
      series.push({ label: `${h}:00`, pv: r?.pv || 0, uv: r?.uv || 0 })
    }
  } else {
    const rows = db
      .prepare(
        `SELECT date(created_at) AS day, COUNT(*) AS pv, COUNT(DISTINCT visitor) AS uv
         FROM page_views WHERE created_at >= datetime('now', ?) GROUP BY day`
      )
      .all(`-${days - 1} days`) as any[]
    const map = new Map(rows.map((r) => [r.day, r]))
    for (let i = days - 1; i >= 0; i--) {
      const day = (db.prepare("SELECT date('now', ?) AS d").get(`-${i} days`) as any).d
      const r = map.get(day)
      series.push({ label: day, pv: r?.pv || 0, uv: r?.uv || 0 })
    }
  }

  // 来源：取原始 referer 后在 JS 里解析主机名，剔除站内跳转
  const refRows = db
    .prepare(
      `SELECT referer, COUNT(*) AS count FROM page_views
       WHERE created_at >= ${sinceSql} AND referer IS NOT NULL AND referer != ''
       GROUP BY referer ORDER BY count DESC LIMIT 200`
    )
    .all(...sinceParams) as any[]
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
    .prepare(`SELECT username, ip, created_at FROM login_logs WHERE created_at >= ${sinceSql} ORDER BY id DESC LIMIT 20`)
    .all(...sinceParams) as any[]

  return c.json({
    days,
    summary: { pv, uv, ip },
    granularity: isToday ? 'hour' : 'day',
    series,
    topReferers,
    loginLogs
  })
})