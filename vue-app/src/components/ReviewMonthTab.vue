<template>
  <div class="rp-month-tab">
    <!-- Average Score -->
    <div class="rp-section">
      <div class="rp-sec-head">📊 月度评分</div>
      <div v-if="rs.activeDays === 0" class="rp-empty-state">
        <div class="rp-empty-icon">📋</div>
        <div class="rp-empty-text">本月暂无日程数据</div>
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

    <!-- Heatmap -->
    <div class="rp-section" v-if="rs.activeDays > 0">
      <div class="rp-sec-head">🗓 每日分数热力图</div>
      <ScoreHeatmap :year="mStart.getFullYear()" :month="mStart.getMonth()" :scores="heatmapScores" />
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

    <!-- Task Completion -->
    <div class="rp-section" v-if="taskStats.total > 0">
      <div class="rp-sec-head">✅ 任务完成率</div>
      <div class="stat-row">
        <span class="label">本月任务</span>
        <span class="val">{{ taskStats.done }}/{{ taskStats.total }}</span>
      </div>
      <div class="tag-bar-wrap" style="margin-top:6px">
        <div class="tag-bar-seg" :style="{ width: taskStats.rate + '%', background: 'var(--green)' }"></div>
        <div class="tag-bar-seg" :style="{ width: (100 - taskStats.rate) + '%', background: 'var(--border-light)' }"></div>
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

    <!-- Reflections -->
    <div class="rp-section" v-if="reflections.length > 0">
      <div class="rp-sec-head">💭 本月反思 ({{ reflections.length }})</div>
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
import { useTaskStore } from '../stores/tasks'
import { useUiStore } from '../stores/ui'
import { dateKey, monthStart, monthEnd, WD } from '../utils/time'
import { computeRangeStats, reflectionsForRange, fmtMins, TAG_COLORS, TAG_NAMES } from '../composables/useReviewStats'
import SparkLine from './SparkLine.vue'
import ScoreHeatmap from './ScoreHeatmap.vue'

const eventStore = useEventStore()
const taskStore = useTaskStore()
const ui = useUiStore()
const tagColors = TAG_COLORS
const tagNames = TAG_NAMES
const openRefls = reactive({})

const mStart = computed(() => monthStart(ui.curDate))
const mEnd = computed(() => monthEnd(ui.curDate))

const rs = computed(() => computeRangeStats(eventStore, mStart.value, mEnd.value))

// Heatmap scores
const heatmapScores = computed(() => {
  const map = {}
  rs.value.dailyStats.forEach(s => {
    map[s.dateKey] = { score: s.score, active: s.planned.length > 0 }
  })
  return map
})

// Trend
const trendData = computed(() => rs.value.dailyStats.map(s => s.score))
const trendLabels = computed(() => rs.value.dailyStats.map(s => String(new Date(s.dateKey + 'T00:00:00').getDate())))

function trendTooltip(i, val) {
  const dk = rs.value.dailyStats[i]?.dateKey || ''
  return `${dk.slice(5)}: ${val}分`
}

const circ = 2 * Math.PI * 21
const offset = computed(() => circ - (rs.value.avgScore / 100) * circ)

// Task completion for this month
const taskStats = computed(() => {
  const mKey = dateKey(mStart.value).slice(0, 7) // 'YYYY-MM'
  const tasks = taskStore.weeklyTasks.filter(t => t.deadline && t.deadline.startsWith(mKey))
  const done = tasks.filter(t => t.done).length
  return { total: tasks.length, done, rate: tasks.length ? Math.round(done / tasks.length * 100) : 0 }
})

const reflections = computed(() => reflectionsForRange(mStart.value, mEnd.value))

function shortDate(dk) {
  const parts = dk.split('-')
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`
}

function toggleRefl(dk) {
  openRefls[dk] = !openRefls[dk]
}
</script>
