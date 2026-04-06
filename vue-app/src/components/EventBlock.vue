<template>
  <div
    :class="['ev', evClass]"
    :style="blockStyle"
    :data-id="ev.id"
    :data-col="colType"
    @click.stop="$emit('click-event', ev.id, colType, $event)"
    @contextmenu.prevent="$emit('ctx-event', ev.id, colType, $event)"
  >
    <!-- Short event: inline layout -->
    <template v-if="durMin <= 30">
      <div class="ev-inline">
        <span class="ev-title">{{ ev.title }}</span>
        <span class="ev-time">{{ timeData.start }}–{{ timeData.end }}</span>
      </div>
    </template>
    <!-- Normal event -->
    <template v-else>
      <div class="ev-title">{{ ev.title || timeData.start + '–' + timeData.end }}</div>
      <div v-if="displayH > 30" class="ev-time">{{ timeData.start }}–{{ timeData.end }}</div>
    </template>
    <span v-if="badge" :class="['ev-badge', badge.cls]">{{ badge.text }}</span>
    <span v-if="ev.reminder" class="ev-reminder-icon" :title="`提前${ev.reminder >= 60 ? (ev.reminder / 60) + '小时' : ev.reminder + '分钟'}提醒`">🔔</span>
    <div v-if="showResize" class="resize-h"></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { t2m, pos, hgt, devM, SL } from '../utils/time'

const emit = defineEmits(['click-event', 'ctx-event'])

const props = defineProps({
  ev: Object,
  col: { type: String, default: null },
  layout: { type: Object, default: null },
  showResize: { type: Boolean, default: false }
})

const GAP = 2

const colType = computed(() => {
  if (props.col) return props.col
  return props.ev.actual ? 'actual' : 'plan'
})

const timeData = computed(() => {
  if (props.col === 'plan') return props.ev.plan
  if (props.col === 'actual') return props.ev.actual
  return props.ev.actual || props.ev.plan
})

const evClass = computed(() => {
  const ev = props.ev
  if (props.col === 'plan') return 'plan-ev'
  if (!ev.actual) return 'plan-only-ev'
  if (!ev.plan) return 'unplanned-ev'
  const dv = devM(ev.plan, ev.actual)
  if (dv > 10) return 'delayed-ev'
  if (dv < -5) return 'early-ev'
  return 'actual-ev'
})

const badge = computed(() => {
  if (props.col !== 'actual' || !props.ev.actual) return null
  const ev = props.ev
  if (!ev.plan) return { cls: 'badge-unplanned', text: '临时' }
  const dv = devM(ev.plan, ev.actual)
  if (dv > 10) return { cls: 'badge-late', text: `+${dv}'` }
  if (dv < -5) return { cls: 'badge-ok', text: `${dv}'` }
  return { cls: 'badge-ok', text: '准时' }
})

const durMin = computed(() => {
  const d = timeData.value
  return d ? t2m(d.end) - t2m(d.start) : 0
})

const displayH = computed(() => {
  const d = timeData.value
  if (!d) return 0
  return Math.max(hgt(d.start, d.end) - GAP * 2, 16)
})

const blockStyle = computed(() => {
  const d = timeData.value
  if (!d) return { display: 'none' }
  const top = pos(d.start)
  const h = Math.max(hgt(d.start, d.end), 20)
  const style = {
    top: `${top + GAP}px`,
    height: `${Math.max(h - GAP * 2, 16)}px`,
    fontSize: '11px',
    padding: '2px 6px'
  }
  if (props.layout && props.layout.totalCols > 1) {
    const pad = 4, gap = 2
    const colW = 100 / props.layout.totalCols
    style.left = `calc(${colW * props.layout.col}% + ${pad}px)`
    style.width = `calc(${colW}% - ${pad + gap}px)`
    style.right = 'auto'
  }
  return style
})
</script>
