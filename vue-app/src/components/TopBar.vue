<template>
  <div class="topbar">
    <div class="brand">Day<span>Trace</span></div>
    <div class="nav-group">
      <button class="nav-btn" @click="ui.prev()" aria-label="上一页">‹</button>
      <button class="nav-btn" @click="ui.next()" aria-label="下一页">›</button>
      <button class="today-btn" @click="ui.goToday()">今天</button>
    </div>
    <div class="date-title">{{ ui.title }}</div>
    <div class="spacer"></div>
    <div class="view-tabs">
      <button v-for="v in views" :key="v.key" :class="['view-tab', { active: ui.view === v.key }]"
        @click="ui.setView(v.key)">{{ v.label }}</button>
    </div>
    <div class="topbar-divider"></div>
    <div class="nav-group">
      <button class="nav-btn" :disabled="!undoStore.canUndo()" @click="undoStore.undo()" title="撤销 (Ctrl+Z)">↩</button>
      <button class="nav-btn" :disabled="!undoStore.canRedo()" @click="undoStore.redo()" title="重做 (Ctrl+Y)">↪</button>
    </div>
    <div class="sync-indicator" :class="syncStatus" :title="syncTitle" @click="manualSync">
      <span class="sync-icon">{{ syncIcon }}</span>
      <span class="sync-label">{{ syncLabel }}</span>
    </div>
    <button class="nav-btn" @click="ui.toggleTheme()" :title="ui.theme === 'dark' ? '切换亮色模式' : '切换深色模式'">
      {{ ui.theme === 'dark' ? '☀️' : '🌙' }}
    </button>
    <button class="nav-btn ann-btn" @click="$emit('open-announcements')" title="公告">
      📢
      <span v-if="hasNewAnn" class="ann-dot"></span>
    </button>
    <button class="nav-btn" @click="$emit('open-links')" title="常用链接">🔗</button>
    <button class="nav-btn user-btn" @click="$emit('open-profile')" :title="auth.displayName">
      <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="topbar-avatar" alt="头像">
      <span v-else class="topbar-avatar-placeholder">👤</span>
      {{ auth.displayName }}
    </button>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useUiStore } from '../stores/ui'
import { useUndoStore } from '../stores/undo'
import { useAuthStore } from '../stores/auth'
import { useSync } from '../composables/useSync'

const ui = useUiStore()
const undoStore = useUndoStore()
const auth = useAuthStore()
const { syncStatus, pullFromServer } = useSync()

defineEmits(['open-profile', 'open-links', 'open-announcements'])
defineProps({ hasNewAnn: { type: Boolean, default: false } })

const views = [
  { key: 'day', label: '天' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' }
]

const syncIcon = computed(() => {
  if (syncStatus.value === 'syncing') return '🔄'
  if (syncStatus.value === 'success') return '☁️'
  if (syncStatus.value === 'error') return '⚠️'
  return '☁️'
})

const syncLabel = computed(() => {
  if (syncStatus.value === 'syncing') return '同步中'
  if (syncStatus.value === 'success') return '已同步'
  if (syncStatus.value === 'error') return '同步失败'
  return '已同步'
})

const syncTitle = computed(() => {
  if (syncStatus.value === 'error') return '同步失败，点击重试'
  return '数据自动同步中，点击手动刷新'
})

function manualSync() {
  pullFromServer()
}

function onKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoStore.undo() }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); undoStore.redo() }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>
