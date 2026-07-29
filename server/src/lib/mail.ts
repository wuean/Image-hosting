// 邮件发送：SMTP 配置优先读取 settings 表（管理员可在系统设置页配置），
// 未配置时回退到 server/.env 的环境变量。两者都未配置则把内容打到控制台日志。
// 采用动态 import nodemailer，即使依赖缺失也不会让服务崩溃。

import { db } from '../db.js'
import { decrypt } from './crypto.js'

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'

interface SmtpConfig {
  host: string
  port: number
  user?: string
  pass?: string
  from: string
  secure: boolean
}

function activationLink(token: string): string {
  const base = PUBLIC_BASE_URL.replace(/\/+$/, '')
  return `${base}/activate?token=${encodeURIComponent(token)}`
}

// 从环境变量读取（兼容旧部署）
function envSmtpConfig(): SmtpConfig | null {
  if (!process.env.SMTP_HOST) return null
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from: process.env.MAIL_FROM || process.env.SMTP_USER || '',
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE !== 'false' : true
  }
}

// 从 settings 表读取（管理员后台配置，优先）
function dbSmtpConfig(): SmtpConfig | null {
  const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_secure']
  const rows = db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`)
    .all(...keys) as { key: string; value: string }[]
  const m: Record<string, string> = {}
  for (const r of rows) m[r.key] = r.value
  if (!m.smtp_host) return null
  let pass = m.smtp_pass
  if (pass) {
    try {
      pass = decrypt(pass)
    } catch {
      pass = ''
    }
  }
  return {
    host: m.smtp_host,
    port: Number(m.smtp_port || 465),
    user: m.smtp_user || undefined,
    pass: pass || undefined,
    from: m.smtp_from || m.smtp_user || '',
    secure: m.smtp_secure ? m.smtp_secure !== 'false' : true
  }
}

// 数据库配置优先，未配置则回退 .env
function resolveSmtpConfig(): SmtpConfig | null {
  return dbSmtpConfig() || envSmtpConfig()
}

async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const cfg = resolveSmtpConfig()
  if (!cfg || !cfg.host) {
    console.log('\n[mail] 未配置 SMTP（数据库与 .env 均无 smtp_host），内容回退到控制台：')
    console.log(`       收件人: ${to}`)
    console.log(`       主题:   ${subject}`)
    return false
  }
  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined
    })
    await transporter.sendMail({
      from: cfg.from || cfg.user,
      to,
      subject,
      text
    })
    console.log(`[mail] 已向 ${to} 发送邮件（主题：${subject}）`)
    return true
  } catch (e: any) {
    console.warn(`[mail] SMTP 发送失败：`, e?.message || e)
    return false
  }
}

export async function sendActivationEmail(email: string, username: string, token: string): Promise<void> {
  const link = activationLink(token)
  const subject = '请激活你的图床管理账号'
  const text = `你好 ${username}：\n\n感谢注册图床管理系统。请点击下面的链接激活账号，激活后才能登录使用：\n\n${link}\n\n如果这不是你本人的操作，请忽略此邮件。`
  const ok = await sendMail(email, subject, text)
  if (!ok) {
    console.log(`       激活链接: ${link}\n`)
  }
}

export async function sendTestEmail(email: string): Promise<boolean> {
  const subject = '图床管理系统 - SMTP 测试邮件'
  const text = `这是一封来自「图床管理系统」的 SMTP 测试邮件。\n\n如果你收到这封邮件，说明 SMTP 配置已生效。\n发送时间：${new Date().toLocaleString('zh-CN')}\n`
  return sendMail(email, subject, text)
}
