<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NSelect, NTabs, NTabPane, NUpload, NUploadDragger, NButton, NSpace, NImage, NPagination, NEmpty, NSpin, NText, NCollapse, NCollapseItem, NSwitch, NSlider, NInputNumber, NInput, NCheckbox, useMessage, useDialog } from 'naive-ui'
import { api } from '../api'
import { loadWatermarkConfig, watermarkConfig, watermarkText, drawWatermark } from '../watermark'

const message = useMessage()
const dialog = useDialog()
const route = useRoute()
const router = useRouter()
const isManage = computed(() => route.path.includes('/manage'))

const buckets = ref<any[]>([])
const bucketId = ref<number | null>(null)
const bucketOptions = computed(() => buckets.value.map((b) => ({ label: `${b.name} (${b.type})`, value: b.id })))

const uploading = ref(false)
const uploaded = ref<any[]>([])

const records = ref<any[]>([])
const recTotal = ref(0)
const recPage = ref(1)
const recLoading = ref(false)

const browseItems = ref<any[]>([])
const browseCursor = ref<string | undefined>()
const browseLoading = ref(false)
const browsePrefix = ref('')

// 图片管理批量选择：存被选中的文件 key（按 key 维护，刷新后不丢）
const selectedKeys = ref<string[]>([])
function isSelected(key: string) {
  return selectedKeys.value.includes(key)
}
function toggleSelect(key: string, checked: boolean) {
  const i = selectedKeys.value.indexOf(key)
  if (checked && i < 0) selectedKeys.value.push(key)
  if (!checked && i >= 0) selectedKeys.value.splice(i, 1)
}
// 全选/取消全选：仅针对当前已加载的文件
function toggleSelectAll(checked: boolean) {
  const loaded = browseItems.value.map((b) => b.key)
  if (checked) {
    selectedKeys.value = Array.from(new Set([...selectedKeys.value, ...loaded]))
  } else {
    const set = new Set(loaded)
    selectedKeys.value = selectedKeys.value.filter((k) => !set.has(k))
  }
}
async function batchDelete() {
  if (!selectedKeys.value.length) return
  const keys = [...selectedKeys.value]
  dialog.warning({
    title: '批量删除文件',
    content: `将从云端永久删除 ${keys.length} 个文件，此操作不可恢复，确定吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.post('/api/images/delete', { bucketId: bucketId.value, keys })
        message.success(`已删除 ${keys.length} 个文件`)
        selectedKeys.value = []
        await reloadBrowse()
      } catch (e: any) {
        message.error(e.message)
      }
    }
  })
}

// 图片管理（直接浏览云端对象）：按上传时间（lastModified）降序排列，最新在最前
const sortedBrowse = computed(() => {
  if (!browseItems.value.length) return []
  return [...browseItems.value].sort((a: any, b: any) => {
    const at = a.lastModified || ''
    const bt = b.lastModified || ''
    return bt.localeCompare(at)
  })
})

const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i

async function loadBuckets() {
  const [list, def] = await Promise.all([
    api.get('/api/buckets'),
    api.get('/api/buckets/default').catch(() => ({ defaultBucketId: null }))
  ])
  buckets.value = list
  if (list.length && !bucketId.value) {
    const defId = def.defaultBucketId
    // 优先使用默认图床；若默认桶不在当前用户桶列表中则回退到第一个
    bucketId.value = defId && list.some((b: any) => b.id === defId) ? defId : list[0].id
    await refreshAll()
  }
}

async function refreshAll() {
  uploaded.value = []
  recPage.value = 1
  await Promise.all([loadRecords(), reloadBrowse()])
}

async function doUpload(files: File[]) {
  if (!bucketId.value) return message.warning('请先在「图床设置」页添加并选择一个桶')
  uploading.value = true
  warnedUnsupported = false
  try {
    const processed = await Promise.all(files.map(processImage))
    const fd = new FormData()
    for (const f of processed) fd.append('file', f)
    const res = await api.upload(`/api/images/upload?bucketId=${bucketId.value}`, fd)
    uploaded.value = [...res.files, ...uploaded.value]
    message.success(`成功上传 ${res.files.length} 个文件`)
    loadRecords()
  } catch (e: any) {
    message.error(`上传失败: ${e.message}`)
  } finally {
    uploading.value = false
  }
}

function customRequest({ file, onFinish, onError }: any) {
  doUpload([file.file]).then(onFinish).catch(onError)
}

function onPaste(e: ClipboardEvent) {
  const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'))
  if (files.length) doUpload(files)
}

async function loadRecords() {
  if (!bucketId.value) return
  recLoading.value = true
  try {
    const res = await api.get(`/api/images/records?bucketId=${bucketId.value}&page=${recPage.value}`)
    records.value = res.items
    recTotal.value = res.total
  } catch (e: any) {
    message.error(e.message)
  } finally {
    recLoading.value = false
  }
}

async function reloadBrowse() {
  browseItems.value = []
  browseCursor.value = undefined
  await loadBrowse()
}

async function loadBrowse() {
  if (!bucketId.value) return
  browseLoading.value = true
  try {
    const q = new URLSearchParams({ bucketId: String(bucketId.value) })
    if (browsePrefix.value) q.set('prefix', browsePrefix.value)
    if (browseCursor.value) q.set('cursor', browseCursor.value)
    const res = await api.get(`/api/images/browse?${q}`)
    browseItems.value = [...browseItems.value, ...res.items]
    browseCursor.value = res.nextCursor
  } catch (e: any) {
    message.error(`浏览失败: ${e.message}`)
  } finally {
    browseLoading.value = false
  }
}

async function copyText(text: string, label: string) {
  await navigator.clipboard.writeText(text)
  message.success(`${label}已复制`)
}

function htmlTag(url: string) {
  return `<img src="${url}" alt="" />`
}

function deleteKeys(keys: string[], after?: () => void) {
  dialog.warning({
    title: '删除文件',
    content: `将从云端永久删除 ${keys.length} 个文件，此操作不可恢复，确定吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.post('/api/images/delete', { bucketId: bucketId.value, keys })
        message.success('已删除')
        after?.()
      } catch (e: any) {
        message.error(e.message)
      }
    }
  })
}

function fmtSize(n: number) {
  if (n > 1048576) return (n / 1048576).toFixed(2) + ' MB'
  if (n > 1024) return (n / 1024).toFixed(1) + ' KB'
  return n + ' B'
}

// ===== 上传前处理：压缩 / 转格式 / 重命名 / 水印 =====
// 四组开关互相独立；前三组的参数记在 localStorage，水印开关每次默认关闭（配置存后端全局设置）
const OPTS_KEY = 'imgbed:upload-opts'

type UploadOpts = {
  compress: { enabled: boolean; quality: number; maxEdge: number }
  format: { enabled: boolean; target: string }
  rename: { enabled: boolean; mode: string; prefix: string }
}

const OPTS_DEFAULTS: UploadOpts = {
  compress: { enabled: true, quality: 80, maxEdge: 1920 },
  format: { enabled: true, target: 'webp' },
  rename: { enabled: true, mode: 'timestamp', prefix: '' }
}

const FORMATS = [
  { label: 'WebP（推荐，体积最小）', value: 'webp' },
  { label: 'JPEG（jpg，最通用）', value: 'jpeg' },
  { label: 'PNG（无损，体积偏大）', value: 'png' }
]
const FORMAT_MIME: Record<string, string> = { webp: 'image/webp', jpeg: 'image/jpeg', png: 'image/png' }
const MIME_EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }

const renameOptions = [
  { label: '时间戳名', value: 'timestamp' },
  { label: '随机名', value: 'random' },
  { label: '自定义前缀', value: 'prefix' }
]

function loadOpts(): UploadOpts {
  const pick = (v: any, min: number, max: number, dflt: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt
  }
  try {
    const raw = localStorage.getItem(OPTS_KEY)
    if (!raw) return JSON.parse(JSON.stringify(OPTS_DEFAULTS))
    const o = JSON.parse(raw)
    // 逐项合并：缺字段或脏数据回退默认，避免旧结构让页面崩掉
    return {
      compress: {
        enabled: o?.compress?.enabled !== false,
        quality: pick(o?.compress?.quality, 10, 100, OPTS_DEFAULTS.compress.quality),
        maxEdge: pick(o?.compress?.maxEdge, 0, 20000, OPTS_DEFAULTS.compress.maxEdge)
      },
      format: {
        enabled: o?.format?.enabled !== false,
        target: FORMATS.some((f) => f.value === o?.format?.target) ? o.format.target : OPTS_DEFAULTS.format.target
      },
      rename: {
        enabled: o?.rename?.enabled !== false,
        mode: renameOptions.some((m) => m.value === o?.rename?.mode) ? o.rename.mode : OPTS_DEFAULTS.rename.mode,
        prefix: typeof o?.rename?.prefix === 'string' ? o.rename.prefix.slice(0, 40) : ''
      }
    }
  } catch {
    return JSON.parse(JSON.stringify(OPTS_DEFAULTS))
  }
}

const initialOpts = loadOpts()
const compress = ref(initialOpts.compress)
const format = ref(initialOpts.format)
const rename = ref(initialOpts.rename)

// 水印开关属于「这一次上传要不要盖」，不记忆，默认关闭
const watermarkOn = ref(false)

// 参数变化即写回本地，刷新/重开浏览器后保持上次选择
watch(
  [compress, format, rename],
  () => {
    localStorage.setItem(OPTS_KEY, JSON.stringify({ compress: compress.value, format: format.value, rename: rename.value }))
  },
  { deep: true }
)

const RASTER_EXT = ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'avif']

// 压缩各项都不触发重新编码时（质量 100 且不限边长）就没有必要过一遍画布
const compressWillEncode = computed(() => {
  const c = compress.value
  return c.enabled && (c.quality < 100 || c.maxEdge > 0)
})

// 不做任何处理时也无需编码，直接原样上传
const encodeWanted = computed(() => compressWillEncode.value || format.value.enabled)

// PNG 是无损格式，toBlob 的质量参数对它无效
const qualityApplies = computed(() => !(format.value.enabled && format.value.target === 'png'))

// 面板标题右侧的实时汇总：一眼看出这次上传到底会做什么
const planSummary = computed(() => {
  const c = compress.value
  const parts: string[] = []
  if (c.enabled) {
    if (c.quality < 100) parts.push(`质量 ${c.quality}%`)
    if (c.maxEdge > 0) parts.push(`最长边 ${c.maxEdge}px`)
    if (!parts.length) parts.push('压缩')
  }
  if (format.value.enabled) parts.push(`转 ${format.value.target.toUpperCase()}`)
  if (watermarkOn.value) parts.push('加水印')
  parts.push(rename.value.enabled ? renameOptions.find((o) => o.value === rename.value.mode)?.label || '重命名' : '原名')
  return parts.join(' · ')
})

function gotoWatermarkSettings() {
  router.push({ path: '/buckets', query: { tab: 'watermark' } })
}

function loadImage(file: File): Promise<HTMLImageElement> {
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

function sanitizeBase(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'image'
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : 'png'
}

/** 能否交给 canvas 处理：svg / gif 不行（前者无法解码，后者会丢动画） */
function isRaster(ext: string) {
  return RASTER_EXT.includes(ext)
}

function timestampName(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${Math.random().toString(36).slice(2, 5)}`
}

/** 重命名开关关闭时保留原文件名，只做安全字符清理 */
function genBaseName(original: string): string {
  const orig = sanitizeBase(original.split('/').pop()?.split('.')[0] || 'image')
  if (!rename.value.enabled) return orig
  switch (rename.value.mode) {
    case 'random':
      return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    case 'prefix': {
      const p = sanitizeBase(rename.value.prefix || '')
      return p ? `${p}-${Math.random().toString(36).slice(2, 8)}` : timestampName()
    }
    case 'timestamp':
    default:
      return timestampName()
  }
}

function withNewName(file: File, finalName: string): File {
  return new File([file], finalName, { type: file.type })
}

/** 计算某个文件本次的实际动作，UI 汇总与 processImage 共用同一套判定 */
function makePlan(file: File) {
  const ext = extOf(file.name)
  const raster = isRaster(ext)
  const willEncode = raster && (encodeWanted.value || watermarkOn.value)
  return { ext, raster, willEncode, base: genBaseName(file.name) }
}

// 水印对不可解码的格式无效：每批上传只提示一次，不静默忽略
let warnedUnsupported = false

async function processImage(file: File): Promise<File> {
  const p = makePlan(file)
  if (!p.willEncode) {
    if (watermarkOn.value && !p.raster && !warnedUnsupported) {
      warnedUnsupported = true
      message.warning('水印仅支持 png / jpg / webp / bmp / avif，SVG 与 GIF 将按原样上传')
    }
    return withNewName(file, `${p.base}.${p.ext}`)
  }

  try {
    const img = await loadImage(file)
    let w = img.naturalWidth
    let h = img.naturalHeight
    if (compress.value.enabled && compress.value.maxEdge > 0) {
      const scale = Math.min(1, compress.value.maxEdge / Math.max(w, h))
      w = Math.max(1, Math.round(w * scale))
      h = Math.max(1, Math.round(h * scale))
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    const type = format.value.enabled ? FORMAT_MIME[format.value.target] : file.type || 'image/png'
    // JPEG 没有透明通道，透明区域会被填成黑色，先铺一层白底
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(img, 0, 0, w, h)
    if (watermarkOn.value) drawWatermark(ctx, w, h, watermarkConfig.value, watermarkText(watermarkConfig.value))

    // 压缩关掉时不传质量参数，交给编码器默认值，避免「没开压缩却被降质」
    const q = compress.value.enabled ? compress.value.quality / 100 : undefined
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q))
    if (!blob) throw new Error('编码失败')
    // 浏览器不支持目标格式时会静默回退（如个别环境不能编码 webp），按真实产出定后缀，避免名实不符
    const outExt = MIME_EXT[blob.type || type] || p.ext
    return new File([blob], `${p.base}.${outExt}`, { type: blob.type || type })
  } catch (e: any) {
    message.warning(`图片处理失败，已按原样上传：${e.message || e}`)
    return withNewName(file, `${p.base}.${p.ext}`)
  }
}

onMounted(() => {
  loadBuckets()
  loadWatermarkConfig()
})
</script>

<template>
  <div @paste="onPaste">
    <n-card :bordered="false">
      <n-space align="center">
        <n-text>当前存储桶：</n-text>
        <n-select v-model:value="bucketId" :options="bucketOptions" style="width: 260px" placeholder="请选择存储桶" @update:value="refreshAll" />
        <n-text v-if="!buckets.length" depth="3">还没有配置存储桶，请先到「存储桶」页添加</n-text>
      </n-space>
    </n-card>

    <n-tabs v-if="!isManage" type="line" default-value="upload" style="margin-top: 8px">
      <n-tab-pane name="upload" tab="上传图片">
        <n-collapse :default-expanded-names="['proc']" style="margin-bottom: 12px">
          <n-collapse-item name="proc">
            <template #header>上传前处理：压缩 · 转格式 · 重命名 · 水印</template>
            <template #header-extra>
              <n-text depth="3" style="font-size: 12px">{{ planSummary }}</n-text>
            </template>
            <n-space vertical :size="14">
              <!-- 1. 图片压缩 -->
              <div>
                <n-space align="center">
                  <n-switch v-model:value="compress.enabled" />
                  <n-text>图片压缩</n-text>
                </n-space>
                <template v-if="compress.enabled">
                  <n-space align="center" :wrap="false" style="margin-top: 10px">
                    <n-text style="width: 72px">压缩质量</n-text>
                    <n-slider v-model:value="compress.quality" :min="10" :max="100" :disabled="!qualityApplies" style="width: 240px" />
                    <n-text style="width: 40px">{{ compress.quality }}%</n-text>
                    <n-text v-if="!qualityApplies" depth="3" style="font-size: 12px">PNG 为无损格式，质量参数不生效</n-text>
                  </n-space>
                  <n-space align="center" :wrap="false" style="margin-top: 10px">
                    <n-text style="width: 72px">最大边长</n-text>
                    <n-input-number v-model:value="compress.maxEdge" :min="0" :step="100" style="width: 180px" />
                    <n-text depth="3" style="font-size: 12px">px，等比缩放；0 = 不限制</n-text>
                  </n-space>
                </template>
              </div>

              <!-- 2. 自动转格式 -->
              <div class="proc-group">
                <n-space align="center" :wrap="false">
                  <n-switch v-model:value="format.enabled" />
                  <n-text>自动转格式</n-text>
                  <n-select v-model:value="format.target" :options="FORMATS" :disabled="!format.enabled" style="width: 210px" />
                </n-space>
                <n-text depth="3" style="font-size: 12px; display: block; margin: 6px 0 0 8px">
                  仅对 png / jpg / webp / bmp / avif 生效，SVG 与 GIF 保持原样
                </n-text>
              </div>

              <!-- 3. 重命名 -->
              <div class="proc-group">
                <n-space align="center" :wrap="false">
                  <n-switch v-model:value="rename.enabled" />
                  <n-text>重命名</n-text>
                  <n-select v-model:value="rename.mode" :options="renameOptions" :disabled="!rename.enabled" style="width: 150px" />
                  <n-input
                    v-if="rename.enabled && rename.mode === 'prefix'"
                    v-model:value="rename.prefix"
                    placeholder="前缀文字"
                    style="width: 150px"
                  />
                </n-space>
              </div>

              <!-- 4. 水印（配置在「图床设置 → 水印设置」里统一维护） -->
              <div class="proc-group">
                <n-space align="center" :wrap="false">
                  <n-switch v-model:value="watermarkOn" />
                  <n-text>添加水印</n-text>
                  <n-button text type="primary" @click="gotoWatermarkSettings">水印设置</n-button>
                  <n-text depth="3" style="font-size: 12px">
                    {{ watermarkOn ? `当前水印：${watermarkText(watermarkConfig)}` : '点击左侧链接可修改水印内容与位置' }}
                  </n-text>
                </n-space>
              </div>
            </n-space>
          </n-collapse-item>
        </n-collapse>
        <n-upload multiple :custom-request="customRequest" :show-file-list="false" accept="image/*">
          <n-upload-dragger>
            <div style="padding: 24px">
              <div style="font-size: 15px; margin-bottom: 8px">点击选择、拖拽图片到此处，或直接 Ctrl+V 粘贴截图</div>
              <n-text depth="3" style="font-size: 12px">支持多文件批量上传，自动按 年/月 目录存放</n-text>
            </div>
          </n-upload-dragger>
        </n-upload>
        <n-spin :show="uploading" style="margin-top: 16px">
          <div v-if="uploaded.length" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px">
            <n-card v-for="f in uploaded" :key="f.key" size="small">
              <n-space align="center" :wrap="false">
                <n-image :src="f.url" width="64" height="64" object-fit="cover" style="border-radius: 6px; flex-shrink: 0" />
                <div style="min-width: 0">
                  <div style="font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ f.name }}</div>
                  <n-text depth="3" style="font-size: 12px">{{ fmtSize(f.size) }}</n-text>
                  <n-space size="small" style="margin-top: 6px">
                    <n-button size="tiny" @click="copyText(f.url, 'URL')">URL</n-button>
                    <n-button size="tiny" @click="copyText(f.markdown, 'Markdown')">MD</n-button>
                    <n-button size="tiny" @click="copyText(htmlTag(f.url), 'HTML')">HTML</n-button>
                  </n-space>
                </div>
              </n-space>
            </n-card>
          </div>
        </n-spin>
      </n-tab-pane>

      <n-tab-pane name="records" tab="上传记录">
        <n-spin :show="recLoading">
          <n-empty v-if="!records.length" description="暂无上传记录" style="padding: 48px 0" />
          <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px">
            <n-card v-for="r in records" :key="r.id" size="small">
              <n-image :src="r.url" width="100%" height="120" object-fit="cover" style="border-radius: 6px; width: 100%" />
              <div style="font-size: 12px; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap" :title="r.key">{{ r.name || r.key }}</div>
              <n-text depth="3" style="font-size: 11px">{{ fmtSize(r.size) }} · {{ r.createdAt?.slice(0, 16) }}</n-text>
              <n-space size="small" style="margin-top: 6px">
                <n-button size="tiny" @click="copyText(r.url, 'URL')">URL</n-button>
                <n-button size="tiny" @click="copyText(`![](${r.url})`, 'Markdown')">MD</n-button>
                <n-button size="tiny" @click="copyText(htmlTag(r.url), 'HTML')">HTML</n-button>
                <n-button size="tiny" type="error" quaternary @click="deleteKeys([r.key], loadRecords)">删除</n-button>
              </n-space>
            </n-card>
          </div>
          <n-pagination
            v-if="recTotal > 30"
            v-model:page="recPage"
            :item-count="recTotal"
            :page-size="30"
            style="margin-top: 16px; justify-content: center"
            @update:page="loadRecords"
          />
        </n-spin>
      </n-tab-pane>

    </n-tabs>

    <div v-else style="margin-top: 8px">
        <n-space align="center" style="margin-bottom: 12px">
          <n-button size="small" @click="reloadBrowse">刷新</n-button>
          <n-checkbox
            :checked="browseItems.length > 0 && selectedKeys.length === browseItems.length"
            :indeterminate="selectedKeys.length > 0 && selectedKeys.length < browseItems.length"
            @update:checked="toggleSelectAll"
          >全选当前</n-checkbox>
          <n-text v-if="selectedKeys.length" depth="3" style="font-size: 12px">已选 {{ selectedKeys.length }} 项</n-text>
          <n-button size="small" type="error" :disabled="!selectedKeys.length" @click="batchDelete">批量删除</n-button>
          <n-text depth="3" style="font-size: 12px; line-height: 28px; margin-left: auto">直接列出云端桶内对象（含非本站上传的文件）</n-text>
        </n-space>
        <n-spin :show="browseLoading">
          <n-empty v-if="!browseItems.length && !browseLoading" description="桶内暂无文件" style="padding: 48px 0" />
          <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px">
            <n-card v-for="it in sortedBrowse" :key="it.key" size="small">
              <div style="position: relative" :style="{ outline: isSelected(it.key) ? '2px solid #2080f0' : 'none', outlineOffset: '-2px', borderRadius: '6px' }">
                <n-checkbox
                  :checked="isSelected(it.key)"
                  @update:checked="(v: boolean) => toggleSelect(it.key, v)"
                  style="position: absolute; top: 6px; left: 6px; z-index: 2; background: rgba(255,255,255,0.85); border-radius: 4px"
                />
                <n-image v-if="IMG_EXT.test(it.key)" :src="it.url" width="100%" height="120" object-fit="cover" style="border-radius: 6px; width: 100%" />
                <div v-else style="height: 120px; display: flex; align-items: center; justify-content: center; background: #f5f6fa; border-radius: 6px; color: #999">非图片文件</div>
              </div>
              <div style="font-size: 12px; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap" :title="it.key">{{ it.key }}</div>
              <n-text depth="3" style="font-size: 11px">{{ fmtSize(it.size) }} · {{ it.lastModified?.slice(0, 16) || '未知时间' }}</n-text>
              <n-space size="small" style="margin-top: 6px">
                <n-button size="tiny" @click="copyText(it.url, 'URL')">URL</n-button>
                <n-button size="tiny" @click="copyText(`![](${it.url})`, 'Markdown')">MD</n-button>
                <n-button size="tiny" @click="copyText(htmlTag(it.url), 'HTML')">HTML</n-button>
                <n-button size="tiny" type="error" quaternary @click="deleteKeys([it.key], reloadBrowse)">删除</n-button>
              </n-space>
            </n-card>
          </div>
          <div v-if="browseCursor" style="text-align: center; margin-top: 16px">
            <n-button @click="loadBrowse">加载更多</n-button>
          </div>
        </n-spin>
    </div>
  </div>
</template>

<style scoped>
/* 三组处理项之间的分隔线，避免选项糊在一起 */
.proc-group {
  border-top: 1px dashed var(--border-soft, #efeff5);
  padding-top: 12px;
}
</style>
