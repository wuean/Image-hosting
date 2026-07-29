import { Hono } from 'hono'
import crypto from 'node:crypto'
import { db } from '../db.js'
import { verifyPassword, hashPassword } from '../lib/crypto.js'
import { signToken, authGuard, requireAdmin, type JwtUser } from '../lib/auth.js'
import { sendActivationEmail } from '../lib/mail.js'

export const authRoutes = new Hono()

authRoutes.post('/login', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>()
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any
  if (!user || !verifyPassword(password, user.password_hash)) {
    return c.json({ error: '用户名或密码错误' }, 401)
  }
  if (!user.is_active) {
    return c.json({ error: '账号未激活，请先激活注册邮箱后再登录', code: 'INACTIVE' }, 401)
  }
  const token = await signToken(user)
  return c.json({ token, user: { id: user.id, username: user.username, role: user.role } })
})

authRoutes.post('/register', async (c) => {
  if (process.env.ALLOW_REGISTER === 'false') {
    return c.json({ error: '当前未开放注册' }, 403)
  }
  const { username, email, password } = await c.req.json<{ username: string; email: string; password: string }>()
  if (!username || !/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    return c.json({ error: '用户名需为 3-32 位字母/数字/下划线' }, 400)
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json({ error: '请填写有效的邮箱' }, 400)
  }
  if (!password || password.length < 6) {
    return c.json({ error: '密码至少 6 位' }, 400)
  }
  const uname = username.trim()
  const mail = email.trim().toLowerCase()
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(uname)) {
    return c.json({ error: '用户名已被占用' }, 409)
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(mail)) {
    return c.json({ error: '该邮箱已注册' }, 409)
  }
  const activation_token = crypto.randomBytes(32).toString('hex')
  db.prepare(
    'INSERT INTO users (username, email, password_hash, role, is_active, activation_token) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(uname, mail, hashPassword(password), 'user', activation_token)
  await sendActivationEmail(mail, uname, activation_token)
  return c.json({ ok: true, message: '注册成功，请查收激活邮件后登录' })
})

authRoutes.get('/activate', async (c) => {
  const token = c.req.query('token')
  if (!token) return c.json({ error: '缺少激活令牌' }, 400)
  const user = db.prepare('SELECT * FROM users WHERE activation_token = ?').get(token) as any
  if (!user) return c.json({ error: '激活链接无效或已使用' }, 400)
  db.prepare("UPDATE users SET is_active = 1, activation_token = NULL, activated_at = datetime('now') WHERE id = ?").run(
    user.id
  )
  return c.json({ ok: true, message: '账号已激活，现在可以登录了' })
})

authRoutes.post('/change-password', authGuard, async (c) => {
  const me = c.get('user') as JwtUser
  const { oldPassword, newPassword } = await c.req.json()
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(me.uid) as any
  if (!user || !verifyPassword(oldPassword, user.password_hash)) {
    return c.json({ error: '原密码错误' }, 400)
  }
  if (!newPassword || newPassword.length < 6) {
    return c.json({ error: '新密码至少 6 位' }, 400)
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), me.uid)
  return c.json({ ok: true })
})

// ---- 管理员用户管理 ----
authRoutes.use('/admin/*', authGuard, requireAdmin)
authRoutes.get('/admin/users', (c) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.email, u.role, u.is_active, u.created_at, u.activated_at,
              (SELECT COUNT(*) FROM buckets b WHERE b.owner_id = u.id) AS bucket_count
       FROM users u ORDER BY u.id`
    )
    .all() as any[]
  return c.json({ users: rows })
})

authRoutes.post('/admin/users/:id/activate', (c) => {
  const id = Number(c.req.param('id'))
  db.prepare("UPDATE users SET is_active = 1, activation_token = NULL, activated_at = datetime('now') WHERE id = ?").run(id)
  return c.json({ ok: true })
})

authRoutes.post('/admin/users/:id/deactivate', (c) => {
  const id = Number(c.req.param('id'))
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id)
  return c.json({ ok: true })
})

authRoutes.put('/admin/users/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const { username, email } = await c.req.json<{ username?: string; email?: string }>()
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any
  if (!current) return c.json({ error: '用户不存在' }, 404)

  const uname = (username || current.username).trim()
  const mail = (email || current.email || '').trim().toLowerCase()

  if (!/^[a-zA-Z0-9_]{3,32}$/.test(uname)) {
    return c.json({ error: '用户名需为 3-32 位字母/数字/下划线' }, 400)
  }
  if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
    return c.json({ error: '邮箱格式不正确' }, 400)
  }

  const dupName = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(uname, id)
  if (dupName) return c.json({ error: '用户名已被占用' }, 409)
  if (mail) {
    const dupEmail = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(mail, id)
    if (dupEmail) return c.json({ error: '该邮箱已被其他账号使用' }, 409)
  }

  db.prepare('UPDATE users SET username = ?, email = ? WHERE id = ?').run(uname, mail || null, id)
  return c.json({ ok: true })
})

authRoutes.post('/admin/users/:id/resend-activation', async (c) => {
  const id = Number(c.req.param('id'))
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any
  if (!user) return c.json({ error: '用户不存在' }, 404)
  if (user.is_active) return c.json({ error: '该账号已激活，无需重发' }, 400)

  const activation_token = crypto.randomBytes(32).toString('hex')
  db.prepare('UPDATE users SET activation_token = ? WHERE id = ?').run(activation_token, id)
  await sendActivationEmail(user.email, user.username, activation_token)
  return c.json({ ok: true, message: '激活邮件已重新发送' })
})

authRoutes.delete('/admin/users/:id', (c) => {
  const me = c.get('user') as JwtUser
  const id = Number(c.req.param('id'))
  if (id === me.uid) return c.json({ error: '不能删除当前登录的账号' }, 400)
  db.prepare('DELETE FROM images WHERE bucket_id IN (SELECT id FROM buckets WHERE owner_id = ?)').run(id)
  db.prepare('DELETE FROM buckets WHERE owner_id = ?').run(id)
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  return c.json({ ok: true })
})
