<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { NSpin, NEmpty, NRadioGroup, NRadioButton, useMessage } from 'naive-ui'
import { api } from '../api'

const message = useMessage()
const loading = ref(true)
const days = ref(0)
const data = ref<any>(null)

async function load() {
  loading.value = true
  try {
    data.value = await api.get(`/api/analytics?days=${days.value}`)
  } catch (e: any) {
    message.error(e.message)
  } finally {
    loading.value = false
  }
}
watch(days, load)
onMounted(load)

const summary = computed(() => data.value?.summary || { pv: 0, uv: 0, ip: 0 })
const series = computed<any[]>(() => data.value?.series || [])
const maxVal = computed(() => Math.max(1, ...series.value.map((d: any) => Math.max(d.pv, d.uv))))
// 当前所选范围的展示名（0 = 今日）
const rangeLabel = computed(() => (days.value === 0 ? '今日' : `近 ${days.value} 天`))
const trendUnit = computed(() => (days.value === 0 ? '分时' : '按天'))

const STAT_ICONS: Record<string, string> = {
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  ip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z"/></svg>'
}

function barPct(v: number) {
  return Math.round((v / maxVal.value) * 100)
}
function fmtTime(s: string) {
  return (s || '').replace('T', ' ').slice(5, 16)
}
// x 轴标签密度：≤12 格全显示；小时视图每 3 小时一个；更长的按 5 / 10 天间隔
function showLabel(i: number) {
  const n = series.value.length
  if (n <= 12) return true
  if (n <= 24) return i % 3 === 0
  return i % (n > 30 ? 10 : 5) === 0
}
</script>

<template>
  <div class="an">
    <n-spin :show="loading">
      <section class="hero">
        <div>
          <p class="hero-title">站点访问统计</p>
        </div>
        <n-radio-group v-model:value="days" size="small">
          <n-radio-button :value="0">今日</n-radio-button>
          <n-radio-button :value="7">7 天</n-radio-button>
          <n-radio-button :value="30">30 天</n-radio-button>
          <n-radio-button :value="90">90 天</n-radio-button>
        </n-radio-group>
      </section>

      <!-- 概况：三张卡，全部跟随上方所选范围 -->
      <section class="stat-grid">
        <div class="stat-card" style="--accent: #18a058">
          <span class="stat-ico" v-html="STAT_ICONS.eye"></span>
          <p class="stat-label">浏览量（PV）</p>
          <p class="stat-num">{{ summary.pv }}</p>
          <p class="stat-hint">{{ rangeLabel }}</p>
        </div>
        <div class="stat-card" style="--accent: #5b8def">
          <span class="stat-ico" v-html="STAT_ICONS.user"></span>
          <p class="stat-label">访客数（UV）</p>
          <p class="stat-num">{{ summary.uv }}</p>
          <p class="stat-hint">{{ rangeLabel }}</p>
        </div>
        <div class="stat-card" style="--accent: #00a6a6">
          <span class="stat-ico" v-html="STAT_ICONS.ip"></span>
          <p class="stat-label">IP 数</p>
          <p class="stat-num">{{ summary.ip }}</p>
          <p class="stat-hint">{{ rangeLabel }}</p>
        </div>
      </section>
      <p class="stat-note">
        「IP 数」是<strong>访问过站点</strong>的去重 IP 数，与下方「登录 IP」列表不是同一份数据（后者只记录登录成功的来源 IP）。
      </p>

      <!-- 趋势 -->
      <section class="card">
        <div class="card-head"><span class="bar"></span><h3>访问趋势</h3><span class="card-sub">{{ trendUnit }} PV / UV</span></div>
        <div v-if="series.length" class="trend">
          <div
            v-for="(d, i) in series"
            :key="d.label"
            class="trend-col"
            :title="`${d.label}  PV ${d.pv} / UV ${d.uv}`"
          >
            <div class="trend-bars">
              <div class="trend-bar pv" :style="{ height: barPct(d.pv) + '%' }"></div>
              <div class="trend-bar uv" :style="{ height: barPct(d.uv) + '%' }"></div>
            </div>
            <span class="trend-x">{{ showLabel(i) ? (days === 0 ? d.label : d.label.slice(5)) : '' }}</span>
          </div>
        </div>
        <n-empty v-else description="暂无访问数据" :show-icon="false" class="card-empty" />
        <div class="legend">
          <span><i class="dot pv"></i>PV 访问量</span>
          <span><i class="dot uv"></i>UV 访客数</span>
        </div>
      </section>

      <!-- 来源 + 登录 IP -->
      <section class="two-col">
        <div class="card">
          <div class="card-head"><span class="bar"></span><h3>来源</h3><span class="card-sub">外部引用</span></div>
          <div v-if="data?.topReferers?.length" class="list">
            <div v-for="r in data.topReferers" :key="r.host" class="row">
              <span class="row-name">{{ r.host }}</span>
              <span class="row-val">{{ r.count }}</span>
            </div>
          </div>
          <n-empty v-else description="暂无外部来源" :show-icon="false" class="card-empty" />
        </div>

        <div class="card">
          <div class="card-head"><span class="bar"></span><h3>登录 IP</h3><span class="card-sub">最新 20 条</span></div>
          <div v-if="data?.loginLogs?.length" class="list">
            <div v-for="(l, i) in data.loginLogs" :key="i" class="row">
              <span class="row-name">{{ l.ip }}<i class="row-sub">{{ l.username }}</i></span>
              <span class="row-val">{{ fmtTime(l.created_at) }}</span>
            </div>
          </div>
          <n-empty v-else description="暂无登录记录" :show-icon="false" class="card-empty" />
        </div>
      </section>
    </n-spin>
  </div>
</template>

<style scoped>
.an {
  max-width: 1200px;
  margin: 0 auto;
  padding: 8px 4px 24px;
  color: var(--text-1);
}
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
/* 概况卡（沿用 Dashboard 视觉） */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
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
.stat-note {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
  margin: -6px 0 16px;
}
/* 通用卡片 */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  padding: 18px 20px 20px;
  box-shadow: var(--shadow-card);
  margin-bottom: 16px;
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
/* 趋势图（纯 CSS 柱状） */
.trend {
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 180px;
  padding-top: 6px;
}
.trend-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.trend-bars {
  position: relative;
  flex: 1;
  border-bottom: 1px solid var(--border-soft);
}
.trend-bar {
  position: absolute;
  bottom: 0;
  width: 42%;
  max-width: 9px;
  border-radius: 3px 3px 0 0;
  min-height: 1px;
  transition: height 0.3s ease;
}
.trend-bar.pv {
  left: 6%;
  background: var(--accent);
}
.trend-bar.uv {
  right: 6%;
  background: #5b8def;
}
.trend-col:hover .trend-bar {
  filter: brightness(1.12);
}
.trend-x {
  height: 14px;
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
  text-align: center;
  line-height: 14px;
}
.legend {
  display: flex;
  gap: 18px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-2);
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}
.dot.pv {
  background: var(--accent);
}
.dot.uv {
  background: #5b8def;
}
/* 两列 */
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.two-col .card {
  margin-bottom: 0;
}
/* 列表 */
.list {
  display: flex;
  flex-direction: column;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border-soft);
}
.row:last-child {
  border-bottom: none;
}
.row-name {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  color: var(--text-1);
}
.row-sub {
  font-style: normal;
  font-size: 11px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-val {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
@media (max-width: 920px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .two-col {
    grid-template-columns: 1fr;
  }
}
</style>