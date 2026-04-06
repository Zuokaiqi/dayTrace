<template>
  <div class="goals-nav">
    <button class="goals-nav-btn" @click="prevMonth">‹</button>
    <span class="goals-nav-title">{{ monthLabel }}</span>
    <button class="goals-nav-btn" @click="nextMonthNav">›</button>
  </div>
  <div class="gantt-v2">
    <div class="gv2-header">
      <div class="gv2-label-col"></div>
      <div class="gv2-timeline">
        <div class="gv2-days" :style="{ '--total-days': totalDays }">
          <div
            v-for="d in dayHeaders" :key="d.num"
            :class="['gv2-day', { we: d.isWe, td: d.isTd }]"
          >{{ d.num }}</div>
        </div>
      </div>
    </div>
    <div class="gv2-body">
      <div v-if="!goals.length" class="goals-empty" style="padding:30px">本月无目标</div>
      <template v-for="g in goals" :key="g.id">
        <div class="gv2-row gv2-parent">
          <div class="gv2-label-col gv2-parent-label">
            <span class="gv2-dot" :style="{ background: tagColor(g.tag) }"></span>{{ g.title }}
          </div>
          <div class="gv2-timeline">
            <div class="gv2-track" :style="{ '--total-days': totalDays }">
              <div v-if="todayDay > 0" class="gv2-today-line" :style="{ left: todayPct + '%' }"></div>
            </div>
          </div>
        </div>
        <div v-for="w in goalTasks(g.id)" :key="w.id" class="gv2-row gv2-child">
          <div class="gv2-label-col gv2-child-label">{{ w.title }}</div>
          <div class="gv2-timeline">
            <div class="gv2-track" :style="{ '--total-days': totalDays }">
              <div v-if="todayDay > 0" class="gv2-today-line" :style="{ left: todayPct + '%' }"></div>
              <div
                v-if="calcBar(w)"
                :class="['gv2-bar', { 'gv2-bar-done': w.done }]"
                :style="barStyle(w, g.tag)"
              >
                <span v-if="calcBar(w).wide" class="gv2-bar-label">{{ w.title }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useTaskStore } from '../stores/tasks'
import { TAG_COLORS, dateKey, sameDay } from '../utils/time'

const taskStore = useTaskStore()

const goalsMonth = ref((() => {
  const now = new Date()
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
})())

const monthLabel = computed(() => {
  const [y, m] = goalsMonth.value.split('-')
  return y + '年' + parseInt(m) + '月'
})

function prevMonth() {
  const [y, m] = goalsMonth.value.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  goalsMonth.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}
function nextMonthNav() {
  const [y, m] = goalsMonth.value.split('-').map(Number)
  const d = new Date(y, m, 1)
  goalsMonth.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

const totalDays = computed(() => {
  const [y, m] = goalsMonth.value.split('-').map(Number)
  return new Date(y, m, 0).getDate()
})

const todayDay = computed(() => {
  const [y, m] = goalsMonth.value.split('-').map(Number)
  const today = new Date()
  return (today.getFullYear() === y && today.getMonth() === m - 1) ? today.getDate() : -1
})

const todayPct = computed(() => ((todayDay.value - 0.5) / totalDays.value) * 100)

const dayHeaders = computed(() => {
  const [y, m] = goalsMonth.value.split('-').map(Number)
  const today = new Date()
  const result = []
  for (let d = 1; d <= totalDays.value; d++) {
    const dt = new Date(y, m - 1, d)
    result.push({
      num: d,
      isWe: dt.getDay() === 0 || dt.getDay() === 6,
      isTd: d === todayDay.value
    })
  }
  return result
})

const goals = computed(() => taskStore.monthlyGoals.filter(g => g.month === goalsMonth.value))

function goalTasks(gid) { return taskStore.weeklyTasks.filter(w => w.monthGoalId === gid) }
function tagColor(tag) { return TAG_COLORS[tag] || 'var(--blue)' }

function calcBar(w) {
  if (!w.startDate && !w.deadline) return null
  const [y, m] = goalsMonth.value.split('-').map(Number)
  const ms = new Date(y, m - 1, 1)
  const s = w.startDate ? new Date(w.startDate + 'T00:00:00') : (w.deadline ? new Date(w.deadline + 'T00:00:00') : ms)
  const e = w.deadline ? new Date(w.deadline + 'T00:00:00') : new Date(y, m - 1, totalDays.value)
  const startDay = Math.max(1, Math.round((s - ms) / 86400000) + 1)
  const endDay = Math.min(totalDays.value, Math.round((e - ms) / 86400000) + 1)
  if (endDay < 1 || startDay > totalDays.value) return null
  return { startDay, endDay, wide: endDay - startDay >= 3 }
}

function barStyle(w, parentTag) {
  const bar = calcBar(w)
  if (!bar) return { display: 'none' }
  const left = ((bar.startDay - 1) / totalDays.value) * 100
  const width = ((bar.endDay - bar.startDay + 1) / totalDays.value) * 100
  const color = w.done ? 'var(--green)' : (TAG_COLORS[parentTag] || 'var(--blue)')
  return {
    left: left + '%',
    width: Math.max(width, 100 / totalDays.value) + '%',
    background: color
  }
}
</script>
