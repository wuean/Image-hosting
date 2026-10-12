import type { Context } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'

/** 取客户端真实 IP：优先反向代理头，回落到直连地址 */
export function clientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const xri = c.req.header('x-real-ip')
  if (xri) return xri.trim()
  try {
    return getConnInfo(c).remote.address || 'unknown'
  } catch {
    return 'unknown'
  }
}