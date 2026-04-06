<template>
  <div class="sparkline-wrap" ref="wrapRef">
    <svg :viewBox="`0 0 ${svgW} ${svgH}`" :height="height" preserveAspectRatio="none">
      <!-- Grid lines -->
      <line v-for="y in gridYs" :key="'g'+y" :x1="pad" :x2="svgW - pad" :y1="y" :y2="y"
        class="spark-grid" stroke-dasharray="3,3" />
      <!-- Area fill -->
      <polygon v-if="points.length > 1" :points="areaPath" :fill="color" opacity="0.08" />
      <!-- Line -->
      <polyline v-if="points.length > 1" :points="linePath" :stroke="color" class="spark-line" />
      <!-- Dots -->
      <circle v-for="(p, i) in points" :key="'d'+i"
        :cx="p.x" :cy="p.y" r="3" :fill="color" class="spark-dot"
        @mouseenter="showTip(i, $event)" @mouseleave="tipIdx = -1" />
      <!-- X-axis labels -->
      <text v-for="(p, i) in points" :key="'l'+i"
        :x="p.x" :y="svgH - 2" class="spark-label"
        v-show="showLabel(i)">{{ labels[i] || '' }}</text>
    </svg>
    <!-- Tooltip -->
    <div v-if="tipIdx >= 0" class="spark-tooltip" :style="tipStyle">
      {{ tipText }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  data: { type: Array, required: true },      // number[]
  labels: { type: Array, default: () => [] }, // string[]
  color: { type: String, default: 'var(--blue)' },
  height: { type: Number, default: 80 },
  max: { type: Number, default: 100 },
  tooltipFn: { type: Function, default: null }
})

const wrapRef = ref(null)
const tipIdx = ref(-1)
const tipX = ref(0)
const tipY = ref(0)

const pad = 16
const labelH = 14
const svgW = computed(() => Math.max(200, (props.data.length - 1) * 32 + pad * 2))
const svgH = computed(() => props.height)
const chartH = computed(() => svgH.value - labelH - 8)

const points = computed(() => {
  if (props.data.length === 0) return []
  const n = props.data.length
  const stepX = n > 1 ? (svgW.value - pad * 2) / (n - 1) : 0
  return props.data.map((v, i) => ({
    x: pad + i * stepX,
    y: 8 + chartH.value - (Math.min(v, props.max) / props.max) * chartH.value,
    val: v
  }))
})

const linePath = computed(() => points.value.map(p => `${p.x},${p.y}`).join(' '))
const areaPath = computed(() => {
  if (points.value.length < 2) return ''
  const first = points.value[0]
  const last = points.value[points.value.length - 1]
  const bottom = 8 + chartH.value
  return `${first.x},${bottom} ${linePath.value} ${last.x},${bottom}`
})

const gridYs = computed(() => {
  // Draw lines at 25%, 50%, 75%
  return [0.25, 0.5, 0.75].map(pct => 8 + chartH.value - pct * chartH.value)
})

function showLabel(i) {
  const n = props.data.length
  if (n <= 7) return true
  if (n <= 14) return i % 2 === 0 || i === n - 1
  return i % Math.ceil(n / 7) === 0 || i === n - 1
}

function showTip(i, e) {
  tipIdx.value = i
  const rect = wrapRef.value?.getBoundingClientRect()
  if (!rect) return
  const svgEl = wrapRef.value?.querySelector('svg')
  if (!svgEl) return
  const svgRect = svgEl.getBoundingClientRect()
  const scaleX = svgRect.width / svgW.value
  const p = points.value[i]
  tipX.value = p.x * scaleX
  tipY.value = p.y * (svgRect.height / svgH.value) - 30
}

const tipText = computed(() => {
  if (tipIdx.value < 0) return ''
  const val = props.data[tipIdx.value]
  const label = props.labels[tipIdx.value] || ''
  if (props.tooltipFn) return props.tooltipFn(tipIdx.value, val, label)
  return label ? `${label}: ${val}` : `${val}`
})

const tipStyle = computed(() => ({
  left: tipX.value + 'px',
  top: tipY.value + 'px',
  transform: 'translateX(-50%)'
}))
</script>
