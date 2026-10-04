import { Hono } from 'hono'
import { db } from '../db.js'
import { authGuard, requireAdmin, type JwtUser } from '../lib/auth.js'
import { encrypt, decrypt } from '../lib/crypto.js'
import { sendTestEmail } from '../lib/mail.js'

export const settingsRoutes = new Hono()

const DEFAULTS: Record<string, string> = {
  site_name: '图床管理',
  logo_text: '图',
  logo_url: '',
  login_bg_url: '',
  // SMTP
  smtp_host: '',
  smtp_port: '465',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
  smtp_secure: 'true',
  // 上传水印（全局一套，JSON 字符串）
  watermark: JSON.stringify({ text: '', pos: 'br', tile: false, opacity: 35, size: 3, color: '#FAA07A', rotate: -30 })
}

// 公开信息（登录页 / App 外壳 / 上传页读取水印参数用）：绝不包含任何 SMTP 等敏感配置
const PUBLIC_KEYS = ['site_name', 'logo_text', 'logo_url', 'login_bg_url', 'watermark']
// 敏感配置（仅管理员可见）：其中 smtp_pass 在库中加密存储
const SENSITIVE_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_secure']
const ALLOWED_KEYS = [...PUBLIC_KEYS, ...SENSITIVE_KEYS]

const WM_POSITIONS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']

/** 水印参数落到库里前先归一化，避免越界值把前端画布画坏 */
function sanitizeWatermark(raw: any): string {
  let o: any = {}
  try {
    o = typeof raw === 'string' ? JSON.parse(raw) : raw || {}
  } catch {
    o = {}
  }
  const num = (v: any, min: number, max: number, dflt: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt
  }
  return JSON.stringify({
    text: typeof o.text === 'string' ? o.text.slice(0, 40) : '',
    pos: WM_POSITIONS.includes(o.pos) ? o.pos : 'br',
    tile: !!o.tile,
    opacity: num(o.opacity, 5, 100, 35),
    size: num(o.size, 1, 12, 3),
    color: /^#[0-9a-fA-F]{6}$/.test(String(o.color)) ? String(o.color) : '#FAA07A',
    rotate: num(o.rotate, -90, 90, -30)
  })
}

function getSettings(includeSensitive = false): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const map: Record<string, string> = { ...DEFAULTS }
  for (const r of rows) {
    if (ALLOWED_KEYS.includes(r.key)) map[r.key] = r.value ?? DEFAULTS[r.key]
  }
  if (includeSensitive) {
    // 解密 SMTP 密码返回给管理员；解密失败（如主密钥变更）则置空，提示重新填写
    if (map.smtp_pass) {
      try {
        map.smtp_pass = decrypt(map.smtp_pass)
      } catch {
        map.smtp_pass = ''
      }
    }
  } else {
    for (const k of SENSITIVE_KEYS) delete map[k]
  }
  return map
}

// 公开接口：给前端登录页 / App 外壳读取站点信息
settingsRoutes.get('/', (c) => {
  return c.json({ settings: getSettings(false) })
})

// 以下仅限管理员
settingsRoutes.use('*', authGuard, requireAdmin)

// 管理员读取全部设置（含 SMTP，密码已解密供表单回填）
settingsRoutes.get('/all', (c) => {
  return c.json({ settings: getSettings(true) })
})

settingsRoutes.put('/', async (c) => {
  const body = await c.req.json<Record<string, any>>()
  const me = c.get('user') as JwtUser

  const updates: Record<string, string> = {}
  for (const [key, raw] of Object.entries(body)) {
    if (!ALLOWED_KEYS.includes(key)) continue
    if (key === 'smtp_pass') {
      // 空字符串表示清除密码；否则加密存储
      const v = typeof raw === 'string' ? raw : ''
      updates[key] = v ? encrypt(v) : ''
      continue
    }
    if (key === 'watermark') {
      updates[key] = sanitizeWatermark(raw)
      continue
    }
    updates[key] = typeof raw === 'string' ? raw.trim() : String(raw ?? '')
  }

  const tx = db.transaction((ups: Record<string, string>) => {
    for (const [key, value] of Object.entries(ups)) {
      db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
      ).run(key, value)
    }
  })
  tx(updates)

  console.log(`[settings] 管理员 ${me.username} 更新了系统设置`)
  return c.json({ ok: true, settings: getSettings(true) })
})

// 发送测试邮件（仅管理员）：验证 SMTP 配置是否可用
settingsRoutes.post('/test-smtp', async (c) => {
  const me = c.get('user') as JwtUser
  const body = await c.req.json<{ to?: string }>().catch(() => ({ to: '' }))
  const to = (body.to || '').trim()
  if (!to) return c.json({ ok: false, error: '请填写收件人邮箱' }, 400)
  const ok = await sendTestEmail(to)
  if (!ok) {
    return c.json({ ok: false, error: 'SMTP 未配置或发送失败，请检查系统设置中的 SMTP 配置' }, 400)
  }
  console.log(`[settings] 管理员 ${me.username} 向 ${to} 发送测试邮件成功`)
  return c.json({ ok: true })
})
