<template>
  <div class="sparkline-wrap" ref="wrapRef">
    <svg :viewBox="`0 0 ${svgW} ${svgH}`" preserveAspectRatio="xMinYMin meet" :style="{ width: '100%', height: height + 'px', display: 'block', overflow: 'hidden' }">
      <!-- Grid lines -->
      <line v-for="y in gridYs" :key="'g'+y" :x1="pad" :x2="svgW - pad" :y1="y" :y2="y"
        class="spark-grid" stroke-dasharray="3,3" />
      <!-- Area fill -->
      <polygon v-if="points.length > 1" :points="areaPath" :fill="color" opacity="0.06" />
      <!-- Line -->
      <polyline v-if="points.length > 1" :points="linePath" :stroke="color" class="spark-line" />
      <!-- Dots -->
      <circle v-for="(p, i) in points" :key="'d'+i"
        :cx="p.x" :cy="p.y" r="3.5" :fill="color" class="spark-dot"
        @mouseenter="showTip(i, $event)" @mouseleave="tipIdx = -1">
        <title>{{ tipTextFor(i) }}</title>
      </circle>
      <!-- X-axis labels -->
      <text v-for="(p, i) in points" :key="'l'+i"
        :x="p.x" :y="svgH - 2" class="spark-label"
        v-if="showLabel(i)">{{ labels[i] || '' }}</text>
    </svg>
    <!-- Tooltip -->
    <div v-if="tipIdx >= 0" class="spark-tooltip" :style="tipStyle">
      {{ tipText }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'

const props = defineProps({
  data: { type: Array, required: true },
  labels: { type: Array, default: () => [] },
  color: { type: String, default: 'var(--blue)' },
  height: { type: Number, default: 80 },
  max: { type: Number, default: 100 },
  tooltipFn: { type: Function, default: null }
})

const wrapRef = ref(null)
const tipIdx = ref(-1)
const tipX = ref(0)
const tipY = ref(0)
const containerW = ref(240)

const pad = 20
const labelH = 14

// Use a fixed aspect ratio based on container width
const svgW = computed(() => containerW.value)
const svgH = computed(() => props.height)
const chartH = computed(() => svgH.value - labelH - 10)

function measureWidth() {
  if (wrapRef.value) containerW.value = Math.max(120, wrapRef.value.clientWidth)
}

let resizeObs = null
onMounted(() => {
  measureWidth()
  resizeObs = new ResizeObserver(() => measureWidth())
  if (wrapRef.value) resizeObs.observe(wrapRef.value)
})
onUnmounted(() => { resizeObs?.disconnect() })
watch(() => props.data, () => nextTick(measureWidth))

const points = computed(() => {
  if (props.data.length === 0) return []
  const n = props.data.length
  const usableW = svgW.value - pad * 2
  const stepX = n > 1 ? usableW / (n - 1) : 0
  return props.data.map((v, i) => ({
    x: pad + i * stepX,
    y: 10 + chartH.value - (Math.min(v, props.max) / props.max) * chartH.value,
    val: v
  }))
})

const linePath = computed(() => points.value.map(p => `${p.x},${p.y}`).join(' '))
const areaPath = computed(() => {
  if (points.value.length < 2) return ''
  const first = points.value[0]
  const last = points.value[points.value.length - 1]
  const bottom = 10 + chartH.value
  return `${first.x},${bottom} ${linePath.value} ${last.x},${bottom}`
})

const gridYs = computed(() => {
  return [0.25, 0.5, 0.75].map(pct => 10 + chartH.value - pct * chartH.value)
})

function showLabel(i) {
  const n = props.data.length
  if (n <= 7) return true
  if (n <= 14) return i % 2 === 0 || i === n - 1
  return i % Math.ceil(n / 7) === 0 || i === n - 1
}

function showTip(i, e) {
  tipIdx.value = i
  const svgEl = wrapRef.value?.querySelector('svg')
  if (!svgEl) return
  const svgRect = svgEl.getBoundingClientRect()
  const p = points.value[i]
  const scaleX = svgRect.width / svgW.value
  const scaleY = svgRect.height / svgH.value
  tipX.value = p.x * scaleX
  tipY.value = p.y * scaleY - 30
}

function tipTextFor(i) {
  const val = props.data[i]
  const label = props.labels[i] || ''
  if (props.tooltipFn) return props.tooltipFn(i, val, label)
  return label ? `${label}: ${val}` : `${val}`
}

const tipText = computed(() => {
  if (tipIdx.value < 0) return ''
  return tipTextFor(tipIdx.value)
})

const tipStyle = computed(() => ({
  left: tipX.value + 'px',
  top: tipY.value + 'px',
  transform: 'translateX(-50%)'
}))
</script>
