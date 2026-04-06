<template>
  <div class="m-goals">
    <div class="m-goals-tabs">
      <button :class="['m-goals-tab', { sel: tab === 'weekly' }]" @click="tab = 'weekly'">任务</button>
      <button :class="['m-goals-tab', { sel: tab === 'gantt' }]" @click="tab = 'gantt'">甘特图</button>
    </div>
    <WeeklyTab v-if="tab === 'weekly'" />
    <GanttTab v-else />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import WeeklyTab from './WeeklyTab.vue'
import GanttTab from './GanttTab.vue'

const tab = ref('weekly')
</script>

<style scoped>
.m-goals-tabs {
  display: flex; gap: 2px; background: var(--bg-hover); border-radius: 6px;
  padding: 2px; margin-bottom: 12px;
}
.m-goals-tab {
  flex: 1; padding: 6px 0; border: none; background: transparent;
  border-radius: 5px; font-size: 13px; font-weight: 500;
  color: var(--text-secondary); cursor: pointer; text-align: center;
}
.m-goals-tab.sel {
  background: var(--bg); color: var(--text); box-shadow: var(--shadow-sm);
}
</style>