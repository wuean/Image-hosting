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
app.use('/api/*', cors())
app.onError((err, c) => {
  console.error('[hono] 未捕获错误:', err)
  return c.json({ error: '服务器内部错误', detail: err?.message || String(err) }, 500)
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
