<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  NCard,
  NForm,
  NFormItem,
  NInput,
  NButton,
  NSwitch,
  NSpace,
  NDivider,
  useMessage
} from 'naive-ui'
import { api } from '../api'

const message = useMessage()

const form = ref({
  site_name: '图床管理',
  logo_text: '图',
  logo_url: '',
  login_bg_url: '',
  // SMTP
  smtp_host: '',
  smtp_port: '465',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
  smtp_secure: true
})
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const testTo = ref('')

async function load() {
  loading.value = true
  try {
    // 管理员接口：返回全部设置（含 SMTP，密码已解密供回填）
    const res = await api.get('/api/settings/all')
    if (res.settings) {
      const s = res.settings
      form.value.site_name = s.site_name || '图床管理'
      form.value.logo_text = s.logo_text || '图'
      form.value.logo_url = s.logo_url || ''
      form.value.login_bg_url = s.login_bg_url || ''
      form.value.smtp_host = s.smtp_host || ''
      form.value.smtp_port = s.smtp_port || '465'
      form.value.smtp_user = s.smtp_user || ''
      form.value.smtp_pass = s.smtp_pass || ''
      form.value.smtp_from = s.smtp_from || ''
      form.value.smtp_secure = s.smtp_secure !== 'false'
    }
  } catch (e: any) {
    message.error(e.message)
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!form.value.site_name.trim()) return message.warning('站点名称不能为空')
  saving.value = true
  try {
    await api.put('/api/settings', {
      site_name: form.value.site_name.trim(),
      logo_text: form.value.logo_text.trim(),
      logo_url: form.value.logo_url.trim(),
      login_bg_url: form.value.login_bg_url.trim(),
      smtp_host: form.value.smtp_host.trim(),
      smtp_port: String(form.value.smtp_port || '465').trim(),
      smtp_user: form.value.smtp_user.trim(),
      smtp_pass: form.value.smtp_pass,
      smtp_from: form.value.smtp_from.trim(),
      smtp_secure: form.value.smtp_secure ? 'true' : 'false'
    })
    message.success('系统设置已保存')
    await load()
  } catch (e: any) {
    message.error(e.message)
  } finally {
    saving.value = false
  }
}

async function sendTest() {
  const to = testTo.value.trim()
  if (!to) return message.warning('请填写测试收件人邮箱')
  testing.value = true
  try {
    await api.post('/api/settings/test-smtp', { to })
    message.success(`测试邮件已发送至 ${to}，请查收`)
  } catch (e: any) {
    message.error(e.message)
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <n-card title="系统设置" :bordered="false" :loading="loading">
      <template #header-extra>
        <span style="font-size: 12px; color: var(--text-3)">仅管理员可见 · 影响登录页与顶部导航 branding</span>
      </template>

      <n-form label-placement="left" label-width="100" style="max-width: 560px">
        <n-form-item label="站点名称">
          <n-input v-model:value="form.site_name" placeholder="图床管理" maxlength="30" />
        </n-form-item>

        <n-form-item label="LOGO 文字">
          <n-input v-model:value="form.logo_text" placeholder="图" maxlength="8" />
          <template #feedback>
            <span style="color: var(--text-3)">未上传 LOGO 图片时，显示此处文字（通常 1-2 个字）</span>
          </template>
        </n-form-item>

        <n-form-item label="LOGO 图片">
          <n-input v-model:value="form.logo_url" placeholder="https://example.com/logo.png" />
          <template #feedback>
            <span style="color: var(--text-3)">留空则使用 LOGO 文字；建议上传 1:1 的透明 PNG</span>
          </template>
        </n-form-item>

        <n-form-item label="登录背景图">
          <n-input v-model:value="form.login_bg_url" placeholder="留空则使用默认壁纸" />
          <template #feedback>
            <span style="color: var(--text-3)">填写图片 URL（如 CDN 地址）；留空时登录页显示系统默认壁纸</span>
          </template>
        </n-form-item>

        <n-form-item>
          <n-space>
            <n-button type="primary" :loading="saving" @click="save">保存设置</n-button>
            <n-button @click="load">重置</n-button>
          </n-space>
        </n-form-item>
      </n-form>

      <div class="preview-section">
        <div class="preview-label">效果预览</div>
        <div class="preview-box">
          <div class="preview-logo">
            <img v-if="form.logo_url" :src="form.logo_url" alt="logo" />
            <span v-else>{{ form.logo_text || '图' }}</span>
          </div>
          <div class="preview-name">{{ form.site_name }}</div>
        </div>

        <div class="preview-bg-label">登录背景预览</div>
        <div class="preview-bg">
          <img :src="form.login_bg_url || '/login-bg.png'" alt="login background" />
          <span v-if="!form.login_bg_url" class="preview-bg-default">当前为默认壁纸</span>
        </div>
      </div>
    </n-card>

    <n-card title="邮件服务 (SMTP)" :bordered="false" style="margin-top: 16px">
      <template #header-extra>
        <span style="font-size: 12px; color: var(--text-3)">用于发送账号激活邮件；密码以加密形式存储</span>
      </template>

      <n-form label-placement="left" label-width="110" style="max-width: 560px">
        <n-form-item label="SMTP 服务器">
          <n-input v-model:value="form.smtp_host" placeholder="如 smtp.qq.com" />
        </n-form-item>

        <n-form-item label="端口">
          <n-input v-model:value="form.smtp_port" placeholder="465" style="max-width: 160px" />
          <template #feedback>
            <span style="color: var(--text-3)">通常为 465（SSL）或 587（STARTTLS）</span>
          </template>
        </n-form-item>

        <n-form-item label="加密连接">
          <n-switch v-model:value="form.smtp_secure">
            <template #checked>SSL/TLS</template>
            <template #unchecked>关闭</template>
          </n-switch>
          <template #feedback>
            <span style="color: var(--text-3)">端口 465 一般开启；587 视服务商要求</span>
          </template>
        </n-form-item>

        <n-form-item label="用户名">
          <n-input v-model:value="form.smtp_user" placeholder="通常为邮箱地址或发信账号" />
        </n-form-item>

        <n-form-item label="密码 / 授权码">
          <n-input
            v-model:value="form.smtp_pass"
            type="password"
            show-password-on="click"
            placeholder="QQ/163 等需用授权码，非登录密码"
          />
        </n-form-item>

        <n-form-item label="发件人地址">
          <n-input v-model:value="form.smtp_from" placeholder="如 no-reply@example.com（留空则用用户名）" />
        </n-form-item>

        <n-form-item>
          <n-space>
            <n-button type="primary" :loading="saving" @click="save">保存设置</n-button>
            <n-button @click="load">重置</n-button>
          </n-space>
        </n-form-item>

        <n-divider />

        <n-form-item label="发送测试邮件">
          <n-space>
            <n-input v-model:value="testTo" placeholder="接收测试的邮箱地址" style="width: 260px" />
            <n-button :loading="testing" @click="sendTest">发送测试</n-button>
          </n-space>
          <template #feedback>
            <span style="color: var(--text-3)">保存 SMTP 配置后，可发送一封测试邮件验证是否可用</span>
          </template>
        </n-form-item>
      </n-form>
    </n-card>
  </div>
</template>

<style scoped>
.preview-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px dashed var(--border);
}
.preview-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 14px;
}
.preview-box {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: var(--bg-page);
  border-radius: 12px;
  border: 1px solid var(--border);
}
.preview-logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.preview-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.preview-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-1);
}
.preview-bg-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-2);
  margin: 20px 0 12px;
}
.preview-bg {
  position: relative;
  width: 100%;
  max-width: 560px;
  height: 180px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--bg-page);
}
.preview-bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.preview-bg-default {
  position: absolute;
  left: 10px;
  bottom: 10px;
  padding: 3px 10px;
  font-size: 12px;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 999px;
  backdrop-filter: blur(2px);
}
</style>
