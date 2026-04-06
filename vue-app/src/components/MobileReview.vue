<template>
  <div class="m-review">
    <!-- Date nav -->
    <div class="m-review-nav">
      <button class="m-nav-btn" @click="ui.prev()">‹</button>
      <span class="m-review-date">{{ ui.title }}</span>
      <button class="m-nav-btn" @click="ui.next()">›</button>
    </div>

    <div class="rp-tabs">
      <button :class="['rp-tab', { sel: tab === 'day' }]" @click="tab = 'day'">日</button>
      <button :class="['rp-tab', { sel: tab === 'week' }]" @click="tab = 'week'">周</button>
      <button :class="['rp-tab', { sel: tab === 'month' }]" @click="tab = 'month'">月</button>
      <button :class="['rp-tab', { sel: tab === 'range' }]" @click="tab = 'range'">范围</button>
    </div>

    <ReviewDayTab v-if="tab === 'day'" />
    <ReviewWeekTab v-else-if="tab === 'week'" />
    <ReviewMonthTab v-else-if="tab === 'month'" />
    <ReviewRangeTab v-else />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useUiStore } from '../stores/ui'
import ReviewDayTab from './ReviewDayTab.vue'
import ReviewWeekTab from './ReviewWeekTab.vue'
import ReviewMonthTab from './ReviewMonthTab.vue'
import ReviewRangeTab from './ReviewRangeTab.vue'

const ui = useUiStore()
const tab = ref('day')
</script>

<style scoped>
.m-review-nav {
  display: flex; align-items: center; gap: 8px; margin-bottom: 16px;
}
.m-nav-btn {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border-light); background: var(--bg); border-radius: var(--radius);
  font-size: 16px; color: var(--text-secondary); cursor: pointer;
}
.m-review-date {
  flex: 1; text-align: center; font-size: 14px; font-weight: 600; color: var(--text);
}
</style>
