import type { Context, Next } from 'hono'
import { sign, verify } from 'hono/jwt'
import { db } from '../db.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me'

export interface JwtUser {
  uid: number
  username: string
  role: string
  [key: string]: unknown
}

export async function signToken(user: { id: number; username: string; role: string }) {
  return sign(
    {
      uid: user.id,
      username: user.username,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 7 * 86400
    },
    JWT_SECRET
  )
}

export async function authGuard(c: Context, next: Next) {
  const header = c.req.header('Authorization')
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: '未登录' }, 401)
  }
  let payload: JwtUser
  try {
    payload = (await verify(header.slice(7), JWT_SECRET, 'HS256')) as unknown as JwtUser
  } catch {
    return c.json({ error: '登录已过期，请重新登录' }, 401)
  }
  // token 自带的状态不可信：每请求回查一次账号，使「停用 / 删除 / 改角色」立即生效，
  // 而不必等 token 自然过期（否则停用要 7 天后才真正生效）。
  const row = db.prepare('SELECT username, role, is_active FROM users WHERE id = ?').get(payload.uid) as
    | { username: string; role: string; is_active: number }
    | undefined
  if (!row) return c.json({ error: '账号不存在，请重新登录' }, 401)
  if (!row.is_active) return c.json({ error: '账号已被停用' }, 401)
  c.set('user', { ...payload, username: row.username, role: row.role })
  await next()
}

/** 必须在 authGuard 之后使用：校验当前用户为管理员 */
export async function requireAdmin(c: Context, next: Next) {
  const user = c.get('user') as JwtUser | undefined
  if (!user || user.role !== 'admin') {
    return c.json({ error: '需要管理员权限' }, 403)
  }
  await next()
}
