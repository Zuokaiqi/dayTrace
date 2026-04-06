<template>
  <div class="review-sidebar">
    <div class="review-resize-handle" @mousedown="onResizeStart"></div>
    <div class="review-header">
      <div class="review-header-title">晚间 <span>复盘</span></div>
      <button class="review-header-btn" @click="$emit('close')">✕</button>
    </div>
    <div class="rp-tabs">
      <button :class="['rp-tab', { sel: tab === 'day' }]" @click="tab = 'day'">日</button>
      <button :class="['rp-tab', { sel: tab === 'week' }]" @click="tab = 'week'">周</button>
      <button :class="['rp-tab', { sel: tab === 'month' }]" @click="tab = 'month'">月</button>
      <button :class="['rp-tab', { sel: tab === 'range' }]" @click="tab = 'range'">范围</button>
    </div>
    <div class="rp-body">
      <ReviewDayTab v-if="tab === 'day'" />
      <ReviewWeekTab v-else-if="tab === 'week'" />
      <ReviewMonthTab v-else-if="tab === 'month'" />
      <ReviewRangeTab v-else />
    </div>
  </div>
  <div class="review-collapse-tab" @click="$emit('toggle')" title="晚间复盘">
    <span class="tab-icon">◀</span>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import ReviewDayTab from './ReviewDayTab.vue'
import ReviewWeekTab from './ReviewWeekTab.vue'
import ReviewMonthTab from './ReviewMonthTab.vue'
import ReviewRangeTab from './ReviewRangeTab.vue'

defineEmits(['close', 'toggle'])

const tab = ref('day')

function onResizeStart(e) {
  if (e.button !== 0) return
  const startX = e.clientX
  const startW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--review-panel-w')) || 280
  document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
  const mv = e2 => {
    const w = Math.min(Math.max(startW - (e2.clientX - startX), 200), 500)
    document.documentElement.style.setProperty('--review-panel-w', w + 'px')
  }
  const up = () => { document.body.style.cursor = ''; document.body.style.userSelect = ''; document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up) }
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up)
  e.preventDefault()
}
</script>
