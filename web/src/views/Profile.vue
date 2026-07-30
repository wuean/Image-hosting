<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NForm, NFormItem, NInput, NButton, NTag, NSpace, NDivider, useMessage } from 'naive-ui'
import { api } from '../api'
import { currentUser, setCurrentUser } from '../user'

const router = useRouter()
const message = useMessage()

const nickname = ref('')
const email = ref('')
const profileLoading = ref(false)

const pwdForm = ref({ oldPassword: '', newPassword: '' })
const pwdLoading = ref(false)

const me = ref<any>(currentUser.value)

onMounted(async () => {
  try {
    const res = await api.get('/api/auth/me')
    if (res.user) {
      setCurrentUser(res.user)
      me.value = res.user
      nickname.value = res.user.nickname || ''
      email.value = res.user.email || ''
    }
  } catch {
    nickname.value = me.value?.nickname || ''
    email.value = me.value?.email || ''
  }
})

async function saveProfile() {
  profileLoading.value = true
  try {
    const res = await api.put('/api/auth/profile', { nickname: nickname.value, email: email.value })
    if (res.user) {
      setCurrentUser(res.user)
      me.value = res.user
      nickname.value = res.user.nickname || ''
      email.value = res.user.email || ''
    }
    message.success('资料已保存')
  } catch (e: any) {
    message.error(e.message)
  } finally {
    profileLoading.value = false
  }
}

async function submitPwd() {
  if (!pwdForm.value.oldPassword || !pwdForm.value.newPassword) return message.warning('请填写完整')
  pwdLoading.value = true
  try {
    await api.post('/api/auth/change-password', pwdForm.value)
    message.success('密码已修改')
    pwdForm.value = { oldPassword: '', newPassword: '' }
  } catch (e: any) {
    message.error(e.message)
  } finally {
    pwdLoading.value = false
  }
}
</script>

<template>
  <div class="profile">
    <n-card class="profile-card" :bordered="false">
      <template #header>
        <div class="card-head">
          <span class="card-title">个人资料</span>
          <span class="card-sub">管理你的昵称、邮箱与登录密码</span>
        </div>
      </template>

      <!-- 账号信息（只读） -->
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">用户名</span>
          <span class="info-value">{{ me?.username || '-' }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">角色</span>
          <span class="info-value">
            <n-tag size="small" :type="me?.role === 'admin' ? 'warning' : 'default'">
              {{ me?.role === 'admin' ? '管理员' : '用户' }}
            </n-tag>
          </span>
        </div>
        <div class="info-item">
          <span class="info-label">注册时间</span>
          <span class="info-value">{{ me?.created_at || '-' }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">账号状态</span>
          <span class="info-value">
            <n-tag size="small" :type="me?.is_active ? 'success' : 'error'">
              {{ me?.is_active ? '已激活' : '未激活' }}
            </n-tag>
          </span>
        </div>
      </div>

      <n-divider />

      <!-- 编辑：昵称 + 邮箱 -->
      <n-form label-placement="left" label-width="80" :show-feedback="false" class="edit-form">
        <n-form-item label="昵称">
          <n-input
            v-model:value="nickname"
            placeholder="留空则显示用户名"
            maxlength="32"
            show-count
            clearable
          />
        </n-form-item>
        <n-form-item label="邮箱">
          <n-input v-model:value="email" placeholder="用于接收激活/通知邮件" />
        </n-form-item>
        <n-form-item>
          <n-space>
            <n-button type="primary" :loading="profileLoading" @click="saveProfile">保存资料</n-button>
          </n-space>
        </n-form-item>
      </n-form>

      <n-divider />

      <!-- 修改密码 -->
      <div class="section-title">修改密码</div>
      <n-form label-placement="left" label-width="80">
        <n-form-item label="原密码">
          <n-input v-model:value="pwdForm.oldPassword" type="password" show-password-on="click" />
        </n-form-item>
        <n-form-item label="新密码">
          <n-input
            v-model:value="pwdForm.newPassword"
            type="password"
            show-password-on="click"
            placeholder="至少 6 位"
          />
        </n-form-item>
        <n-form-item>
          <n-space>
            <n-button type="primary" :loading="pwdLoading" @click="submitPwd">更新密码</n-button>
          </n-space>
        </n-form-item>
      </n-form>
    </n-card>
  </div>
</template>

<style scoped>
.profile {
  max-width: 720px;
}
.profile-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
}
.card-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.card-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-1);
}
.card-sub {
  font-size: 13px;
  color: var(--text-3);
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px 24px;
}
.info-item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.info-label {
  font-size: 13px;
  color: var(--text-3);
  width: 64px;
  flex-shrink: 0;
}
.info-value {
  font-size: 14px;
  color: var(--text-1);
  font-weight: 500;
}
.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
  margin-bottom: 16px;
}
/* 编辑区（昵称/邮箱）与「修改密码」区保持一致的表单项间距 */
.edit-form :deep(.n-form-item) {
  margin-bottom: 20px;
}
.edit-form :deep(.n-form-item:last-child) {
  margin-bottom: 0;
}
@media (max-width: 560px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
}
</style>
