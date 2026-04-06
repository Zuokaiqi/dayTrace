<template>
  <div class="goals-panel">
    <div class="goals-resize-handle" @mousedown="onResizeStart"></div>
    <div class="goals-panel-header">
      <div class="goals-panel-header-title">目标 <span>管理</span></div>
      <button class="goals-panel-close" @click="$emit('close')">✕</button>
    </div>
    <div class="goals-body">
      <div class="goals-tabs">
        <button :class="['goals-tab', { sel: tab === 'weekly' }]" @click="tab = 'weekly'">任务</button>
        <button :class="['goals-tab', { sel: tab === 'gantt' }]" @click="tab = 'gantt'">甘特图</button>
      </div>
      <WeeklyTab v-if="tab === 'weekly'" />
      <GanttTab v-else />
    </div>
  </div>
  <div class="task-collapse-tab" @click="$emit('toggle')" title="目标管理">
    <span class="tab-icon">▶</span>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import WeeklyTab from './WeeklyTab.vue'
import GanttTab from './GanttTab.vue'

defineEmits(['close', 'toggle'])

const tab = ref('weekly')

// Resize handle
function onResizeStart(e) {
  if (e.button !== 0) return
  const startX = e.clientX
  const startW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--task-panel-w')) || 340
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  const mv = e2 => {
    const w = Math.min(Math.max(startW + (e2.clientX - startX), 280), 600)
    document.documentElement.style.setProperty('--task-panel-w', w + 'px')
  }
  const up = () => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', mv)
    document.removeEventListener('mouseup', up)
    localStorage.setItem('dt_task_panel_w', document.documentElement.style.getPropertyValue('--task-panel-w'))
  }
  document.addEventListener('mousemove', mv)
  document.addEventListener('mouseup', up)
  e.preventDefault()
}

// Restore saved width
const savedW = localStorage.getItem('dt_task_panel_w')
if (savedW) document.documentElement.style.setProperty('--task-panel-w', savedW)
</script>
