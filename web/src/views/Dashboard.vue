<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NEmpty, NSpin, NImage, NText, useMessage } from 'naive-ui'
import { api } from '../api'
import { displayName } from '../user'

const router = useRouter()
const message = useMessage()

const loading = ref(true)
const data = ref<any>(null)

const PROVIDER_META: Record<string, { label: string; color: string }> = {
  r2: { label: 'Cloudflare R2', color: '#378ADD' },
  s3: { label: 'AWS S3', color: '#185FA5' },
  'aliyun-oss': { label: '阿里云 OSS', color: '#FF6A00' },
  'tencent-cos': { label: '腾讯云 COS', color: '#0052D9' },
  qiniu: { label: '七牛云 Kodo', color: '#1D9E75' },
  upyun: { label: '又拍云 USS', color: '#BA7517' }
}
function providerMeta(p: string) {
  return PROVIDER_META[p] || { label: p, color: '#888780' }
}

// 统计卡图标（线性 SVG，白描边）
const STAT_ICONS: Record<string, string> = {
  buckets:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M9 7V4h6v3"/></svg>',
  images:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.6"/><path d="M4 17l4.5-4.5 3.5 3 3-3L20 15"/></svg>',
  storage:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/></svg>',
  month:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>'
}

const username = computed(() => displayName())

function fmtSize(n: number) {
  if (!n) return '0 B'
  if (n > 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB'
  if (n > 1024) return (n / 1024).toFixed(1) + ' KB'
  return n + ' B'
}

const providerSubtitle = computed(() => {
  const bp = data.value?.buckets?.byProvider || []
  return bp.map((x: any) => providerMeta(x.provider).label).join(' · ') || '暂无'
})

// 按服务商聚合存储用量 + 占比，用于分布条
const distribution = computed(() => {
  const pb = data.value?.perBucket || []
  const map: Record<string, number> = {}
  for (const b of pb) map[b.provider] = (map[b.provider] || 0) + (b.size || 0)
  const arr = Object.entries(map).map(([provider, size]) => ({ provider, size }))
  arr.sort((a, b) => b.size - a.size)
  const total = arr.reduce((s, x) => s + x.size, 0) || 1
  const max = arr.length ? arr[0].size : 1
  return arr.map((x) => ({
    ...x,
    pct: max ? Math.max(4, Math.round((x.size / max) * 100)) : 0,
    share: Math.round((x.size / total) * 100)
  }))
})

const totalSize = computed(() => data.value?.images?.totalSize || 0)

async function copyText(text: string, label: string) {
  if (!text) return message.warning('该文件暂无可复制的外链')
  await navigator.clipboard.writeText(text)
  message.success(`${label}已复制`)
}

function htmlTag(url: string) {
  return `<img src="${url}" alt="" />`
}

onMounted(async () => {
  try {
    data.value = await api.get('/api/stats')
  } catch (e: any) {
    message.error(e.message)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="dash">
    <n-spin :show="loading">
      <!-- 空状态：还没有任何桶 -->
      <div v-if="!loading && data && data.buckets.total === 0" class="empty-wrap">
        <n-empty description="你还没有配置任何存储桶">
          <template #extra>
            <n-button type="primary" @click="router.push('/buckets')">去添加存储桶</n-button>
          </template>
        </n-empty>
      </div>

      <template v-else>
        <!-- 欢迎横幅 -->
        <section class="hero">
          <div>
            <p class="hero-title">欢迎回来，{{ username }}</p>
            <p class="hero-sub">这是你的图床总览 · 数据实时统计自全部存储桶</p>
          </div>
          <n-space>
            <n-button secondary strong @click="router.push('/buckets')">新建桶</n-button>
            <n-button type="primary" @click="router.push('/images/upload')">上传图片</n-button>
          </n-space>
        </section>

        <!-- 四张统计卡 -->
        <section class="stat-grid">
          <div class="stat-card" style="--accent: #5b8def">
            <span class="stat-ico" v-html="STAT_ICONS.buckets"></span>
            <p class="stat-label">存储桶</p>
            <p class="stat-num">{{ data?.buckets?.total ?? 0 }}</p>
            <p class="stat-hint">{{ providerSubtitle }}</p>
          </div>
          <div class="stat-card" style="--accent: #22c3a6">
            <span class="stat-ico" v-html="STAT_ICONS.images"></span>
            <p class="stat-label">图片总数</p>
            <p class="stat-num">{{ data?.images?.total ?? 0 }}</p>
            <p class="stat-hint">跨全部存储桶</p>
          </div>
          <div class="stat-card" style="--accent: #f2994a">
            <span class="stat-ico" v-html="STAT_ICONS.storage"></span>
            <p class="stat-label">存储用量</p>
            <p class="stat-num">{{ fmtSize(totalSize) }}</p>
            <p class="stat-hint">已占用空间</p>
          </div>
          <div class="stat-card" style="--accent: #9b6dff">
            <span class="stat-ico" v-html="STAT_ICONS.month"></span>
            <p class="stat-label">本月新增</p>
            <p class="stat-num">+{{ data?.images?.thisMonth ?? 0 }}</p>
            <p class="stat-hint">本月上传图片</p>
          </div>
        </section>

        <!-- 存储分布 + 桶概览 -->
        <section class="two-col">
          <div class="card">
            <div class="card-head"><span class="bar"></span><h3>存储分布</h3><span class="card-sub">按服务商</span></div>
            <div v-if="distribution.length" class="dist-list">
              <div v-for="d in distribution" :key="d.provider" class="dist-row">
                <div class="dist-head">
                  <span class="dist-name">
                    <i class="dot" :style="{ background: providerMeta(d.provider).color }"></i>
                    {{ providerMeta(d.provider).label }}
                  </span>
                  <span class="dist-val">{{ fmtSize(d.size) }} · {{ d.share }}%</span>
                </div>
                <div class="dist-track">
                  <div class="dist-fill" :style="{ width: d.pct + '%', background: providerMeta(d.provider).color }"></div>
                </div>
              </div>
            </div>
            <n-empty v-else description="暂无数据" :show-icon="false" class="card-empty" />
          </div>

          <div class="card">
            <div class="card-head"><span class="bar"></span><h3>存储桶概览</h3><span class="card-sub">{{ data?.perBucket?.length ?? 0 }} 个</span></div>
            <div class="bucket-list">
              <div
                v-for="b in data?.perBucket"
                :key="b.id"
                class="bucket-row"
                @click="router.push('/images/manage')"
              >
                <div class="bucket-left">
                  <span class="dot" :style="{ background: providerMeta(b.provider).color }"></span>
                  <span class="bucket-name">{{ b.name }}</span>
                </div>
                <span class="bucket-count">{{ b.count }} 张 · {{ fmtSize(b.size) }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 最近上传 -->
        <section class="card recent">
          <div class="card-head"><span class="bar"></span><h3>最近上传</h3><span class="card-sub">共 {{ data?.images?.total ?? 0 }} 张</span></div>
          <n-empty v-if="!data?.recent?.length" description="还没有上传记录" :show-icon="false" class="card-empty" />
          <div v-else class="recent-grid">
            <div v-for="r in data.recent" :key="r.id" class="recent-card">
              <div class="recent-thumb">
                <n-image
                  v-if="r.url"
                  :src="r.url"
                  width="100%"
                  height="100%"
                  object-fit="cover"
                />
                <div v-else class="recent-noimg">无外链</div>
              </div>
              <div class="recent-meta">
                <div class="recent-name" :title="r.name || r.key">{{ r.name || r.key }}</div>
                <n-text depth="3" class="recent-size">{{ fmtSize(r.size) }}</n-text>
                <n-space size="small" class="recent-btns">
                  <n-button size="tiny" @click="copyText(r.url, 'URL')">URL</n-button>
                  <n-button size="tiny" @click="copyText(`![](${r.url})`, 'MD')">MD</n-button>
                  <n-button size="tiny" @click="copyText(htmlTag(r.url), 'HTML')">HTML</n-button>
                </n-space>
              </div>
            </div>
          </div>
        </section>
      </template>
    </n-spin>
  </div>
</template>

<style scoped>
.dash {
  max-width: 1200px;
  margin: 0 auto;
  padding: 8px 4px 24px;
  color: var(--text-1);
}
.empty-wrap {
  padding: 80px 0;
}
/* 欢迎横幅 */
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  padding: 20px 24px;
  margin-bottom: 16px;
  border-radius: 14px;
  background: var(--hero-bg);
  border: 1px solid var(--border);
}
.hero-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: var(--text-1);
}
.hero-sub {
  font-size: 13px;
  color: var(--text-2);
  margin: 6px 0 0;
}
/* 统计卡 */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}
.stat-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  padding: 18px 18px 16px;
  box-shadow: var(--shadow-card);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  overflow: hidden;
}
.stat-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--accent);
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card);
}
.stat-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-card));
  color: var(--accent);
  margin-bottom: 12px;
}
.stat-ico :deep(svg) {
  width: 18px;
  height: 18px;
}
.stat-label {
  font-size: 13px;
  color: var(--text-2);
  margin: 0;
}
.stat-num {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  margin: 6px 0 0;
  color: var(--text-1);
}
.stat-hint {
  font-size: 12px;
  color: var(--text-3);
  margin: 4px 0 0;
}
/* 两列布局 */
.two-col {
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 16px;
  margin-bottom: 16px;
}
/* 通用卡片容器 */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  padding: 18px 20px 20px;
  box-shadow: var(--shadow-card);
}
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px;
}
.card-head .bar {
  width: 4px;
  height: 15px;
  border-radius: 3px;
  background: var(--accent);
}
.card-head h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: var(--text-1);
}
.card-sub {
  font-size: 12px;
  color: var(--text-3);
  margin-left: auto;
}
.card-empty {
  padding: 28px 0;
}
/* 存储分布 */
.dist-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.dist-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  margin-bottom: 7px;
}
.dist-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-1);
  font-weight: 500;
}
.dist-val {
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.dist-track {
  height: 9px;
  border-radius: 5px;
  background: var(--track-bg);
  overflow: hidden;
}
.dist-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.4s ease;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}
/* 桶概览 */
.bucket-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bucket-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  border: 1px solid var(--border-soft);
  border-radius: 9px;
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s, transform 0.18s;
}
.bucket-row:hover {
  border-color: var(--accent);
  background: var(--hover-bg);
  transform: translateX(2px);
}
.bucket-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bucket-name {
  font-size: 13px;
  color: var(--text-1);
}
.bucket-count {
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
/* 最近上传 */
.recent-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
}
.recent-card {
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-card);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.recent-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-card);
}
.recent-thumb {
  height: 110px;
  background: var(--track-bg);
}
.recent-thumb :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.recent-noimg {
  height: 110px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--track-bg);
  color: var(--text-3);
  font-size: 12px;
}
.recent-meta {
  padding: 9px 11px 11px;
}
.recent-name {
  font-size: 12px;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-size {
  font-size: 11px;
}
.recent-btns {
  margin-top: 6px;
}
@media (max-width: 920px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .two-col {
    grid-template-columns: 1fr;
  }
  .recent-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
