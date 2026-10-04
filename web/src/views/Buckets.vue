<script setup lang="ts">
import { ref, onMounted, computed, watch, h } from 'vue'
import { useRoute } from 'vue-router'
import { NCard, NButton, NDataTable, NModal, NForm, NFormItem, NInput, NSelect, NSwitch, NTag, NSpace, NAlert, NTabs, NTabPane, NSlider, NCheckbox, NColorPicker, NText, NSpin, useMessage, useDialog } from 'naive-ui'
import { api } from '../api'
import { currentUser, displayName } from '../user'
import {
  WM_DEFAULTS,
  WM_POS,
  loadWatermarkConfig,
  saveWatermarkConfig,
  paintPreview,
  demoImage,
  loadImageFile,
  type WatermarkConfig
} from '../watermark'

const message = useMessage()
const dialog = useDialog()
const route = useRoute()
const buckets = ref<any[]>([])
const defaultBucketId = ref<number | null>(null)
const loading = ref(false)
const showModal = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)

const typeOptions = [
  { label: 'Cloudflare R2', value: 'r2' },
  { label: 'AWS S3 / MinIO / 其他S3兼容', value: 's3' },
  { label: '阿里云 OSS', value: 'aliyun-oss' },
  { label: '腾讯云 COS', value: 'tencent-cos' },
  { label: '七牛云 Kodo', value: 'qiniu' },
  { label: '又拍云 USS', value: 'upyun' }
]

type FieldItem = {
  key: string
  label: string
  placeholder?: string
  secret?: boolean
  type?: 'input' | 'select'
  options?: { label: string; value: string }[]
}
const fieldDefs: Record<string, FieldItem[]> = {
  r2: [
    { key: 'endpoint', label: 'Endpoint', placeholder: 'https://<账户ID>.r2.cloudflarestorage.com' },
    { key: 'bucket', label: '桶名称' },
    { key: 'accessKeyId', label: 'Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key', secret: true },
    { key: 'customDomain', label: '访问域名', placeholder: '如 https://img.example.com 或 xxx.r2.dev' }
  ],
  s3: [
    { key: 'endpoint', label: 'Endpoint（可选）', placeholder: 'AWS 官方可留空；MinIO 填地址' },
    { key: 'region', label: 'Region', placeholder: '如 us-east-1' },
    { key: 'bucket', label: '桶名称' },
    { key: 'accessKeyId', label: 'Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key', secret: true },
    { key: 'customDomain', label: '访问域名' }
  ],
  'aliyun-oss': [
    { key: 'region', label: 'Region', placeholder: '如 cn-hangzhou' },
    { key: 'bucket', label: 'Bucket 名称' },
    { key: 'accessKeyId', label: 'AccessKeyId' },
    { key: 'secretAccessKey', label: 'AccessKeySecret', secret: true },
    { key: 'customDomain', label: '访问域名', placeholder: '如 https://img.example.com（OSS 绑定的自定义域名/CDN）' }
  ],
  'tencent-cos': [
    { key: 'region', label: 'Region', placeholder: '如 ap-guangzhou' },
    { key: 'bucket', label: 'Bucket 名称' },
    { key: 'accessKeyId', label: 'SecretId' },
    { key: 'secretAccessKey', label: 'SecretKey', secret: true },
    { key: 'customDomain', label: '访问域名', placeholder: '如 https://img.example.com（COS 绑定的自定义域名/CDN）' }
  ],
  qiniu: [
    {
      key: 'zone',
      label: '存储区域',
      type: 'select',
      placeholder: '请选择 bucket 所在区域',
      options: [
        { label: '华东 z0', value: 'z0' },
        { label: '华北 z1', value: 'z1' },
        { label: '华南 z2', value: 'z2' },
        { label: '北美 na0', value: 'na0' },
        { label: '东南亚 as0', value: 'as0' }
      ]
    },
    { key: 'accessKey', label: 'AccessKey' },
    { key: 'secretKey', label: 'SecretKey', secret: true },
    { key: 'bucket', label: '空间名称' },
    { key: 'customDomain', label: '访问域名', placeholder: '空间绑定的 CDN 域名' }
  ],
  upyun: [
    { key: 'service', label: '服务名称', placeholder: '又拍云控制台"云存储"中创建的服务名（非桶/空间）' },
    { key: 'operator', label: '操作员', placeholder: '控制台"账户 → 操作员"中创建的操作员名' },
    { key: 'password', label: '操作员密码', secret: true, placeholder: '操作员对应的密码（非登录密码）' },
    { key: 'customDomain', label: '访问域名', placeholder: '如 https://xxx.test.upcdn.net 或自绑域名' }
  ]
}

const form = ref<any>({ name: '', type: 'r2', keyPrefix: '', config: {} })
const currentFields = computed(() => fieldDefs[form.value.type] || [])

function openCreate() {
  editingId.value = null
  form.value = { name: '', type: 'r2', keyPrefix: '', config: { forcePathStyle: false } }
  showModal.value = true
}

function openEdit(row: any) {
  editingId.value = row.id
  form.value = { name: row.name, type: row.type, keyPrefix: row.keyPrefix, config: { ...row.config } }
  showModal.value = true
}

async function save() {
  if (!form.value.name) return message.warning('请填写名称')
  saving.value = true
  try {
    if (editingId.value) {
      await api.put(`/api/buckets/${editingId.value}`, form.value)
    } else {
      await api.post('/api/buckets', form.value)
    }
    message.success('已保存')
    showModal.value = false
    await load()
  } catch (e: any) {
    message.error(e.message)
  } finally {
    saving.value = false
  }
}

async function testBucket(row: any) {
  try {
    await api.post(`/api/buckets/${row.id}/test`)
    message.success(`「${row.name}」连接成功`)
  } catch (e: any) {
    message.error(`连接失败: ${e.message}`)
  }
}

function removeBucket(row: any) {
  dialog.warning({
    title: '删除存储桶配置',
    content: `确定删除「${row.name}」的配置吗？只删除本站配置和记录，不会删除云端文件。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.del(`/api/buckets/${row.id}`)
      message.success('已删除')
      await load()
    }
  })
}

const fileInput = ref<HTMLInputElement | null>(null)

async function exportBuckets() {
  try {
    const data = await api.get('/api/buckets/export')
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `imgbed-buckets-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    message.success('桶设置已导出')
  } catch (e: any) {
    message.error(e.message)
  }
}

function triggerImport() {
  dialog.warning({
    title: '导入桶设置',
    content: '将从文件恢复存储桶配置。已存在的同名桶会被更新覆盖（含密钥），确定继续？',
    positiveText: '继续导入',
    negativeText: '取消',
    onPositiveClick: () => fileInput.value?.click()
  })
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    if (!data || !Array.isArray(data.buckets)) {
      return message.error('文件格式不正确（缺少 buckets 数组）')
    }
    const res = await api.post('/api/buckets/import', { buckets: data.buckets })
    message.success(`导入完成：新建 ${res.created} 个，更新 ${res.updated} 个，失败 ${res.failed} 个`)
    await load()
  } catch (e: any) {
    message.error(e.message)
  } finally {
    input.value = ''
  }
}

const typeTag: Record<string, string> = { r2: 'Cloudflare R2', s3: 'S3 兼容', 'aliyun-oss': '阿里云 OSS', 'tencent-cos': '腾讯云 COS', qiniu: '七牛云', upyun: '又拍云' }

const columns = [
  { title: 'ID', key: 'id', width: 60 },
  { title: '名称', key: 'name' },
  {
    title: '类型', key: 'type', width: 140,
    render: (row: any) => h(NTag, { size: 'small', type: 'info' }, { default: () => typeTag[row.type] || row.type })
  },
  { title: '桶 / 服务', key: 'bucket', render: (row: any) => row.config.bucket || row.config.service || '-' },
  { title: '访问域名', key: 'domain', render: (row: any) => row.config.customDomain || '-' },
  {
    title: '操作', key: 'actions', width: 340,
    render: (row: any) =>
      h(NSpace, {}, {
        default: () => [
          h(
            NButton,
            {
              size: 'small',
              type: row.id === defaultBucketId.value ? 'primary' : 'default',
              secondary: row.id === defaultBucketId.value,
              disabled: row.id === defaultBucketId.value,
              onClick: () => setDefault(row.id)
            },
            { default: () => (row.id === defaultBucketId.value ? '默认图床' : '设为默认') }
          ),
          h(NButton, { size: 'small', onClick: () => testBucket(row) }, { default: () => '测试' }),
          h(NButton, { size: 'small', onClick: () => openEdit(row) }, { default: () => '编辑' }),
          h(NButton, { size: 'small', type: 'error', quaternary: true, onClick: () => removeBucket(row) }, { default: () => '删除' })
        ]
      })
  }
]

async function load() {
  loading.value = true
  try {
    const [list, def] = await Promise.all([
      api.get('/api/buckets'),
      api.get('/api/buckets/default').catch(() => ({ defaultBucketId: null }))
    ])
    buckets.value = list
    defaultBucketId.value = def.defaultBucketId ?? null
  } catch (e: any) {
    message.error(e.message)
  } finally {
    loading.value = false
  }
}

async function setDefault(id: number) {
  try {
    await api.put('/api/buckets/default', { bucketId: id })
    defaultBucketId.value = id
    message.success('已设为默认图床')
  } catch (e: any) {
    message.error(e.message)
  }
}

// ===== 水印设置（全局一套，仅管理员可改；上传页读取后应用）=====
const user = currentUser
const isAdmin = computed(() => user.value?.role === 'admin')

const tab = ref('buckets')
const wm = ref<WatermarkConfig>({ ...WM_DEFAULTS })
const wmLoading = ref(false)
const wmSaving = ref(false)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const previewBase = ref<HTMLImageElement | HTMLCanvasElement>(demoImage())
const previewName = ref('内置示例图')
const previewInput = ref<HTMLInputElement | null>(null)

function renderWmPreview() {
  const cv = previewCanvas.value
  if (cv) paintPreview(cv, previewBase.value, wm.value)
}

// 参数变化或预览画布刚挂载（切回本标签页）时重绘
watch([wm, previewCanvas], renderWmPreview, { deep: true })

async function loadWatermark() {
  wmLoading.value = true
  try {
    wm.value = { ...(await loadWatermarkConfig(true)) }
    renderWmPreview()
  } finally {
    wmLoading.value = false
  }
}

async function saveWatermark() {
  if (!isAdmin.value) return message.warning('水印为全局配置，仅管理员可修改')
  wmSaving.value = true
  try {
    await saveWatermarkConfig(wm.value)
    message.success('水印设置已保存，上传页开启水印后即生效')
  } catch (e: any) {
    message.error(e.message)
  } finally {
    wmSaving.value = false
  }
}

function resetWatermark() {
  wm.value = { ...WM_DEFAULTS }
}

async function pickPreviewImage(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    previewBase.value = await loadImageFile(file)
    previewName.value = file.name
    renderWmPreview()
  } catch (err: any) {
    message.error(`预览图解码失败：${err.message || err}`)
  } finally {
    input.value = ''
  }
}

function useDemoPreview() {
  previewBase.value = demoImage()
  previewName.value = '内置示例图'
  renderWmPreview()
}

onMounted(() => {
  load()
  loadWatermark()
  if (route.query.tab === 'watermark') tab.value = 'watermark'
})
</script>

<template>
  <n-tabs v-model:value="tab" type="line" animated>
    <n-tab-pane name="buckets" tab="桶设置">
      <n-card title="存储桶配置" :bordered="false">
        <template #header-extra>
          <n-space>
            <n-button @click="exportBuckets">导出桶设置</n-button>
            <n-button @click="triggerImport">导入桶设置</n-button>
            <n-button type="primary" @click="openCreate">添加存储桶</n-button>
          </n-space>
        </template>

        <n-alert type="warning" :show-icon="true" style="margin-bottom: 12px">
          导出文件包含存储桶的密钥（AccessKey / Secret 等），请妥善保管；导入会按名称更新已存在的桶配置。
        </n-alert>

        <n-data-table :columns="columns" :data="buckets" :loading="loading" :bordered="false" />
        <input ref="fileInput" type="file" accept="application/json,.json" style="display: none" @change="onFileChange" />
      </n-card>
    </n-tab-pane>

    <n-tab-pane name="watermark" tab="水印设置">
      <n-card title="水印设置" :bordered="false">
        <template #header-extra>
          <n-space>
            <n-button :disabled="!isAdmin" @click="resetWatermark">恢复默认</n-button>
            <n-button type="primary" :loading="wmSaving" :disabled="!isAdmin" @click="saveWatermark">保存</n-button>
          </n-space>
        </template>

        <n-alert v-if="!isAdmin" type="info" :show-icon="true" style="margin-bottom: 12px">
          水印是全局配置，仅管理员可修改，此处为只读预览。
        </n-alert>
        <n-alert v-else type="info" :show-icon="true" style="margin-bottom: 12px">
          保存后，在「图片上传」页打开水印开关即按此配置生成水印；文字留空则自动使用上传者的用户名。
        </n-alert>

        <div class="wm-layout">
          <n-form class="wm-form" label-placement="left" label-width="96" :disabled="!isAdmin">
          <n-form-item label="水印文字">
            <n-input v-model:value="wm.text" :placeholder="`留空则用上传者用户名，如：${displayName()}`" />
          </n-form-item>
          <n-form-item label="位置">
            <n-space align="center">
              <n-select v-model:value="wm.pos" :options="WM_POS" :disabled="wm.tile || !isAdmin" style="width: 110px" />
              <n-checkbox v-model:checked="wm.tile" :disabled="!isAdmin">平铺（防盗图）</n-checkbox>
            </n-space>
          </n-form-item>
          <n-form-item label="不透明度">
            <n-space align="center" :wrap="false">
              <n-slider v-model:value="wm.opacity" :min="5" :max="100" :disabled="!isAdmin" style="width: 220px" />
              <n-text style="width: 44px">{{ wm.opacity }}%</n-text>
            </n-space>
          </n-form-item>
          <n-form-item label="字号">
            <n-space align="center" :wrap="false">
              <n-slider v-model:value="wm.size" :min="1" :max="12" :disabled="!isAdmin" style="width: 220px" />
              <n-text depth="3" style="font-size: 12px">图宽的 {{ wm.size }}%</n-text>
            </n-space>
          </n-form-item>
          <n-form-item label="旋转">
            <n-space align="center" :wrap="false">
              <n-slider v-model:value="wm.rotate" :min="-90" :max="90" :disabled="!isAdmin" style="width: 220px" />
              <n-text style="width: 44px">{{ wm.rotate }}°</n-text>
            </n-space>
          </n-form-item>
          <n-form-item label="颜色">
            <!-- n-color-picker 的根节点是 fragment，style 传不进去，宽度要靠外层容器约束 -->
            <div class="wm-color">
              <n-color-picker v-model:value="wm.color" :show-alpha="false" :disabled="!isAdmin" />
            </div>
          </n-form-item>
          </n-form>

          <div class="wm-preview">
            <n-text depth="3" class="wm-preview-title">效果预览</n-text>
            <n-spin :show="wmLoading">
              <canvas ref="previewCanvas" class="wm-canvas" />
            </n-spin>
            <n-space align="center" style="margin-top: 10px">
              <n-button size="small" @click="useDemoPreview">用示例图</n-button>
              <n-button size="small" @click="previewInput?.click()">选择本地图片</n-button>
            </n-space>
            <n-text depth="3" style="font-size: 12px; display: block; margin-top: 6px">{{ previewName }}（仅本地预览，不会上传）</n-text>
          </div>
        </div>

        <input ref="previewInput" type="file" accept="image/*" style="display: none" @change="pickPreviewImage" />
      </n-card>
    </n-tab-pane>
  </n-tabs>

  <n-modal v-model:show="showModal" preset="card" :title="editingId ? '编辑存储桶' : '添加存储桶'" style="width: 520px">
    <n-form label-placement="left" label-width="140">
      <n-form-item label="存储类型">
        <n-select v-model:value="form.type" :options="typeOptions" :disabled="!!editingId" />
      </n-form-item>
      <n-form-item label="配置名称">
        <n-input v-model:value="form.name" placeholder="随便起，如：我的R2图床" />
      </n-form-item>
      <n-form-item v-for="f in currentFields" :key="f.key" :label="f.label">
        <n-select
          v-if="f.type === 'select'"
          v-model:value="form.config[f.key]"
          :options="f.options"
          :placeholder="f.placeholder || '请选择'"
          clearable
        />
        <n-input
          v-else
          v-model:value="form.config[f.key]"
          :type="f.secret ? 'password' : 'text'"
          show-password-on="click"
          :placeholder="f.placeholder || ''"
        />
      </n-form-item>
      <n-form-item v-if="form.type === 's3'" label="Path-Style 访问">
        <n-switch v-model:value="form.config.forcePathStyle" /><span style="margin-left: 8px; color: #999; font-size: 12px">MinIO 通常需要开启</span>
      </n-form-item>
      <n-form-item label="上传目录前缀">
        <n-input v-model:value="form.keyPrefix" placeholder="可选，如 blog（自动按 前缀/年/月 存放）" />
      </n-form-item>
    </n-form>
    <template #footer>
      <n-space justify="end">
        <n-button @click="showModal = false">取消</n-button>
        <n-button type="primary" :loading="saving" @click="save">保存</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<style scoped>
/* 左参数、右预览；窄屏自动换行成上下排列 */
.wm-layout {
  display: flex;
  gap: 40px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.wm-form {
  flex: 0 1 430px;
  min-width: 320px;
}
.wm-preview {
  flex: 0 1 360px;
  min-width: 280px;
}
/* 颜色选择器默认铺满表单，收窄成小块色板，避免长条不协调 */
.wm-color {
  width: 140px;
}
.wm-color :deep(.n-color-picker) {
  width: 100%;
}
.wm-preview-title {
  display: block;
  font-size: 12px;
  margin-bottom: 8px;
}
/* 水印预览：canvas 是替换元素，只约束最大宽高即可等比缩放 */
.wm-canvas {
  display: block;
  width: auto;
  height: auto;
  max-width: 320px;
  max-height: 240px;
  border-radius: 6px;
  border: 1px solid var(--border-soft, #efeff5);
}
</style>
