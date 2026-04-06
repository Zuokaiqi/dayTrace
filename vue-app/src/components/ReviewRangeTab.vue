<template>
  <div class="rp-range-tab">
    <!-- Date Range Picker -->
    <div class="rp-section">
      <div class="range-picker-row">
        <span class="range-label">从</span>
        <DatePicker v-model="startKey" placeholder="开始日期" />
        <span class="range-label">至</span>
        <DatePicker v-model="endKey" placeholder="结束日期" />
      </div>
      <div class="range-presets">
        <button v-for="p in presets" :key="p.label"
          :class="['range-preset-btn', { active: activePreset === p.label }]"
          @click="applyPreset(p)">{{ p.label }}</button>
      </div>
    </div>

    <template v-if="valid">
      <!-- Average Score -->
      <div class="rp-section">
        <div class="rp-sec-head">📊 范围评分 ({{ dayCount }}天)</div>
        <div v-if="rs.activeDays === 0" class="rp-empty-state">
          <div class="rp-empty-icon">📋</div>
          <div class="rp-empty-text">所选范围暂无日程数据</div>
        </div>
        <template v-else>
          <div class="score-wrap">
            <div class="score-ring">
              <svg width="52" height="52" viewBox="0 0 48 48">
                <circle class="ring-bg" cx="24" cy="24" r="21"/>
                <circle class="ring-fg" cx="24" cy="24" r="21" :stroke="rs.scoreColor"
                  :stroke-dasharray="circ" :stroke-dashoffset="offset"/>
              </svg>
              <div class="score-num" :style="{ color: rs.scoreColor }">{{ rs.avgScore }}</div>
            </div>
            <div class="score-detail">
              执行率 {{ rs.avgExecRate }}%<br>
              准时率 {{ rs.avgOnTimeRate }}%<br>
              {{ rs.activeDays }} 个活跃天
            </div>
          </div>
        </template>
      </div>

      <!-- Score Trend -->
      <div class="rp-section" v-if="rs.activeDays > 0">
        <div class="rp-sec-head">📈 分数趋势</div>
        <SparkLine :data="trendData" :labels="trendLabels" color="var(--blue)" :height="80"
          :tooltipFn="trendTooltip" />
      </div>

      <!-- Stats -->
      <div class="rp-section" v-if="rs.activeDays > 0">
        <div class="rp-sec-head">📋 数据汇总</div>
        <div class="stat-highlight">
          <div class="stat-card">
            <div class="stat-card-val">{{ rs.totals.planned }}</div>
            <div class="stat-card-label">计划</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-val" style="color:var(--green)">{{ rs.totals.executed }}</div>
            <div class="stat-card-label">已执行</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-val" style="color:var(--orange)">{{ rs.totals.unplanned }}</div>
            <div class="stat-card-label">临时</div>
          </div>
        </div>
        <div class="stat-row"><span class="label">平均偏差</span><span :class="['val', rs.avgDeviation > 15 ? 'warn' : 'good']">±{{ rs.avgDeviation }}min</span></div>
        <div class="stat-row"><span class="label">连续打卡</span><span class="val good">{{ rs.streak }} 天</span></div>
      </div>

      <!-- Tag Totals -->
      <div class="rp-section" v-if="Object.keys(rs.tagTotals).length > 0">
        <div class="rp-sec-head">🕐 时间分布</div>
        <div class="tag-bar-wrap">
          <div v-for="(mins, tag) in rs.tagTotals" :key="tag" class="tag-bar-seg"
            :style="{ width: (mins / rs.tagGrandTotal * 100) + '%', background: tagColors[tag] || 'var(--text-light)' }"></div>
        </div>
        <div class="tag-legend">
          <span v-for="(mins, tag) in rs.tagTotals" :key="tag">
            <span class="tag-dot" :style="{ background: tagColors[tag] || 'var(--text-light)' }"></span>
            {{ tagNames[tag] || tag }} {{ fmtMins(mins) }}
          </span>
        </div>
      </div>

      <!-- Best / Worst -->
      <div class="rp-section" v-if="rs.bestDay && rs.worstDay && rs.activeDays > 1">
        <div class="best-worst-row">
          <div class="bw-card best">
            <div class="bw-card-label">最佳日</div>
            <div class="bw-card-val">{{ rs.bestDay.dateKey.slice(5) }} · {{ rs.bestDay.score }}分</div>
          </div>
          <div class="bw-card worst">
            <div class="bw-card-label">最差日</div>
            <div class="bw-card-val">{{ rs.worstDay.dateKey.slice(5) }} · {{ rs.worstDay.score }}分</div>
          </div>
        </div>
      </div>

      <!-- Insights -->
      <InsightsSection v-if="rs.activeDays > 0" :hourly="hourly" :bias="bias" :patterns="patterns" />
    </template>

    <div v-else-if="startKey && endKey" class="rp-section">
      <div class="rp-empty-state">
        <div class="rp-empty-icon">⚠️</div>
        <div class="rp-empty-text">结束日期需晚于开始日期<br>且范围不超过 365 天</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useEventStore } from '../stores/events'
import { dateKey } from '../utils/time'
import { computeRangeStats, computeHourlyProfile, computeDurationBias, detectPatterns, fmtMins, TAG_COLORS, TAG_NAMES } from '../composables/useReviewStats'
import SparkLine from './SparkLine.vue'
import DatePicker from './DatePicker.vue'
import InsightsSection from './InsightsSection.vue'

const eventStore = useEventStore()
const tagColors = TAG_COLORS
const tagNames = TAG_NAMES

const startKey = ref('')
const endKey = ref('')
const activePreset = ref('')

const presets = [
  { label: '最近7天', days: 7 },
  { label: '最近30天', days: 30 },
  { label: '最近90天', days: 90 },
  { label: '本季度', days: 0 }
]

function applyPreset(p) {
  activePreset.value = p.label
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  endKey.value = dateKey(today)

  if (p.days > 0) {
    const start = new Date(today)
    start.setDate(start.getDate() - p.days + 1)
    startKey.value = dateKey(start)
  } else {
    // This quarter
    const q = Math.floor(today.getMonth() / 3)
    const qStart = new Date(today.getFullYear(), q * 3, 1)
    startKey.value = dateKey(qStart)
  }
}

// Initialize with "最近7天"
applyPreset(presets[0])

const startDate = computed(() => startKey.value ? new Date(startKey.value + 'T00:00:00') : null)
const endDate = computed(() => endKey.value ? new Date(endKey.value + 'T00:00:00') : null)

const dayCount = computed(() => {
  if (!startDate.value || !endDate.value) return 0
  return Math.round((endDate.value - startDate.value) / 86400000) + 1
})

const valid = computed(() => {
  if (!startDate.value || !endDate.value) return false
  return endDate.value >= startDate.value && dayCount.value <= 365
})

const rs = computed(() => {
  if (!valid.value) return { activeDays: 0, avgScore: 0, scoreColor: 'var(--red)', totals: { planned: 0, executed: 0, unplanned: 0 }, tagTotals: {}, tagGrandTotal: 1 }
  return computeRangeStats(eventStore, startDate.value, endDate.value)
})

const hourly = computed(() => rs.value.dailyStats ? computeHourlyProfile(rs.value.dailyStats) : [])
const bias = computed(() => rs.value.dailyStats ? computeDurationBias(rs.value.dailyStats) : { byTag: {}, overall: { count: 0 } })
const patterns = computed(() => rs.value.dailyStats ? detectPatterns(rs.value, rs.value.dailyStats) : [])

const trendData = computed(() => rs.value.dailyStats?.map(s => s.score) || [])
const trendLabels = computed(() => {
  if (!rs.value.dailyStats) return []
  return rs.value.dailyStats.map(s => {
    const d = new Date(s.dateKey + 'T00:00:00').getDate()
    return String(d)
  })
})

function trendTooltip(i, val) {
  const dk = rs.value.dailyStats?.[i]?.dateKey || ''
  return `${dk.slice(5)}: ${val}分`
}

const circ = 2 * Math.PI * 21
const offset = computed(() => circ - ((rs.value.avgScore || 0) / 100) * circ)
</script>
