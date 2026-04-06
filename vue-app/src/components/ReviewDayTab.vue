<template>
  <div class="rp-day-tab">
    <!-- Score -->
    <div class="rp-section">
      <div class="rp-sec-head">📊 执行评分</div>
      <div v-if="stats.planned.length === 0" class="rp-empty-state">
        <div class="rp-empty-icon">📋</div>
        <div class="rp-empty-text">今天还没有安排日程</div>
      </div>
      <template v-else>
        <div class="score-wrap">
          <div class="score-ring">
            <svg width="52" height="52" viewBox="0 0 48 48">
              <circle class="ring-bg" cx="24" cy="24" r="21"/>
              <circle class="ring-fg" cx="24" cy="24" r="21" :stroke="stats.scoreColor"
                :stroke-dasharray="circ" :stroke-dashoffset="offset"/>
            </svg>
            <div class="score-num" :style="{ color: stats.scoreColor }">{{ stats.score }}</div>
          </div>
          <div class="score-right">
            <div class="score-detail">执行率 {{ stats.execRate }}%<br>准时率 {{ stats.onTimeRate }}%<br>利用率 {{ stats.util }}%</div>
            <div v-if="streak > 0" class="streak-badge">🔥 连续 {{ streak }} 天</div>
          </div>
        </div>
        <div v-if="delta !== null" class="score-delta" :class="delta >= 0 ? 'delta-up' : 'delta-down'">
          <span class="delta-arrow">{{ delta >= 0 ? '▲' : '▼' }}</span>
          {{ delta >= 0 ? '+' : '' }}{{ delta }} vs 昨日
        </div>
      </template>
    </div>
    <!-- Stats -->
    <div class="rp-section" v-if="stats.planned.length > 0">
      <div class="rp-sec-head">📋 数据概览</div>
      <div class="stat-row"><span class="label">计划任务</span><span class="val">{{ stats.planned.length }}</span></div>
      <div class="stat-row"><span class="label">已执行</span><span class="val good">{{ stats.withA.length }}</span></div>
      <div class="stat-row"><span class="label">未执行</span><span class="val warn">{{ stats.planned.length - stats.withA.length }}</span></div>
      <div class="stat-row"><span class="label">临时插入</span><span class="val neutral">{{ stats.unp.length }}</span></div>
      <div class="stat-row"><span class="label">平均偏差</span><span :class="['val', stats.avg > 15 ? 'warn' : 'good']">±{{ stats.avg }}min</span></div>
    </div>
    <!-- Tag distribution -->
    <div class="rp-section" v-if="Object.keys(stats.tagMins).length > 0">
      <div class="rp-sec-head">🕐 时间分布</div>
      <div class="tag-bar-wrap">
        <div v-for="(mins, tag) in stats.tagMins" :key="tag" class="tag-bar-seg"
          :style="{ width: (mins / stats.tagTotal * 100) + '%', background: tagColors[tag] || 'var(--text-light)' }"></div>
      </div>
      <div class="tag-legend">
        <span v-for="(mins, tag) in stats.tagMins" :key="tag">
          <span class="tag-dot" :style="{ background: tagColors[tag] || 'var(--text-light)' }"></span>
          {{ tagNames[tag] || tag }} {{ fmtMins(mins) }}
        </span>
      </div>
    </div>
    <!-- Reflection -->
    <div class="rp-section">
      <div class="rp-sec-head">💭 今日反思</div>
      <div class="reflect-prompt">今天哪些计划被打乱了？根本原因是什么？</div>
      <textarea class="reflect-ta" v-model="refl1" placeholder="写下你的思考..." rows="2"></textarea>
      <div class="reflect-prompt" style="margin-top:6px">🎯 明天有什么可以改进的？</div>
      <textarea class="reflect-ta" v-model="refl2" placeholder="明日调整计划..." rows="2"></textarea>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useEventStore } from '../stores/events'
import { useUiStore } from '../stores/ui'
import { dateKey } from '../utils/time'
import { authFetch } from '../utils/api'
import { computeDayStats, fmtMins, TAG_COLORS, TAG_NAMES } from '../composables/useReviewStats'

const eventStore = useEventStore()
const ui = useUiStore()
const tagColors = TAG_COLORS
const tagNames = TAG_NAMES

const dk = computed(() => dateKey(ui.curDate))
const dayEvs = computed(() => eventStore.eventsForDate(ui.curDate))
const stats = computed(() => computeDayStats(dayEvs.value))

// Score ring
const circ = 2 * Math.PI * 21
const offset = computed(() => circ - (stats.value.score / 100) * circ)

// Streak: consecutive days with score >= 60 ending at curDate
const streak = computed(() => {
  let count = 0
  const d = new Date(ui.curDate)
  d.setHours(0, 0, 0, 0)
  for (let i = 0; i < 365; i++) {
    const evs = eventStore.eventsForDate(d)
    const s = computeDayStats(evs)
    if (s.planned.length === 0) { d.setDate(d.getDate() - 1); continue }
    if (s.score >= 60) count++
    else break
    d.setDate(d.getDate() - 1)
  }
  return count
})

// Yesterday comparison
const delta = computed(() => {
  if (stats.value.planned.length === 0) return null
  const yesterday = new Date(ui.curDate)
  yesterday.setDate(yesterday.getDate() - 1)
  const yEvs = eventStore.eventsForDate(yesterday)
  const yStats = computeDayStats(yEvs)
  if (yStats.planned.length === 0) return null
  return stats.value.score - yStats.score
})

// Reflections
const refl1 = ref(''), refl2 = ref('')
let _reflTimer = null
function loadRefl() {
  refl1.value = localStorage.getItem('dt_refl_' + dk.value) || ''
  refl2.value = localStorage.getItem('dt_refl_' + dk.value + '_tmr') || ''
}
function saveRefl(key, val) {
  localStorage.setItem('dt_refl_' + key, val)
  clearTimeout(_reflTimer)
  _reflTimer = setTimeout(() => {
    authFetch('/api/reflections', { method: 'POST', body: JSON.stringify({ [key]: val }) }).catch(() => {})
  }, 800)
}
watch(dk, loadRefl, { immediate: true })
watch(refl1, v => saveRefl(dk.value, v))
watch(refl2, v => saveRefl(dk.value + '_tmr', v))
</script>
