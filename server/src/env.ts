// 轻量 .env 加载器：启动时读取 server/.env（若存在），不覆盖已有环境变量
// 必须在所有业务模块之前 import（index.ts 首行），否则 crypto.ts 等读不到
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const envPath = fileURLToPath(new URL('../.env', import.meta.url))

try {
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      // 去掉行尾注释（仅当值未被引号包裹时）
      if (!value.startsWith('"') && !value.startsWith("'")) {
        const hash = value.indexOf(' #')
        if (hash >= 0) value = value.slice(0, hash).trim()
      } else {
        value = value.slice(1, value.endsWith(value[0]) ? -1 : undefined)
      }
      if (!(key in process.env)) process.env[key] = value
    }
    console.log(`[imgbed] 已加载环境配置: ${envPath}`)
  }
} catch (e) {
  console.warn('[imgbed] .env 加载失败（忽略）:', (e as Error).message)
}
