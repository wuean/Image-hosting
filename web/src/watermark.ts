import { ref } from 'vue'
import { api } from './api'
import { displayName } from './user'

// 水印配置是全局一套（存后端 settings 表，仅管理员可改）：
// 图床设置页负责编辑与预览，上传页只读取并应用到画布上。
// 两边共用这里的类型、归一化与绘制逻辑，保证预览与成品几何参数完全一致。

export type WatermarkConfig = {
  text: string
  pos: string
  tile: boolean
  opacity: number
  size: number
  color: string
  rotate: number
}

export const WM_DEFAULTS: WatermarkConfig = {
  text: '',
  pos: 'br',
  tile: false,
  opacity: 35,
  size: 3, // 字号 = 图片宽度的 N%
  color: '#FAA07A',
  rotate: -30
}

export const WM_POS = [
  { label: '左上', value: 'tl' },
  { label: '上中', value: 'tc' },
  { label: '右上', value: 'tr' },
  { label: '左中', value: 'ml' },
  { label: '居中', value: 'mc' },
  { label: '右中', value: 'mr' },
  { label: '左下', value: 'bl' },
  { label: '下中', value: 'bc' },
  { label: '右下', value: 'br' }
]

// 与后端 sanitizeWatermark 保持同一套约束，脏数据不落到画布上
export function normalizeWatermark(raw: any): WatermarkConfig {
  let o: any = raw
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw)
    } catch {
      o = {}
    }
  }
  if (!o || typeof o !== 'object') o = {}
  const num = (v: any, min: number, max: number, dflt: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt
  }
  return {
    text: typeof o.text === 'string' ? o.text.slice(0, 40) : '',
    pos: WM_POS.some((p) => p.value === o.pos) ? o.pos : WM_DEFAULTS.pos,
    tile: !!o.tile,
    opacity: num(o.opacity, 5, 100, WM_DEFAULTS.opacity),
    size: num(o.size, 1, 12, WM_DEFAULTS.size),
    color: /^#[0-9a-fA-F]{6}$/.test(String(o.color)) ? String(o.color) : WM_DEFAULTS.color,
    rotate: num(o.rotate, -90, 90, WM_DEFAULTS.rotate)
  }
}

export const watermarkConfig = ref<WatermarkConfig>({ ...WM_DEFAULTS })
let loaded = false

export async function loadWatermarkConfig(force = false): Promise<WatermarkConfig> {
  if (loaded && !force) return watermarkConfig.value
  try {
    const res = await api.get('/api/settings')
    watermarkConfig.value = normalizeWatermark(res?.settings?.watermark)
    loaded = true
  } catch {
    // 读取失败就沿用默认值，不阻断上传
  }
  return watermarkConfig.value
}

export async function saveWatermarkConfig(cfg: WatermarkConfig): Promise<void> {
  await api.put('/api/settings', { watermark: cfg })
  watermarkConfig.value = normalizeWatermark(cfg)
  loaded = true
}

/** 水印文案：留空则回退当前用户名 */
export function watermarkText(wm: WatermarkConfig): string {
  return wm.text.trim() || displayName()
}

/** 把本地文件解码成可绘制的图片（用完即释放 objectURL） */
export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片解码失败'))
    }
    img.src = url
  })
}

/** 九宫格 / 平铺水印，绘制几何参数以图片原始宽高为准 */
export function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, wm: WatermarkConfig, text: string) {
  if (!text) return
  const fontSize = Math.max(12, Math.round((w * wm.size) / 100))
  const rad = (wm.rotate * Math.PI) / 180
  ctx.save()
  ctx.font = `600 ${fontSize}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`
  ctx.fillStyle = wm.color
  ctx.globalAlpha = Math.min(1, Math.max(0.02, wm.opacity / 100))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (wm.tile) {
    // 平铺：以对角线为范围铺满，整体按设定角度旋转
    const stepX = ctx.measureText(text).width + fontSize * 5
    const stepY = fontSize * 5
    const diag = Math.ceil(Math.hypot(w, h))
    ctx.translate(w / 2, h / 2)
    ctx.rotate(rad)
    for (let y = -diag / 2; y <= diag / 2; y += stepY) {
      for (let x = -diag / 2; x <= diag / 2; x += stepX) ctx.fillText(text, x, y)
    }
    ctx.restore()
    return
  }

  // 九宫格：按旋转后的实际包围盒内缩，避免文字超出图片边缘
  const tw = ctx.measureText(text).width
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const halfW = (cos * tw + sin * fontSize) / 2
  const halfH = (sin * tw + cos * fontSize) / 2
  const margin = Math.round(fontSize * 0.8)
  const clamp = (v: number, half: number, total: number) => Math.min(Math.max(v, half), Math.max(half, total - half))
  const cx = clamp(wm.pos.includes('l') ? margin + halfW : wm.pos.includes('r') ? w - margin - halfW : w / 2, halfW, w)
  const cy = clamp(wm.pos[0] === 't' ? margin + halfH : wm.pos[0] === 'b' ? h - margin - halfH : h / 2, halfH, h)
  ctx.translate(cx, cy)
  ctx.rotate(rad)
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

/** 等比缩小地把「底图 + 水印」画到目标画布上，用于各处效果预览 */
export function paintPreview(
  target: HTMLCanvasElement,
  base: HTMLImageElement | HTMLCanvasElement,
  wm: WatermarkConfig,
  previewWidth = 320
) {
  const bw = base instanceof HTMLImageElement ? base.naturalWidth || 1 : base.width
  const bh = base instanceof HTMLImageElement ? base.naturalHeight || 1 : base.height
  const scale = Math.min(1, previewWidth / bw)
  target.width = Math.max(1, Math.round(bw * scale))
  target.height = Math.max(1, Math.round(bh * scale))
  const ctx = target.getContext('2d')
  if (!ctx) return
  ctx.scale(scale, scale)
  ctx.drawImage(base, 0, 0, bw, bh)
  drawWatermark(ctx, bw, bh, wm, watermarkText(wm))
}

/** 生成一张示例底图，让水印设置页在没选图时也能预览效果 */
export function demoImage(w = 1200, h = 800): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#d7e3f4')
  g.addColorStop(1, '#f3f6fb')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(120, 150, 190, 0.18)'
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    ctx.arc(w * (0.15 + i * 0.18), h * (0.25 + (i % 3) * 0.25), Math.min(w, h) * 0.12, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(80, 100, 130, 0.45)'
  ctx.font = `500 ${Math.round(w / 32)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`示例图片 ${w}×${h}`, w / 2, h / 2)
  return cv
}