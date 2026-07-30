import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword } from './lib/crypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../data')
fs.mkdirSync(dataDir, { recursive: true })

export const db = new Database(path.join(dataDir, 'imgbed.db'))
db.pragma('journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS buckets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config_enc TEXT NOT NULL,
  key_prefix TEXT NOT NULL DEFAULT '',
  owner_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  original_name TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  mime TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_images_bucket ON images(bucket_id, created_at DESC);
`)

// ---- 增量迁移：多用户 + 邮箱激活所需字段（兼容已存在的库）----
const userCols = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((r) => r.name)
const addCol = (name: string, def: string) => {
  if (!userCols.includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`)
}
addCol('email', 'TEXT')
addCol('is_active', 'INTEGER NOT NULL DEFAULT 0')
addCol('activation_token', 'TEXT')
addCol('activated_at', 'TEXT')
addCol('default_bucket_id', 'INTEGER')
addCol('nickname', 'TEXT')
// email 唯一（SQLite 唯一索引允许多个 NULL）
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)')

const userCount = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c
if (userCount === 0) {
  const initPassword = process.env.ADMIN_PASSWORD || 'admin123'
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(
    'admin',
    hashPassword(initPassword),
    'admin'
  )
  console.log(`[init] 已创建管理员账号 admin / ${initPassword}，请登录后尽快修改密码`)
}

// 确保任何已存在的 admin 账号处于激活状态（覆盖首次种子与管理员手动建号）
db.prepare("UPDATE users SET is_active = 1 WHERE role = 'admin' AND is_active = 0").run()

// ---- 系统设置表 ----
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)
const settingKeys = (db.prepare('SELECT key FROM settings').all() as { key: string }[]).map((r) => r.key)
const seedSetting = (key: string, value: string) => {
  if (!settingKeys.includes(key)) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value)
  }
}
seedSetting('site_name', '图床管理')
seedSetting('logo_text', '图')
seedSetting('logo_url', '')
seedSetting('login_bg_url', '')
// SMTP（管理员可在系统设置页配置；密码以加密形式存储）
seedSetting('smtp_host', '')
seedSetting('smtp_port', '465')
seedSetting('smtp_user', '')
seedSetting('smtp_pass', '')
seedSetting('smtp_from', '')
seedSetting('smtp_secure', 'true')
