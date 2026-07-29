<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NResult, NButton } from 'naive-ui'
import { api } from '../api'

const route = useRoute()
const router = useRouter()
const status = ref<'loading' | 'ok' | 'error'>('loading')
const msg = ref('')

onMounted(async () => {
  const token = route.query.token as string
  if (!token) {
    status.value = 'error'
    msg.value = '缺少激活令牌'
    return
  }
  try {
    const res = await api.get(`/api/auth/activate?token=${encodeURIComponent(token)}`)
    status.value = 'ok'
    msg.value = res.message || '账号已激活'
  } catch (e: any) {
    status.value = 'error'
    msg.value = e.message || '激活失败'
  }
})
</script>

<template>
  <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f5f6fa">
    <n-card style="width: 420px" :bordered="false" size="large">
      <n-result v-if="status === 'loading'" status="info" title="正在激活账号…" />
      <n-result
        v-else-if="status === 'ok'"
        status="success"
        title="账号已激活"
        :description="msg"
      >
        <template #footer>
          <n-button type="primary" @click="router.push('/login')">前往登录</n-button>
        </template>
      </n-result>
      <n-result v-else status="error" title="激活失败" :description="msg">
        <template #footer>
          <n-button @click="router.push('/login')">返回登录</n-button>
        </template>
      </n-result>
    </n-card>
  </div>
</template>
