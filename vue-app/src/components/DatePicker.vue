<template>
  <div class="dp-trigger-wrap" ref="triggerEl">
    <div :class="['dp-trigger', { 'dp-active': open, 'dp-empty': !modelValue }]" @click.stop="toggle">
      <span class="dp-text">{{ displayText }}</span>
      <span class="dp-icon">📅</span>
    </div>
    <Teleport to="body">
      <div v-if="open" ref="panelEl" class="dp-panel" :style="panelStyle" @click.stop>
        <div class="dp-header">
          <button class="dp-nav" @click="changeYear(-1)">«</button>
          <button class="dp-nav" @click="changeMonth(-1)">‹</button>
          <span class="dp-title">{{ viewYear }}年{{ viewMonth + 1 }}月</span>
          <button class="dp-nav" @click="changeMonth(1)">›</button>
          <button class="dp-nav" @click="changeYear(1)">»</button>
        </div>
        <div class="dp-weekdays">
          <span v-for="w in weekDays" :key="w">{{ w }}</span>
        </div>
        <div class="dp-days">
          <button
            v-for="d in dayCells" :key="d.key"
            :class="['dp-day', { other: d.other, today: d.isToday, selected: d.key === modelValue }]"
            @click="selectDate(d.key)"
          >{{ d.num }}</button>
        </div>
        <div class="dp-footer">
          <button class="dp-today-btn" @click="selectDate(todayKey)">今天</button>
          <span class="dp-footer-spacer"></span>
          <button v-if="modelValue" class="dp-clear-btn" @click="clear">清除</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { dateKey } from '../utils/time'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '选择日期' }
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const triggerEl = ref(null)
const panelEl = ref(null)
const panelStyle = ref({})

const viewYear = ref(new Date().getFullYear())
const viewMonth = ref(new Date().getMonth())

const weekDays = ['一', '二', '三', '四', '五', '六', '日']
const todayKey = dateKey(new Date())

const displayText = computed(() => {
  if (!props.modelValue) return props.placeholder
  const d = new Date(props.modelValue + 'T00:00:00')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
})

const dayCells = computed(() => {
  const y = viewYear.value, m = viewMonth.value
  const firstDay = (new Date(y, m, 1).getDay() || 7) - 1
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const daysInPrev = new Date(y, m, 0).getDate()
  const cells = []
  // Previous month
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i
    const key = fmtKey(new Date(y, m - 1, d))
    cells.push({ num: d, key, other: true, isToday: key === todayKey })
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const key = fmtKey(new Date(y, m, d))
    cells.push({ num: d, key, other: false, isToday: key === todayKey })
  }
  // Next month padding
  const total = firstDay + daysInMonth
  const remaining = total % 7 === 0 ? 0 : 7 - total % 7
  for (let d = 1; d <= remaining; d++) {
    const key = fmtKey(new Date(y, m + 1, d))
    cells.push({ num: d, key, other: true, isToday: key === todayKey })
  }
  return cells
})

function fmtKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toggle() {
  open.value = !open.value
  if (open.value) {
    // Set view to current value's month
    if (props.modelValue) {
      const d = new Date(props.modelValue + 'T00:00:00')
      viewYear.value = d.getFullYear()
      viewMonth.value = d.getMonth()
    }
    nextTick(position)
  }
}

function position() {
  if (!triggerEl.value) return
  const r = triggerEl.value.getBoundingClientRect()
  let top = r.bottom + 6, left = r.left
  if (top + 320 > window.innerHeight) top = r.top - 326
  if (left + 280 > window.innerWidth) left = window.innerWidth - 286
  if (left < 4) left = 4
  panelStyle.value = { top: top + 'px', left: left + 'px' }
}

function changeMonth(delta) { viewMonth.value += delta; normalize() }
function changeYear(delta) { viewYear.value += delta }
function normalize() {
  if (viewMonth.value < 0) { viewMonth.value = 11; viewYear.value-- }
  if (viewMonth.value > 11) { viewMonth.value = 0; viewYear.value++ }
}

function selectDate(key) { emit('update:modelValue', key); open.value = false }
function clear() { emit('update:modelValue', ''); open.value = false }

function onClickOutside(e) {
  if (triggerEl.value?.contains(e.target)) return
  if (panelEl.value?.contains(e.target)) return
  open.value = false
}

onMounted(() => document.addEventListener('mousedown', onClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside))
</script>

<style>
.dp-trigger-wrap { display: inline-block; }
.dp-trigger {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 8px; border: 1px solid transparent; border-radius: var(--radius);
  cursor: pointer; transition: var(--transition); font-size: 13px; color: var(--text);
  user-select: none;
}
.dp-trigger:hover { background: var(--bg-hover); }
.dp-trigger.dp-active { border-color: var(--blue); background: var(--bg); }
.dp-trigger.dp-empty .dp-text { color: var(--text-light); }
.dp-icon { font-size: 13px; }
.dp-panel {
  position: fixed; z-index: 400; width: 280px; background: var(--bg);
  border: 1px solid var(--border-light); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg); padding: 12px; animation: dpFadeIn .15s ease;
}
@keyframes dpFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; } }
.dp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.dp-nav {
  border: none; background: transparent; cursor: pointer; font-size: 14px;
  color: var(--text-secondary); padding: 4px 8px; border-radius: var(--radius);
  transition: var(--transition);
}
.dp-nav:hover { background: var(--bg-hover); color: var(--text); }
.dp-title { font-size: 14px; font-weight: 600; color: var(--text); }
.dp-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; margin-bottom: 4px; }
.dp-weekdays span { font-size: 11px; color: var(--text-light); padding: 4px; font-weight: 500; }
.dp-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.dp-day {
  padding: 6px; text-align: center; border: none; background: transparent;
  border-radius: var(--radius); cursor: pointer; font-size: 13px; color: var(--text);
  transition: var(--transition);
}
.dp-day:hover { background: var(--bg-hover); }
.dp-day.other { color: var(--text-light); opacity: .5; }
.dp-day.today { font-weight: 600; color: var(--blue); }
.dp-day.selected { background: var(--blue); color: #fff; font-weight: 600; }
.dp-footer { display: flex; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light); }
.dp-footer-spacer { flex: 1; }
.dp-today-btn, .dp-clear-btn {
  border: none; background: transparent; cursor: pointer; font-size: 12px;
  color: var(--blue); padding: 4px 8px; border-radius: var(--radius);
  transition: var(--transition); font-family: var(--font);
}
.dp-today-btn:hover, .dp-clear-btn:hover { background: var(--blue-bg); }
.dp-clear-btn { color: var(--text-light); }
</style>
