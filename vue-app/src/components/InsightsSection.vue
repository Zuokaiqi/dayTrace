<template>
  <div class="insights-section">
    <!-- Hourly Profile -->
    <div class="rp-section" v-if="hourly.length > 0">
      <div class="rp-sec-head">⏰ 时段效率</div>
      <div class="hourly-chart">
        <div v-for="h in hourly" :key="h.hour" class="hourly-col"
          :title="`${h.hour}:00 — 执行率 ${h.execRate}%，共 ${h.planned} 个任务`">
          <div class="hourly-bar-wrap">
            <div class="hourly-bar" :style="{ height: h.execRate + '%', background: barColor(h.execRate) }"></div>
          </div>
          <div class="hourly-label">{{ h.hour }}</div>
        </div>
      </div>
      <div class="hourly-summary" v-if="goldenHour && weakHour">
        <span class="hourly-tag golden">⭐ 黄金时段 {{ goldenHour.hour }}:00 ({{ goldenHour.execRate }}%)</span>
        <span class="hourly-tag weak">💤 低谷时段 {{ weakHour.hour }}:00 ({{ weakHour.execRate }}%)</span>
      </div>
    </div>

    <!-- Duration Bias -->
    <div class="rp-section" v-if="bias.overall.count > 0">
      <div class="rp-sec-head">⏱ 时长偏差</div>
      <div class="bias-overall" :class="bias.overall.biasPercent > 0 ? 'over' : 'under'">
        <span class="bias-pct">{{ bias.overall.biasPercent > 0 ? '+' : '' }}{{ bias.overall.biasPercent }}%</span>
        <span class="bias-desc">
          {{ bias.overall.biasPercent > 0 ? '整体超时' : bias.overall.biasPercent < 0 ? '整体提前' : '整体准确' }}
          （计划 {{ bias.overall.avgPlanMins }}m → 实际 {{ bias.overall.avgActualMins }}m）
        </span>
      </div>
      <div class="bias-tags">
        <div v-for="(b, tag) in bias.byTag" :key="tag" class="bias-tag-row">
          <span class="bias-tag-name">
            <span class="tag-dot" :style="{ background: tagColors[tag] || 'var(--text-light)' }"></span>
            {{ tagNames[tag] || tag }}
          </span>
          <span class="bias-tag-val" :class="b.biasPercent > 15 ? 'over' : b.biasPercent < -5 ? 'under' : 'ok'">
            {{ b.biasPercent > 0 ? '+' : '' }}{{ b.biasPercent }}%
          </span>
          <span class="bias-tag-detail">{{ b.avgPlanMins }}m → {{ b.avgActualMins }}m ({{ b.count }}次)</span>
        </div>
      </div>
    </div>

    <!-- Patterns -->
    <div class="rp-section" v-if="patterns.length > 0">
      <div class="rp-sec-head">🧠 行为洞察</div>
      <div class="pattern-list">
        <div v-for="p in patterns" :key="p.id" :class="['pattern-card', 'pattern-' + p.severity]">
          <div class="pattern-icon">{{ p.icon }}</div>
          <div class="pattern-body">
            <div class="pattern-title">{{ p.title }}</div>
            <div class="pattern-desc">{{ p.desc }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { TAG_COLORS, TAG_NAMES } from '../composables/useReviewStats'

const props = defineProps({
  hourly: { type: Array, default: () => [] },
  bias: { type: Object, default: () => ({ byTag: {}, overall: { count: 0 } }) },
  patterns: { type: Array, default: () => [] }
})

const tagColors = TAG_COLORS
const tagNames = TAG_NAMES

const goldenHour = computed(() => {
  if (!props.hourly.length) return null
  const filtered = props.hourly.filter(h => h.planned >= 3)
  return filtered.length ? filtered.reduce((a, b) => a.execRate > b.execRate ? a : b) : null
})

const weakHour = computed(() => {
  if (!props.hourly.length) return null
  const filtered = props.hourly.filter(h => h.planned >= 3)
  return filtered.length ? filtered.reduce((a, b) => a.execRate < b.execRate ? a : b) : null
})

function barColor(rate) {
  if (rate >= 80) return 'var(--green)'
  if (rate >= 50) return 'var(--orange)'
  return 'var(--red)'
}
</script>
