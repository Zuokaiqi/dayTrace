<template>
  <div class="heatmap-wrap">
    <div class="heatmap-header">
      <span v-for="d in dayHeaders" :key="d">{{ d }}</span>
    </div>
    <div class="heatmap-grid">
      <template v-for="(cell, i) in cells" :key="i">
        <div v-if="cell.empty" class="heatmap-cell empty"></div>
        <div v-else class="heatmap-cell"
          :style="{ background: cellColor(cell.score, cell.active) }"
          :title="cell.label"
          @mouseenter="hoveredIdx = i" @mouseleave="hoveredIdx = -1">
        </div>
      </template>
    </div>
    <div class="heatmap-legend">
      <span>少</span>
      <div class="heatmap-legend-cell" :style="{ background: levelColor(0) }"></div>
      <div class="heatmap-legend-cell" :style="{ background: levelColor(1) }"></div>
      <div class="heatmap-legend-cell" :style="{ background: levelColor(2) }"></div>
      <div class="heatmap-legend-cell" :style="{ background: levelColor(3) }"></div>
      <div class="heatmap-legend-cell" :style="{ background: levelColor(4) }"></div>
      <span>多</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { dateKey, WD } from '../utils/time'

const props = defineProps({
  year: { type: Number, required: true },
  month: { type: Number, required: true }, // 0-indexed
  scores: { type: Object, required: true } // { dateKey: { score, active } }
})

const hoveredIdx = ref(-1)
const dayHeaders = ['一', '二', '三', '四', '五', '六', '日']

const cells = computed(() => {
  const result = []
  const firstDay = new Date(props.year, props.month, 1)
  const lastDay = new Date(props.year, props.month + 1, 0)

  // Day of week for 1st (0=Sun, convert to Mon-based: Mon=0)
  let startDow = firstDay.getDay()
  startDow = startDow === 0 ? 6 : startDow - 1 // Convert Sun=0 → 6, Mon=1 → 0

  // Padding before 1st
  for (let i = 0; i < startDow; i++) {
    result.push({ empty: true })
  }

  // Days of month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dt = new Date(props.year, props.month, d)
    const dk = dateKey(dt)
    const info = props.scores[dk]
    result.push({
      empty: false,
      day: d,
      dateKey: dk,
      score: info?.score ?? -1,
      active: info?.active ?? false,
      label: `${props.month + 1}月${d}日: ${info?.active ? info.score + '分' : '无数据'}`
    })
  }

  return result
})

function cellColor(score, active) {
  if (!active || score < 0) return 'var(--border-light)'
  if (score >= 81) return 'rgba(52,199,89,0.85)'
  if (score >= 61) return 'rgba(52,199,89,0.55)'
  if (score >= 31) return 'rgba(255,149,0,0.5)'
  return 'rgba(255,59,48,0.45)'
}

function levelColor(level) {
  const colors = [
    'var(--border-light)',
    'rgba(255,59,48,0.45)',
    'rgba(255,149,0,0.5)',
    'rgba(52,199,89,0.55)',
    'rgba(52,199,89,0.85)'
  ]
  return colors[level]
}
</script>
