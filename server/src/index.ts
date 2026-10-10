import './env.js'
import process from 'node:process'

process.on('uncaughtException', (e) => console.error('[uncaughtException]', e))
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e))
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { cors } from 'hono/cors'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import './db.js'

// 前端构建产物目录（基于当前文件位置解析，不依赖启动 cwd）
// src/index.ts -> ../../web/dist == <workspace>/web/dist
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url))
import { authRoutes } from './routes/auth.js'
import { bucketRoutes } from './routes/buckets.js'
import { imageRoutes } from './routes/images.js'
import { statsRoutes } from './routes/stats.js'
import { settingsRoutes } from './routes/settings.js'

const app = new Hono()
// CORS：默认仅允许本站域名（PUBLIC_BASE_URL）；可用 CORS_ORIGIN 放开（逗号分隔多个源）；
// 两者都未配置时回退为 *（保持兼容，但生产建议配置以收敛范围）
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  : process.env.PUBLIC_BASE_URL || '*'
if (!process.env.CORS_ORIGIN && !process.env.PUBLIC_BASE_URL) {
  console.warn('[cors] 未配置 PUBLIC_BASE_URL / CORS_ORIGIN，已放开所有来源，仅建议本地开发使用')
}
app.use(
  '/api/*',
  cors({
    origin: corsOrigin,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400
  })
)
app.onError((err, c) => {
  console.error('[hono] 未捕获错误:', err)
  return c.json({ error: '服务器内部错误', detail: err?.message || String(err) }, 500)
})

// 安全响应头（全站）
app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
})
// API 响应额外加严格 CSP（仅返回 JSON，禁止任何资源加载与被框架嵌入）
app.use('/api/*', async (c, next) => {
  await next()
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
})

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }))
app.route('/api/auth', authRoutes)
app.route('/api/buckets', bucketRoutes)
app.route('/api/images', imageRoutes)
app.route('/api/stats', statsRoutes)
app.route('/api/settings', settingsRoutes)

app.use('/*', serveStatic({ root: WEB_DIST }))
app.get('*', serveStatic({ path: path.join(WEB_DIST, 'index.html') }))

const port = Number(process.env.PORT || 3000)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[imgbed] 后端已启动: http://localhost:${info.port}`)
})
