import { ref, computed, onUnmounted } from 'vue'
import { useEventStore } from '../stores/events'
import { useUndoStore } from '../stores/undo'
import { dateKey, m2t } from '../utils/time'

// ─── Shared singleton state ───
const activeEventId = ref(parseInt(localStorage.getItem('dt_exec_id')) || null)
const elapsed = ref(0) // seconds since start
let _timer = null

function currentHM() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function _startTimer() {
  _stopTimer()
  _updateElapsed()
  _timer = setInterval(_updateElapsed, 1000)
}

function _stopTimer() {
  if (_timer) { clearInterval(_timer); _timer = null }
}

function _updateElapsed() {
  const eventStore = useEventStore()
  const ev = eventStore.events.find(e => e.id === activeEventId.value)
  if (!ev || !ev.actual || !ev.actual.start) {
    activeEventId.value = null
    elapsed.value = 0
    _stopTimer()
    return
  }
  const [h, m] = ev.actual.start.split(':').map(Number)
  const startMs = new Date()
  startMs.setHours(h, m, 0, 0)
  elapsed.value = Math.max(0, Math.floor((Date.now() - startMs.getTime()) / 1000))
}

// Restore timer on load if there's an active event
if (activeEventId.value) _startTimer()

export function useExecution() {
  const eventStore = useEventStore()
  const undoStore = useUndoStore()

  const isActive = computed(() => activeEventId.value !== null)

  const activeEvent = computed(() => {
    if (!activeEventId.value) return null
    return eventStore.events.find(e => e.id === activeEventId.value) || null
  })

  /**
   * Start executing a planned event
   * @param {number} eventId
   */
  function startExecution(eventId) {
    // Stop current if any
    if (activeEventId.value) stopExecution()

    const ev = eventStore.events.find(e => e.id === eventId)
    if (!ev || !ev.plan) return

    undoStore.pushUndo()
    const now = currentHM()
    ev.actual = { start: now, end: now, note: '' }
    activeEventId.value = eventId
    localStorage.setItem('dt_exec_id', String(eventId))
    eventStore.save()
    _startTimer()
  }

  /**
   * Stop the currently executing event
   */
  function stopExecution() {
    if (!activeEventId.value) return
    const ev = eventStore.events.find(e => e.id === activeEventId.value)
    if (ev && ev.actual) {
      undoStore.pushUndo()
      ev.actual.end = currentHM()
      eventStore.save()
    }
    activeEventId.value = null
    elapsed.value = 0
    localStorage.removeItem('dt_exec_id')
    _stopTimer()
  }

  /**
   * Update the actual.end of the active event to "now" (called by timer)
   * This makes the event block grow in real-time on the calendar
   */
  function tickActiveEnd() {
    if (!activeEventId.value) return
    const ev = eventStore.events.find(e => e.id === activeEventId.value)
    if (ev && ev.actual) {
      ev.actual.end = currentHM()
      // Don't trigger server sync on every tick, just update local
    }
  }

  // Tick the active event's end time every 30s so it renders growing on the calendar
  let _endTicker = null
  if (typeof window !== 'undefined') {
    _endTicker = setInterval(tickActiveEnd, 30000)
  }

  function formatElapsed(secs) {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  /**
   * Get today's planned events for the execution bar
   */
  function todayPlannedEvents() {
    const today = new Date()
    const evs = eventStore.eventsForDate(today)
    return evs
      .filter(e => e.plan)
      .sort((a, b) => {
        const aT = a.plan.start.split(':').map(Number)
        const bT = b.plan.start.split(':').map(Number)
        return (aT[0] * 60 + aT[1]) - (bT[0] * 60 + bT[1])
      })
  }

  return {
    activeEventId,
    activeEvent,
    isActive,
    elapsed,
    startExecution,
    stopExecution,
    formatElapsed,
    todayPlannedEvents
  }
}
