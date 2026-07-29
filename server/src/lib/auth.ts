import type { Context, Next } from 'hono'
import { sign, verify } from 'hono/jwt'

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
  try {
    const payload = (await verify(header.slice(7), JWT_SECRET, 'HS256')) as unknown as JwtUser
    c.set('user', payload)
  } catch {
    return c.json({ error: '登录已过期，请重新登录' }, 401)
  }
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
