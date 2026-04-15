import { ref, readonly } from 'vue'
import { useEventStore } from '../stores/events'
import { useTaskStore } from '../stores/tasks'
import { useAuthStore } from '../stores/auth'
import { authFetch } from '../utils/api'

const syncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const lastSyncTime = ref<number | null>(null)
let _pullTimer: ReturnType<typeof setInterval> | null = null
let _statusResetTimer: ReturnType<typeof setTimeout> | null = null
let _reflSyncTimer: ReturnType<typeof setTimeout> | null = null
let _lastPushTime = 0
const PUSH_COOLDOWN = 2000

async function pullFromServer(opts: { silent?: boolean } = {}): Promise<void> {
  const auth = useAuthStore()
  if (!auth.isLoggedIn) return
  if (syncStatus.value === 'syncing') return
  if (Date.now() - _lastPushTime < PUSH_COOLDOWN) return

  syncStatus.value = 'syncing'
  try {
    const eventStore = useEventStore()
    const taskStore = useTaskStore()

    await Promise.all([
      eventStore.syncFromServer(),
      taskStore.syncTasksFromServer(),
      taskStore.syncGoalsFromServer().then((ok: boolean) => { if (ok) taskStore.migrateFrozenTaskIds() })
    ])

    // Sync reflections
    try {
      const reflResp = await authFetch('/api/reflections')
      if (reflResp.ok) {
        const reflData = await reflResp.json()
        Object.entries(reflData).forEach(([k, v]) => {
          uni.setStorageSync('dt_refl_' + k, v as string)
        })
      }
    } catch {}

    syncStatus.value = 'success'
    lastSyncTime.value = Date.now()
    if (_statusResetTimer) clearTimeout(_statusResetTimer)
    _statusResetTimer = setTimeout(() => { syncStatus.value = 'idle' }, 3000)
  } catch {
    syncStatus.value = 'error'
    if (_statusResetTimer) clearTimeout(_statusResetTimer)
    _statusResetTimer = setTimeout(() => { syncStatus.value = 'idle' }, 5000)
  }
}

function notifyPushComplete(success = true): void {
  _lastPushTime = Date.now()
  syncStatus.value = success ? 'success' : 'error'
  lastSyncTime.value = success ? Date.now() : lastSyncTime.value
  if (_statusResetTimer) clearTimeout(_statusResetTimer)
  _statusResetTimer = setTimeout(() => { syncStatus.value = 'idle' }, 3000)
}

function notifyPushStart(): void {
  syncStatus.value = 'syncing'
  _lastPushTime = Date.now()
}

function notifyDirty(): void {
  _lastPushTime = Date.now()
}

function notifyReflectionSaved(dateStr: string, data: { text: string; score: number; date: string }): void {
  uni.setStorageSync('dt_reflections_dirty', '1')
  notifyDirty()
  if (_reflSyncTimer) clearTimeout(_reflSyncTimer)
  _reflSyncTimer = setTimeout(() => {
    authFetch('/api/reflections', {
      method: 'PUT',
      data: { [dateStr]: JSON.stringify(data) }
    }).then(() => {
      uni.removeStorageSync('dt_reflections_dirty')
    }).catch(() => {})
  }, 500)
}

// uni-app 中不依赖 document/window 事件，由 App.vue 的 onShow 触发 pull
// startAutoSync 启动定时轮询（可在主页 onMounted 调用）
function startAutoSync(): () => void {
  _pullTimer = setInterval(() => {
    pullFromServer({ silent: true })
  }, 60 * 1000)

  return () => {
    if (_pullTimer) { clearInterval(_pullTimer); _pullTimer = null }
  }
}

export function useSync() {
  return {
    syncStatus: readonly(syncStatus),
    lastSyncTime: readonly(lastSyncTime),
    pullFromServer,
    startAutoSync,
    notifyPushStart,
    notifyPushComplete,
    notifyDirty,
    notifyReflectionSaved
  }
}
