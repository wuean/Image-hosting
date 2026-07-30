<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import {
  NCard,
  NDataTable,
  NButton,
  NTag,
  NSpace,
  NText,
  NModal,
  NForm,
  NFormItem,
  NInput,
  useMessage,
  useDialog
} from 'naive-ui'
import { api } from '../api'

const message = useMessage()
const dialog = useDialog()
const users = ref<any[]>([])
const loading = ref(false)

const showEdit = ref(false)
const editForm = ref({ id: 0, username: '', email: '' })
const editLoading = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await api.get('/api/auth/admin/users')
    users.value = res.users
  } catch (e: any) {
    message.error(e.message)
  } finally {
    loading.value = false
  }
}

function openEdit(row: any) {
  editForm.value = { id: row.id, username: row.username, email: row.email || '' }
  showEdit.value = true
}

async function saveEdit() {
  if (!editForm.value.username.trim()) return message.warning('用户名不能为空')
  editLoading.value = true
  try {
    await api.put(`/api/auth/admin/users/${editForm.value.id}`, {
      username: editForm.value.username.trim(),
      email: editForm.value.email.trim()
    })
    message.success('用户信息已更新')
    showEdit.value = false
    load()
  } catch (e: any) {
    message.error(e.message)
  } finally {
    editLoading.value = false
  }
}

function resendActivation(row: any) {
  dialog.info({
    title: '重发激活邮件',
    content: `确定向「${row.username}」的邮箱 ${row.email || '（未设置邮箱）'} 重新发送激活邮件吗？`,
    positiveText: '发送',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const res = await api.post(`/api/auth/admin/users/${row.id}/resend-activation`)
        message.success(res.message || '激活邮件已发送')
      } catch (e: any) {
        message.error(e.message)
      }
    }
  })
}

function toggleActive(row: any) {
  const action = row.is_active ? 'deactivate' : 'activate'
  api
    .post(`/api/auth/admin/users/${row.id}/${action}`)
    .then(() => {
      message.success(row.is_active ? '已停用该账号' : '已激活该账号')
      load()
    })
    .catch((e: any) => message.error(e.message))
}

function removeUser(row: any) {
  dialog.warning({
    title: '删除用户',
    content: `确定删除用户「${row.username}」吗？将同时删除其存储桶配置与本地上传记录，但云端实际文件不会删除（需用户自行处理）。此操作不可恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.del(`/api/auth/admin/users/${row.id}`)
        message.success('已删除')
        load()
      } catch (e: any) {
        message.error(e.message)
      }
    }
  })
}

const columns = [
  { title: 'ID', key: 'id', width: 60 },
  { title: '用户名', key: 'username' },
  { title: '昵称', key: 'nickname', render: (r: any) => r.nickname || '-' },
  { title: '邮箱', key: 'email', render: (r: any) => r.email || '-' },
  {
    title: '角色', key: 'role', width: 90,
    render: (r: any) =>
      h(NTag, { size: 'small', type: r.role === 'admin' ? 'warning' : 'default' }, { default: () => (r.role === 'admin' ? '管理员' : '用户') })
  },
  {
    title: '状态', key: 'is_active', width: 90,
    render: (r: any) =>
      h(NTag, { size: 'small', type: r.is_active ? 'success' : 'error' }, { default: () => (r.is_active ? '已激活' : '未激活') })
  },
  { title: '桶数量', key: 'bucket_count', width: 90 },
  { title: '注册时间', key: 'created_at', width: 170 },
  {
    title: '操作', key: 'actions', width: 260,
    render: (row: any) =>
      h(NSpace, { size: 'small' }, {
        default: () => [
          h(
            NButton,
            { size: 'small', quaternary: true, onClick: () => openEdit(row) },
            { default: () => '编辑' }
          ),
          !row.is_active &&
            h(
              NButton,
              { size: 'small', type: 'info', quaternary: true, disabled: !row.email || row.role === 'admin', onClick: () => resendActivation(row) },
              { default: () => '重发邮件' }
            ),
          h(
            NButton,
            { size: 'small', type: row.is_active ? 'warning' : 'primary', quaternary: true, disabled: row.role === 'admin', onClick: () => toggleActive(row) },
            { default: () => (row.is_active ? '停用' : '激活') }
          ),
          h(
            NButton,
            { size: 'small', type: 'error', quaternary: true, disabled: row.role === 'admin', onClick: () => removeUser(row) },
            { default: () => '删除' }
          )
        ].filter(Boolean)
      })
  }
]

onMounted(load)
</script>

<template>
  <n-card title="用户管理" :bordered="false">
    <template #header-extra>
      <n-text depth="3" style="font-size: 12px">仅管理员可见 · 远端文件只有桶主本人能删除</n-text>
    </template>
    <n-data-table :columns="columns" :data="users" :loading="loading" :bordered="false" />
  </n-card>

  <n-modal v-model:show="showEdit" preset="card" title="编辑用户信息" style="width: 420px">
    <n-form label-placement="left" label-width="70">
      <n-form-item label="用户名">
        <n-input v-model:value="editForm.username" placeholder="3-32 位字母/数字/下划线" />
      </n-form-item>
      <n-form-item label="邮箱">
        <n-input v-model:value="editForm.email" placeholder="用于激活与找回" />
      </n-form-item>
    </n-form>
    <template #footer>
      <n-space justify="end">
        <n-button @click="showEdit = false">取消</n-button>
        <n-button type="primary" :loading="editLoading" @click="saveEdit">保存</n-button>
      </n-space>
    </template>
  </n-modal>
</template>
