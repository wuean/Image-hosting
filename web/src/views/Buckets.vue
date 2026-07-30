<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue'
import { NCard, NButton, NDataTable, NModal, NForm, NFormItem, NInput, NSelect, NSwitch, NTag, NSpace, NAlert, useMessage, useDialog } from 'naive-ui'
import { api } from '../api'

const message = useMessage()
const dialog = useDialog()
const buckets = ref<any[]>([])
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

const fieldDefs: Record<string, { key: string; label: string; placeholder?: string; secret?: boolean }[]> = {
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
    title: '操作', key: 'actions', width: 220,
    render: (row: any) =>
      h(NSpace, {}, {
        default: () => [
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
    buckets.value = await api.get('/api/buckets')
  } catch (e: any) {
    message.error(e.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
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

  <n-modal v-model:show="showModal" preset="card" :title="editingId ? '编辑存储桶' : '添加存储桶'" style="width: 520px">
    <n-form label-placement="left" label-width="140">
      <n-form-item label="存储类型">
        <n-select v-model:value="form.type" :options="typeOptions" :disabled="!!editingId" />
      </n-form-item>
      <n-form-item label="配置名称">
        <n-input v-model:value="form.name" placeholder="随便起，如：我的R2图床" />
      </n-form-item>
      <n-form-item v-for="f in currentFields" :key="f.key" :label="f.label">
        <n-input
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
