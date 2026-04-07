<template>
  <div class="exec-bar" v-if="tasks.length > 0">
    <div class="exec-bar-inner">
      <div class="exec-bar-scroll">
        <div v-for="ev in tasks" :key="ev.id"
          :class="['exec-chip', chipClass(ev)]"
          :title="ev.title + ' ' + ev.plan.start + '–' + ev.plan.end">

          <!-- Tag dot -->
          <span class="exec-dot" :style="{ background: tagColors[ev.tag] || 'var(--text-light)' }"></span>

          <!-- Title -->
          <span class="exec-title">{{ ev.title }}</span>

          <!-- Time range -->
          <span class="exec-time">{{ ev.plan.start.slice(0,5) }}</span>

          <!-- Action button -->
          <button v-if="isRunning(ev)" class="exec-btn exec-stop" @click.stop="stop()" title="结束">
            <span class="exec-timer">{{ formatElapsed(elapsed) }}</span>
            ■
          </button>
          <button v-else-if="isDone(ev)" class="exec-btn exec-done" disabled title="已完成">
            ✓
          </button>
          <button v-else class="exec-btn exec-start" @click.stop="start(ev)" title="开始执行">
            ▶
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useExecution } from '../composables/useExecution'
import { useUiStore } from '../stores/ui'
import { dateKey, TAG_COLORS } from '../utils/time'

const ui = useUiStore()
const { activeEventId, elapsed, startExecution, stopExecution, formatElapsed, todayPlannedEvents } = useExecution()
const tagColors = TAG_COLORS

// Only show when viewing today in day view
const isToday = computed(() => {
  const today = new Date()
  return dateKey(ui.curDate) === dateKey(today)
})

const tasks = computed(() => {
  if (!isToday.value) return []
  return todayPlannedEvents()
})

function isRunning(ev) {
  return activeEventId.value === ev.id
}

function isDone(ev) {
  return ev.actual && ev.actual.start && ev.actual.end && activeEventId.value !== ev.id
}

function chipClass(ev) {
  if (isRunning(ev)) return 'running'
  if (isDone(ev)) return 'done'
  return 'idle'
}

function start(ev) {
  startExecution(ev.id)
}

function stop() {
  stopExecution()
}
</script>
