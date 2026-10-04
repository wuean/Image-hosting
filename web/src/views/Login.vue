<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { NConfigProvider, NForm, NFormItem, NInput, NButton, NAlert } from 'naive-ui'
import { api } from '../api'
import { setCurrentUser } from '../user'

const router = useRouter()
const GITHUB_REPO = 'https://github.com/wuean/Image-hosting'
const username = ref('')
const password = ref('')
const loading = ref(false)
const errMsg = ref('')

const siteName = ref('图床管理')
const loginBgUrl = ref('')

// 登录背景：后台设置了则用设置值，否则回退到系统默认壁纸
const loginBg = computed(() => loginBgUrl.value || '/login-bg.png')

// 左栏介绍：只列最有辨识度的能力，给第一次到访的外部访客看
const features = [
  '6 种对象存储统一接入：R2 / S3 / OSS / COS / 七牛 / 又拍云',
  '上传前处理：压缩、转格式、重命名、加水印',
  '多用户 + 邮箱激活，存储桶按用户隔离',
  '流式上传，大文件不占用服务端内存'
]

onMounted(async () => {
  try {
    const res = await api.get('/api/settings')
    if (res.settings) {
      siteName.value = res.settings.site_name || siteName.value
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
      <!-- 左栏：站点介绍。卡片整体固定浅色，避免暗黑主题下表单与卡片撞色 -->
      <n-config-provider :theme="null" class="login-card-inner">
        <aside class="login-intro">
          <h1 class="login-title">{{ siteName }}</h1>
          <p class="login-subtitle">自托管图床管理系统，统一对接多家对象存储</p>

          <ul class="login-features">
            <li v-for="f in features" :key="f">
              <svg class="feat-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                  d="M2.5 8.5l3.5 3.5 7-7.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>{{ f }}</span>
            </li>
          </ul>

          <div class="login-art" aria-hidden="true">
            <svg viewBox="0 0 320 170" width="320" height="170" fill="none">
              <!-- 叠放的图片卡片：由后至前依次加深，营造层次 -->
              <g transform="rotate(-10 170 132)">
                <rect
                  x="100"
                  y="58"
                  width="140"
                  height="88"
                  rx="12"
                  fill="#ffffff"
                  fill-opacity="0.07"
                  stroke="#ffffff"
                  stroke-opacity="0.26"
                  stroke-width="2"
                />
              </g>
              <g transform="rotate(-5 170 132)">
                <rect
                  x="100"
                  y="58"
                  width="140"
                  height="88"
                  rx="12"
                  fill="#ffffff"
                  fill-opacity="0.1"
                  stroke="#ffffff"
                  stroke-opacity="0.34"
                  stroke-width="2"
                />
              </g>
              <g>
                <rect
                  x="100"
                  y="58"
                  width="140"
                  height="88"
                  rx="12"
                  fill="#ffffff"
                  fill-opacity="0.14"
                  stroke="#ffffff"
                  stroke-opacity="0.5"
                  stroke-width="2"
                />
                <!-- 最前一张卡片内画图片符号：太阳 + 山峦 -->
                <g
                  stroke="#ffffff"
                  stroke-opacity="0.62"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="134" cy="80" r="6" />
                  <path d="M114 124l30-32 20 20 14-14 26 26" />
                </g>
              </g>
            </svg>
          </div>

          <a class="login-github" :href="GITHUB_REPO" target="_blank" rel="noopener">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
            </svg>
            <span>在 GitHub 上查看源码</span>
          </a>
        </aside>

        <!-- 右栏：登录表单 -->
        <div class="login-form-side">
          <div class="form-heading">登录</div>
          <div class="form-hint">请使用用户名登录</div>

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
              登录
            </n-button>
          </n-form>

          <div class="login-footer">
            <span>还没有账号？</span>
            <router-link to="/register">立即注册</router-link>
          </div>
        </div>
      </n-config-provider>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
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
  width: 880px;
  max-width: 100%;
  border-radius: 20px;
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.28),
    0 8px 20px rgba(0, 0, 0, 0.16);
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

/* 卡片由 n-config-provider 渲染，需在此撑开左右两栏 */
.login-card-inner {
  display: flex;
  border-radius: 20px;
  overflow: hidden;
}

/* 左栏：品牌与亮点 */
.login-intro {
  flex: 0 0 58%;
  padding: 44px 38px;
  display: flex;
  flex-direction: column;
  color: #fff;
  background: linear-gradient(155deg, #1a8f57 0%, #14764a 55%, #0f5f3c 100%);
}

.login-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: #fff;
}

.login-subtitle {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.78);
}

.login-features {
  list-style: none;
  margin: 28px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.login-features li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.9);
}

.feat-icon {
  flex: none;
  margin-top: 3px;
  color: #8fe0b4;
}

.login-art {
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-art svg {
  width: 100%;
  max-width: 300px;
  max-height: 100%;
}

.login-github {
  padding-top: 20px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.82);
  text-decoration: none;
  transition: color 0.2s ease;
}

.login-github:hover {
  color: #fff;
  text-decoration: underline;
}

/* 右栏：登录表单 */
.login-form-side {
  flex: 0 0 42%;
  padding: 44px 40px;
  background: rgba(255, 255, 255, 0.97);
}

.form-heading {
  font-size: 20px;
  font-weight: 600;
  color: #1f2329;
}

.form-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #8f959e;
}

.login-form {
  margin-top: 24px;
}

.login-form :deep(.n-form-item) {
  margin-bottom: 18px;
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

.login-error {
  margin-bottom: 16px;
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

/* 窄屏：折成单列，左栏收成顶部的品牌条 */
@media (max-width: 860px) {
  .login-card {
    width: 440px;
  }

  .login-card-inner {
    flex-direction: column;
  }

  .login-intro {
    flex: none;
    align-items: center;
    padding: 30px 28px 26px;
    text-align: center;
  }

  .login-subtitle {
    max-width: 340px;
  }

  .login-features,
  .login-art,
  .login-github {
    display: none;
  }

  .login-form-side {
    padding: 30px 28px 32px;
  }
}

@media (max-width: 540px) {
  .login-page {
    padding: 16px;
  }

  .login-card {
    width: 100%;
  }

  .login-intro {
    padding: 24px 22px 22px;
  }

  .login-form-side {
    padding: 26px 22px 28px;
  }
}
</style>
