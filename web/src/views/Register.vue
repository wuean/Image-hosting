<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NForm, NFormItem, NInput, NButton, NResult, useMessage } from 'naive-ui'
import { api } from '../api'

const router = useRouter()
const message = useMessage()
const username = ref('')
const email = ref('')
const password = ref('')
const confirm = ref('')
const loading = ref(false)
const done = ref(false)

async function register() {
  if (!username.value || !email.value || !password.value) return message.warning('请填写完整信息')
  if (password.value !== confirm.value) return message.warning('两次输入的密码不一致')
  loading.value = true
  try {
    await api.post('/api/auth/register', {
      username: username.value,
      email: email.value,
      password: password.value
    })
    done.value = true
  } catch (e: any) {
    message.error(e.message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f5f6fa">
    <n-card title="🖼️ 注册账号" style="width: 380px" :bordered="false" size="large">
      <n-result
        v-if="done"
        status="success"
        title="注册成功"
        description="我们已发送激活邮件，请查收并点击其中的链接激活账号，之后才能登录使用。"
      >
        <template #footer>
          <n-button type="primary" @click="router.push('/login')">前往登录</n-button>
        </template>
      </n-result>

      <n-form v-else @keyup.enter="register">
        <n-form-item label="用户名">
          <n-input v-model:value="username" placeholder="3-32 位字母/数字/下划线" />
        </n-form-item>
        <n-form-item label="邮箱">
          <n-input v-model:value="email" placeholder="用于接收激活邮件" />
        </n-form-item>
        <n-form-item label="密码">
          <n-input v-model:value="password" type="password" show-password-on="click" placeholder="至少 6 位" />
        </n-form-item>
        <n-form-item label="确认密码">
          <n-input v-model:value="confirm" type="password" show-password-on="click" placeholder="再次输入密码" />
        </n-form-item>
        <n-button type="primary" block :loading="loading" @click="register">注 册</n-button>
      </n-form>

      <div v-if="!done" style="margin-top: 14px; text-align: center; font-size: 13px; color: #6b7280">
        已有账号？<router-link to="/login" style="color: #18a058; text-decoration: none">去登录</router-link>
      </div>
    </n-card>
  </div>
</template>
