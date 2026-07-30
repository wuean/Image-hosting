<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NMenu,
  NButton,
  NDropdown,
  NAvatar,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSpace,
  zhCN,
  dateZhCN,
  createDiscreteApi,
  darkTheme
} from 'naive-ui'
import { api } from './api'
import { currentUser, displayName, setCurrentUser } from './user'

// ---- 暗黑主题（支持跟随系统） ----
const THEME_KEY = 'theme-dark'
const storedTheme = localStorage.getItem(THEME_KEY) // null=未设置(跟随系统) '1'=暗 '0'=亮
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const isDark = ref(storedTheme === null ? systemPrefersDark : storedTheme === '1')

function applyTheme() {
  document.documentElement.classList.toggle('theme-dark', isDark.value)
}
function toggleTheme() {
  isDark.value = !isDark.value
  // 用户手动切换后固定其选择（不再跟随系统）
  localStorage.setItem(THEME_KEY, isDark.value ? '1' : '0')
  applyTheme()
}
onMounted(() => {
  applyTheme()
  // 仅当用户从未手动选择时，跟随系统主题变化
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', (e) => {
    if (localStorage.getItem(THEME_KEY) === null) {
      isDark.value = e.matches
      applyTheme()
    }
  })
})

const SUN_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
const MOON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'

const route = useRoute()
const router = useRouter()
// App.vue 自身在 <n-message-provider> 之外，不能用 useMessage()，需用独立 API
const { message } = createDiscreteApi(['message'], {
  configProviderProps: { locale: zhCN, dateLocale: dateZhCN, theme: isDark.value ? darkTheme : undefined }
})
const isLogin = computed(() => route.path === '/login' || route.path === '/register' || route.path === '/activate')

// ---- 站点设置（LOGO / 名称） ----
const siteName = ref('图床管理')
const logoText = ref('图')
const logoUrl = ref('')
async function loadSettings() {
  try {
    const res = await api.get('/api/settings')
    if (res.settings) {
      siteName.value = res.settings.site_name || siteName.value
      logoText.value = res.settings.logo_text || logoText.value
      logoUrl.value = res.settings.logo_url || ''
      document.title = siteName.value
    }
  } catch {
    // 保持默认
  }
}
onMounted(loadSettings)

const user = currentUser
const isAdmin = computed(() => user.value?.role === 'admin')

const menuOptions = computed(() => {
  const base = [
    { label: '概览', key: '/images' },
    { label: '图片上传', key: '/images/upload' },
    { label: '图片管理', key: '/images/manage' },
    { label: '图床设置', key: '/buckets' }
  ]
  if (isAdmin.value) {
    base.push({ label: '用户管理', key: '/admin/users' })
    base.push({ label: '系统设置', key: '/admin/settings' })
  }
  return base
})

function onMenu(key: string) {
  router.push(key)
}

function logout() {
  localStorage.removeItem('token')
  setCurrentUser(null)
  router.push('/login')
}

const userOptions = [
  { label: '个人资料', key: 'profile' },
  { label: '退出登录', key: 'logout' }
]

const GITHUB_REPO = 'https://github.com/wuean/Image-hosting'

function onUserAction(key: string) {
  if (key === 'logout') logout()
  if (key === 'profile') router.push('/profile')
}
</script>

<template>
  <n-config-provider :theme="isDark ? darkTheme : null" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <n-dialog-provider>
        <router-view v-if="isLogin" />

        <div v-else class="app-shell">
          <header class="app-header">
            <div class="app-header-inner">
              <div class="brand" @click="router.push('/images')">
                <span class="brand-logo">
                  <img v-if="logoUrl" :src="logoUrl" alt="logo" />
                  <span v-else>{{ logoText || '图' }}</span>
                </span>
                <span class="brand-title">{{ siteName }}</span>
              </div>

              <n-menu
                mode="horizontal"
                class="app-nav"
                :options="menuOptions"
                :value="route.path"
                @update:value="onMenu"
              />

              <div class="app-actions">
                <button
                  class="theme-toggle"
                  :class="{ 'is-dark': isDark }"
                  type="button"
                  :title="isDark ? '切换到浅色' : '切换到暗色'"
                  @click="toggleTheme"
                >
                  <span class="theme-icon theme-icon--sun" v-html="SUN_SVG"></span>
                  <span class="theme-icon theme-icon--moon" v-html="MOON_SVG"></span>
                </button>
                <n-dropdown :options="userOptions" @select="onUserAction">
                  <n-button quaternary size="small" class="user-btn">
                    <div class="user-profile">
                      <n-avatar round size="small">{{ displayName(user).charAt(0).toUpperCase() }}</n-avatar>
                      <span class="user-name">{{ displayName(user) }}</span>
                      <span v-if="isAdmin" class="role-tag">管理员</span>
                      <span class="user-arrow">▾</span>
                    </div>
                  </n-button>
                </n-dropdown>
              </div>
            </div>
          </header>

          <main class="app-main">
            <div class="app-main-inner">
              <router-view :key="route.path" />
            </div>
          </main>

          <footer class="app-footer">
            <div class="app-footer-inner">
              <span>© 2026 图床管理系统 · All rights reserved</span>
              <span class="footer-links">
                <a :href="GITHUB_REPO" target="_blank" rel="noopener">帮助</a>
                <a :href="GITHUB_REPO + '/issues'" target="_blank" rel="noopener">反馈</a>
                <a :href="GITHUB_REPO + '#readme'" target="_blank" rel="noopener">文档</a>
              </span>
            </div>
          </footer>
        </div>

      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
* {
  box-sizing: border-box;
}

/* ---- 语义主题变量（浅色默认 / 暗色覆盖） ---- */
:root {
  --bg-page: #f7f8fa;
  --bg-surface: #ffffff;
  --bg-card: #ffffff;
  --border: #eceef2;
  --border-soft: #eef0f4;
  --border-strong: #e5e7eb;
  --text-1: #1f2329;
  --text-2: #646a73;
  --text-3: #8f959e;
  --accent: #18a058;
  --accent-soft: #e8f7ee;
  --shadow-card: 0 1px 3px rgba(20, 20, 40, 0.04), 0 6px 16px rgba(20, 20, 40, 0.05);
  --hover-bg: rgba(0, 0, 0, 0.045);
  --track-bg: #f1f2f5;
  --hero-bg: linear-gradient(120deg, #eef3ff 0%, #f6f1ff 100%);
  --footer-border: #eceef2;
  --icon-btn: #646a73;
}
html.theme-dark {
  --bg-page: #141417;
  --bg-surface: #1c1c21;
  --bg-card: #232329;
  --border: #2c2c34;
  --border-soft: #2c2c34;
  --border-strong: #34343d;
  --text-1: #e8e8ea;
  --text-2: #a0a0a8;
  --text-3: #787880;
  --accent: #36ad6a;
  --accent-soft: #1d2e24;
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.3), 0 6px 16px rgba(0, 0, 0, 0.35);
  --hover-bg: rgba(255, 255, 255, 0.07);
  --track-bg: #2c2c34;
  --hero-bg: linear-gradient(120deg, #1e2638 0%, #2a2340 100%);
  --footer-border: #2c2c34;
  --icon-btn: #a0a0a8;
}

html,
body,
#app {
  margin: 0;
  padding: 0;
  height: 100%;
}

.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
  transition: background 0.2s;
}

.app-header {
  height: 60px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  transition: background 0.2s, border-color 0.2s;
}

.app-header-inner,
.app-main-inner,
.app-footer-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
  width: 100%;
}

.app-header-inner {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  flex-shrink: 0;
}

.brand-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  overflow: hidden;
}
.brand-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.brand-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-1);
  letter-spacing: -0.3px;
}

.app-nav {
  flex: 1;
  display: flex;
  justify-content: center;
  border-bottom: none !important;
}

.app-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 主题切换按钮（头像前） */
.theme-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--icon-btn);
  cursor: pointer;
  padding: 0;
  overflow: hidden;
  transition: background 0.18s, border-color 0.18s, color 0.18s;
}
.theme-toggle:hover {
  background: var(--hover-bg);
  border-color: var(--border-strong);
  color: var(--text-1);
}
/* 太阳/月亮交叉淡入 + 旋转 */
.theme-icon {
  position: absolute;
  inset: 0;
  margin: auto;
  display: inline-flex;
  width: 18px;
  height: 18px;
  transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
}
.theme-icon--sun {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}
.theme-icon--moon {
  opacity: 0;
  transform: rotate(-90deg) scale(0.4);
}
.theme-toggle.is-dark .theme-icon--sun {
  opacity: 0;
  transform: rotate(90deg) scale(0.4);
}
.theme-toggle.is-dark .theme-icon--moon {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}
.theme-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

/* 主题切换时整页主要容器平滑过渡 */
.app-shell,
.app-header,
.app-footer,
.app-main-inner,
.card,
.stat-card,
.bucket-row,
.gallery-item,
.dist-track,
.hero,
.empty {
  transition: background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease,
    box-shadow 0.25s ease;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-name {
  font-size: 14px;
  color: var(--text-1);
}

.role-tag {
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 4px;
  padding: 1px 6px;
}

.user-arrow {
  font-size: 10px;
  color: var(--text-3);
  margin-left: 2px;
}

.app-main {
  flex: 1;
  padding: 24px 0 40px;
}

.app-main-inner {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  min-height: calc(100vh - 60px - 60px - 64px);
  padding: 24px;
  box-shadow: var(--shadow-card);
}

.app-footer {
  height: 60px;
  background: var(--bg-surface);
  border-top: 1px solid var(--footer-border);
  flex-shrink: 0;
  transition: background 0.2s, border-color 0.2s;
}

.app-footer-inner {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-3);
}

.footer-links a {
  color: var(--text-2);
  text-decoration: none;
  margin-left: 20px;
  transition: color 0.2s;
}

.footer-links a:hover {
  color: var(--accent);
}

/* 菜单项加宽，避免文字换行 */
.app-nav .n-menu-item-content {
  padding-left: 24px !important;
  padding-right: 24px !important;
  font-size: 15px !important;
  font-weight: 500 !important;
}

.app-nav .n-menu-item-content--selected {
  color: var(--accent) !important;
}

.app-nav .n-menu-item-content--selected::after {
  background-color: var(--accent) !important;
}

/* 下拉菜单选项 */
.user-btn .n-button__content {
  display: flex;
  align-items: center;
}

/* 修复：去掉用户按钮 hover/focus 的阴影光环，只保留极淡背景 */
.user-btn:hover,
.user-btn:focus,
.user-btn:focus-visible {
  box-shadow: none !important;
  background-color: var(--hover-bg) !important;
}
</style>
