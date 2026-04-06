import { ref, readonly } from 'vue'
import { useEventStore } from '../stores/events'
import { useTaskStore } from '../stores/tasks'
import { useLinkStore } from '../stores/links'
import { useAuthStore } from '../stores/auth'
import { authFetch } from '../utils/api'

// Sync status: 'idle' | 'syncing' | 'success' | 'error'
const syncStatus = ref('idle')
const lastSyncTime = ref(null)
let _pullTimer = null
let _statusResetTimer = null

/**
 * Pull all data from server (events, tasks, goals, links)
 * Called on app start, visibility change, and periodically
 */
async function pullFromServer(opts = {}) {
  const auth = useAuthStore()
  if (!auth.isLoggedIn) return

  const { silent = false } = opts
  if (syncStatus.value === 'syncing') return

  syncStatus.value = 'syncing'
  try {
    const eventStore = useEventStore()
    const taskStore = useTaskStore()
    const linkStore = useLinkStore()

    await Promise.all([
      eventStore.syncFromServer(),
      taskStore.syncTasksFromServer(),
      taskStore.syncGoalsFromServer().then(ok => { if (ok) taskStore.migrateFrozenTaskIds() }),
      linkStore.syncFromServer()
    ])

    // Sync reflections to localStorage
    try {
      const reflResp = await authFetch('/api/reflections')
      if (reflResp.ok) {
        const reflData = await reflResp.json()
        Object.entries(reflData).forEach(([k, v]) => {
          localStorage.setItem('dt_refl_' + k, v)
        })
      }
    } catch {}

    syncStatus.value = 'success'
    lastSyncTime.value = Date.now()

    // Reset to idle after 3s
    clearTimeout(_statusResetTimer)
    _statusResetTimer = setTimeout(() => { syncStatus.value = 'idle' }, 3000)
  } catch {
    syncStatus.value = 'error'
    clearTimeout(_statusResetTimer)
    _statusResetTimer = setTimeout(() => { syncStatus.value = 'idle' }, 5000)
  }
}

/**
 * Mark that a push just happened (called from stores after debounced sync)
 * Updates the status indicator briefly
 */
function notifyPushComplete(success = true) {
  if (success) {
    syncStatus.value = 'success'
    lastSyncTime.value = Date.now()
  } else {
    syncStatus.value = 'error'
  }
  clearTimeout(_statusResetTimer)
  _statusResetTimer = setTimeout(() => { syncStatus.value = 'idle' }, 3000)
}

/**
 * Mark that a push is starting (called from stores when debounce fires)
 */
function notifyPushStart() {
  syncStatus.value = 'syncing'
}

/**
 * Start visibility-based auto-pull:
 * When user switches back to the tab, pull latest data
 */
function startAutoSync() {
  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      pullFromServer({ silent: true })
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  // Also pull periodically every 5 minutes while visible
  _pullTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      pullFromServer({ silent: true })
    }
  }, 5 * 60 * 1000)

  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    clearInterval(_pullTimer)
  }
}

export function useSync() {
  return {
    syncStatus: readonly(syncStatus),
    lastSyncTime: readonly(lastSyncTime),
    pullFromServer,
    startAutoSync,
    notifyPushStart,
    notifyPushComplete
  }
}
