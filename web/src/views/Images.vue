<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { NCard, NSelect, NTabs, NTabPane, NUpload, NUploadDragger, NButton, NSpace, NImage, NPagination, NEmpty, NSpin, NText, NCollapse, NCollapseItem, NSwitch, NSlider, NInputNumber, NInput, useMessage, useDialog } from 'naive-ui'
import { api } from '../api'

const message = useMessage()
const dialog = useDialog()
const route = useRoute()
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

const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i

async function loadBuckets() {
  buckets.value = await api.get('/api/buckets')
  if (buckets.value.length && !bucketId.value) {
    bucketId.value = buckets.value[0].id
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

// ===== 上传前处理：压缩 / 转 WebP / 重命名 =====
const settings = ref({
  enabled: true,
  toWebp: true,
  quality: 80,
  maxEdge: 1920, // 0 = 不限制
  renameMode: 'random', // original | random | timestamp | prefix
  prefix: ''
})

const renameOptions = [
  { label: '原文件名', key: 'original' },
  { label: '随机名', key: 'random' },
  { label: '时间戳名', key: 'timestamp' },
  { label: '自定义前缀', key: 'prefix' }
]

const RASTER_EXT = ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'avif']

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

function genBaseName(original: string): string {
  const orig = sanitizeBase(original.split('/').pop()?.split('.')[0] || 'image')
  switch (settings.value.renameMode) {
    case 'original':
      return orig
    case 'random':
      return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    case 'timestamp':
      return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    case 'prefix':
      return settings.value.prefix
        ? sanitizeBase(settings.value.prefix) + '-' + Math.random().toString(36).slice(2, 8)
        : orig
    default:
      return orig
  }
}

function withNewName(file: File, finalName: string): File {
  return new File([file], finalName, { type: file.type })
}

async function processImage(file: File): Promise<File> {
  const ext0 = (file.name.split('.').pop() || 'png').toLowerCase()
  const isRaster = RASTER_EXT.includes(ext0)
  const needEncode =
    settings.value.enabled && isRaster && (settings.value.toWebp || settings.value.quality < 100 || settings.value.maxEdge > 0)
  const targetExt = settings.value.enabled && settings.value.toWebp ? 'webp' : ext0
  const base = settings.value.enabled ? genBaseName(file.name) : sanitizeBase(file.name.split('/').pop()?.split('.')[0] || 'image')
  const finalName = `${base}.${targetExt}`

  if (!needEncode) return withNewName(file, finalName)

  try {
    const img = await loadImage(file)
    let w = img.naturalWidth
    let h = img.naturalHeight
    if (settings.value.maxEdge > 0) {
      const scale = Math.min(1, settings.value.maxEdge / Math.max(w, h))
      w = Math.max(1, Math.round(w * scale))
      h = Math.max(1, Math.round(h * scale))
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.drawImage(img, 0, 0, w, h)
    const type = settings.value.toWebp ? 'image/webp' : file.type || 'image/png'
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, settings.value.quality / 100))
    if (!blob) throw new Error('编码失败')
    return new File([blob], finalName, { type })
  } catch (e: any) {
    message.warning(`图片处理失败，已按原样上传：${e.message || e}`)
    return withNewName(file, finalName)
  }
}

onMounted(loadBuckets)
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
          <n-collapse-item title="上传前处理：压缩 · 转 WebP · 重命名" name="proc">
            <n-space vertical :size="10">
              <n-space align="center">
                <n-switch v-model:value="settings.enabled" />
                <n-text>启用处理（关闭则原样上传）</n-text>
              </n-space>
              <template v-if="settings.enabled">
                <n-space align="center">
                  <n-switch v-model:value="settings.toWebp" />
                  <n-text>自动转为 WebP 格式（体积更小）</n-text>
                </n-space>
                <n-space align="center" :wrap="false">
                  <n-text style="width: 72px">压缩质量</n-text>
                  <n-slider v-model:value="settings.quality" :min="10" :max="100" style="width: 240px" />
                  <n-text style="width: 40px">{{ settings.quality }}%</n-text>
                </n-space>
                <n-space align="center" :wrap="false">
                  <n-text style="width: 72px">最大边长</n-text>
                  <n-input-number v-model:value="settings.maxEdge" :min="0" :step="100" style="width: 180px" />
                  <n-text depth="3" style="font-size: 12px">px，等比缩放；0 = 不限制</n-text>
                </n-space>
                <n-space align="center" :wrap="false">
                  <n-text style="width: 72px">重命名</n-text>
                  <n-select v-model:value="settings.renameMode" :options="renameOptions" style="width: 150px" />
                  <n-input
                    v-if="settings.renameMode === 'prefix'"
                    v-model:value="settings.prefix"
                    placeholder="前缀文字"
                    style="width: 150px"
                  />
                </n-space>
              </template>
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
        <n-space style="margin-bottom: 12px">
          <n-button size="small" @click="reloadBrowse">刷新</n-button>
          <n-text depth="3" style="font-size: 12px; line-height: 28px">直接列出云端桶内对象（含非本站上传的文件）</n-text>
        </n-space>
        <n-spin :show="browseLoading">
          <n-empty v-if="!browseItems.length && !browseLoading" description="桶内暂无文件" style="padding: 48px 0" />
          <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px">
            <n-card v-for="it in browseItems" :key="it.key" size="small">
              <n-image v-if="IMG_EXT.test(it.key)" :src="it.url" width="100%" height="120" object-fit="cover" style="border-radius: 6px; width: 100%" />
              <div v-else style="height: 120px; display: flex; align-items: center; justify-content: center; background: #f5f6fa; border-radius: 6px; color: #999">非图片文件</div>
              <div style="font-size: 12px; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap" :title="it.key">{{ it.key }}</div>
              <n-text depth="3" style="font-size: 11px">{{ fmtSize(it.size) }}</n-text>
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
