<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NForm, NFormItem, NInput, NButton, NAlert } from 'naive-ui'
import { api } from '../api'
import { setCurrentUser } from '../user'

const router = useRouter()
const GITHUB_REPO = 'https://github.com/wuean/Image-hosting'
const username = ref('')
const password = ref('')
const loading = ref(false)
const errMsg = ref('')

const siteName = ref('图床管理')
const logoText = ref('图')
const logoUrl = ref('')
const loginBgUrl = ref('')

const logoDisplay = computed(() => {
  if (logoUrl.value) return { type: 'image', src: logoUrl.value } as const
  return { type: 'text', text: logoText.value || '图' } as const
})

// 登录背景：后台设置了则用设置值，否则回退到系统默认壁纸
const loginBg = computed(() => loginBgUrl.value || '/login-bg.png')

onMounted(async () => {
  try {
    const res = await api.get('/api/settings')
    if (res.settings) {
      siteName.value = res.settings.site_name || siteName.value
      logoText.value = res.settings.logo_text || logoText.value
      logoUrl.value = res.settings.logo_url || ''
      loginBgUrl.value = res.settings.login_bg_url || ''
    }
  } catch {
    // 使用默认标题即可
  }
})

async function login() {
  if (!username.value || !password.value) {
    errMsg.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  errMsg.value = ''
  try {
    const res = await api.post('/api/auth/login', { username: username.value, password: password.value })
    localStorage.setItem('token', res.token)
    setCurrentUser(res.user)
    errMsg.value = ''
    router.push('/images')
  } catch (e: any) {
    errMsg.value = e.message || '登录失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-bg" :style="{ backgroundImage: `url(${loginBg})` }"></div>
    <div class="login-overlay"></div>

    <div class="login-card">
      <div class="login-brand">
        <div class="login-logo">
          <img v-if="logoDisplay.type === 'image'" :src="logoDisplay.src" alt="logo" />
          <span v-else>{{ logoDisplay.text }}</span>
        </div>
        <div class="login-title">{{ siteName }}</div>
        <div class="login-subtitle">安全、高效的图床管理入口</div>
      </div>

      <n-form class="login-form" @keyup.enter="login">
        <n-form-item path="username">
          <n-input
            v-model:value="username"
            size="large"
            placeholder="用户名"
            :input-props="{ autocomplete: 'username' }"
            @input="errMsg = ''"
          >
            <template #prefix>
              <span class="input-icon">&#128100;</span>
            </template>
          </n-input>
        </n-form-item>
        <div class="login-hint">请使用用户名登录（暂不支持邮箱）</div>
        <n-form-item path="password">
          <n-input
            v-model:value="password"
            size="large"
            type="password"
            show-password-on="click"
            placeholder="密码"
            :input-props="{ autocomplete: 'current-password' }"
            @input="errMsg = ''"
          >
            <template #prefix>
              <span class="input-icon">&#128274;</span>
            </template>
          </n-input>
        </n-form-item>

        <n-alert v-if="errMsg" type="error" :show-icon="true" class="login-error">
          {{ errMsg }}
        </n-alert>

        <n-button
          type="primary"
          size="large"
          block
          :loading="loading"
          :disabled="!username || !password"
          @click="login"
        >
          登 录
        </n-button>
      </n-form>

      <div class="login-footer">
        <span>还没有账号？</span>
        <router-link to="/register">立即注册</router-link>
      </div>
    </div>

    <a
      class="login-github"
      :href="GITHUB_REPO"
      target="_blank"
      rel="noopener"
      title="在 GitHub 上查看项目"
      aria-label="GitHub"
    >
      <svg viewBox="0 0 16 16" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
      </svg>
    </a>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.login-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  transform: scale(1.05);
  animation: kenburns 30s ease-in-out infinite alternate;
  z-index: 0;
}

@keyframes kenburns {
  from { transform: scale(1.05) translate(0, 0); }
  to { transform: scale(1.15) translate(-1%, -1%); }
}

.login-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(18, 24, 38, 0.55) 0%, rgba(10, 15, 25, 0.45) 100%);
  backdrop-filter: blur(2px);
  z-index: 1;
}

.login-card {
  position: relative;
  z-index: 2;
  width: 440px;
  padding: 48px 44px 40px;
  background: rgba(255, 255, 255, 0.94);
  border-radius: 20px;
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.18),
    0 8px 20px rgba(0, 0, 0, 0.1);
  animation: cardIn 0.5s ease both;
}

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-brand {
  text-align: center;
  margin-bottom: 32px;
}

.login-logo {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, #18a058 0%, #36ad6a 100%);
  color: #fff;
  font-size: 28px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 24px rgba(24, 160, 88, 0.28);
  overflow: hidden;
}

.login-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.login-title {
  font-size: 26px;
  font-weight: 700;
  color: #1f2329;
  letter-spacing: -0.5px;
}

.login-subtitle {
  margin-top: 6px;
  font-size: 14px;
  color: #8f959e;
}

.login-form :deep(.n-form-item) {
  margin-bottom: 18px;
}

.login-hint {
  margin: -6px 0 14px;
  font-size: 12px;
  color: #8f959e;
}

.login-error {
  margin-bottom: 16px;
}

.login-form :deep(.n-input) {
  border-radius: 10px;
}

.login-form :deep(.n-input__border) {
  border-radius: 10px;
}

.input-icon {
  font-size: 16px;
  opacity: 0.65;
}

.login-footer {
  margin-top: 22px;
  text-align: center;
  font-size: 14px;
  color: #646a73;
}

.login-footer a {
  margin-left: 4px;
  color: #18a058;
  text-decoration: none;
  font-weight: 500;
}

.login-footer a:hover {
  text-decoration: underline;
}

.login-github {
  position: absolute;
  right: 18px;
  bottom: 14px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.75);
  background: rgba(0, 0, 0, 0.25);
  transition: color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}
.login-github:hover {
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  transform: translateY(-2px);
}

@media (max-width: 540px) {
  .login-card {
    width: calc(100vw - 40px);
    padding: 36px 28px 32px;
  }
}
</style>
