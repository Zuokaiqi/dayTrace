<template>
  <div class="rp-week-tab">
    <!-- Average Score -->
    <div class="rp-section">
      <div class="rp-sec-head">📊 周平均评分</div>
      <div v-if="rs.activeDays === 0" class="rp-empty-state">
        <div class="rp-empty-icon">📋</div>
        <div class="rp-empty-text">本周暂无日程数据</div>
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
            基于 {{ rs.activeDays }} 个活跃天
          </div>
        </div>
      </template>
    </div>

    <!-- Score Trend -->
    <div class="rp-section" v-if="rs.activeDays > 0">
      <div class="rp-sec-head">📈 每日分数趋势</div>
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
    </div>

    <!-- Daily Tag Distribution -->
    <div class="rp-section" v-if="rs.activeDays > 0">
      <div class="rp-sec-head">🕐 每日时间分布</div>
      <div class="multi-tag-bars">
        <div v-for="(day, i) in rs.dailyStats" :key="i" class="multi-tag-bar">
          <template v-if="day.tagTotal > 1">
            <div v-for="(mins, tag) in day.tagMins" :key="tag" class="multi-tag-seg"
              :style="{ height: (mins / day.tagTotal * 100) + '%', background: tagColors[tag] || 'var(--text-light)' }"></div>
          </template>
          <div class="multi-tag-label">{{ trendLabels[i] }}</div>
        </div>
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
          <div class="bw-card-val">{{ shortDate(rs.bestDay.dateKey) }} · {{ rs.bestDay.score }}分</div>
        </div>
        <div class="bw-card worst">
          <div class="bw-card-label">最差日</div>
          <div class="bw-card-val">{{ shortDate(rs.worstDay.dateKey) }} · {{ rs.worstDay.score }}分</div>
        </div>
      </div>
    </div>

    <!-- Insights -->
    <InsightsSection v-if="rs.activeDays > 0" :hourly="hourly" :bias="bias" :patterns="patterns" />

    <!-- Reflections -->
    <div class="rp-section" v-if="reflections.length > 0">
      <div class="rp-sec-head">💭 本周反思</div>
      <div class="refl-list">
        <div v-for="r in reflections" :key="r.dateKey" class="refl-item" @click="toggleRefl(r.dateKey)">
          <div class="refl-item-header">
            <span>{{ shortDate(r.dateKey) }}</span>
            <span :class="['refl-item-toggle', { open: openRefls[r.dateKey] }]">▶</span>
          </div>
          <div v-if="openRefls[r.dateKey]" class="refl-item-body">{{ r.text }}{{ r.textTmr ? '\n\n🎯 ' + r.textTmr : '' }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { useEventStore } from '../stores/events'
import { useUiStore } from '../stores/ui'
import { weekStart, WD } from '../utils/time'
import { computeRangeStats, computeHourlyProfile, computeDurationBias, detectPatterns, reflectionsForRange, fmtMins, TAG_COLORS, TAG_NAMES } from '../composables/useReviewStats'
import SparkLine from './SparkLine.vue'
import InsightsSection from './InsightsSection.vue'

const eventStore = useEventStore()
const ui = useUiStore()
const tagColors = TAG_COLORS
const tagNames = TAG_NAMES
const openRefls = reactive({})

const wStart = computed(() => weekStart(ui.curDate))
const wEnd = computed(() => {
  const d = new Date(wStart.value)
  d.setDate(d.getDate() + 6)
  return d
})

const rs = computed(() => computeRangeStats(eventStore, wStart.value, wEnd.value))

const trendLabels = ['一', '二', '三', '四', '五', '六', '日']
const trendData = computed(() => rs.value.dailyStats.map(s => s.score))

function trendTooltip(i, val, label) {
  const dk = rs.value.dailyStats[i]?.dateKey || ''
  return `周${label} (${dk.slice(5)}): ${val}分`
}

const circ = 2 * Math.PI * 21
const offset = computed(() => circ - (rs.value.avgScore / 100) * circ)

const hourly = computed(() => computeHourlyProfile(rs.value.dailyStats))
const bias = computed(() => computeDurationBias(rs.value.dailyStats))
const patterns = computed(() => detectPatterns(rs.value, rs.value.dailyStats))

const reflections = computed(() => reflectionsForRange(wStart.value, wEnd.value))

function shortDate(dk) {
  const parts = dk.split('-')
  const d = new Date(dk + 'T00:00:00')
  const dow = WD[d.getDay()]
  return `${parseInt(parts[1])}/${parseInt(parts[2])} 周${dow}`
}

function toggleRefl(dk) {
  openRefls[dk] = !openRefls[dk]
}
</script>
