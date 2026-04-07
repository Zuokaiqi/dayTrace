import { ref, computed } from 'vue'
import { useEventStore } from '../stores/events'
import { useUndoStore } from '../stores/undo'
import { toggleDdlTodo } from './useDdlTodo'
import { dateKey, m2t } from '../utils/time'

// ─── Shared singleton state ───
const activeEventId = ref(parseInt(localStorage.getItem('dt_exec_id')) || null)
const activeDdlItem = ref(null)
const startTimestamp = ref(parseInt(localStorage.getItem('dt_exec_ts')) || 0) // precise ms timestamp
const elapsed = ref(0)
let _timer = null
let _endTicker = null

function currentHM() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function _startTimer() {
  _stopTimer()
  _updateElapsed()
  _timer = setInterval(_updateElapsed, 1000)
  // Also tick the active event's end time every 30s so it renders growing on the calendar
  _endTicker = setInterval(_tickActiveEnd, 30000)
}

function _stopTimer() {
  if (_timer) { clearInterval(_timer); _timer = null }
  if (_endTicker) { clearInterval(_endTicker); _endTicker = null }
}

function _updateElapsed() {
  if (!activeEventId.value || !startTimestamp.value) {
    activeEventId.value = null
    elapsed.value = 0
    _stopTimer()
    return
  }
  elapsed.value = Math.max(0, Math.floor((Date.now() - startTimestamp.value) / 1000))
}

function _tickActiveEnd() {
  if (!activeEventId.value) return
  const eventStore = useEventStore()
  const ev = eventStore.events.find(e => e.id === activeEventId.value)
  if (ev && ev.actual) {
    ev.actual.end = currentHM()
  }
}

// Restore timer on load
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
   * Start executing a planned event (from calendar event block)
   */
  function startExecution(eventId, ddlItem) {
    if (activeEventId.value) stopExecution()

    const ev = eventStore.events.find(e => e.id === eventId)
    if (!ev || !ev.plan) return

    undoStore.pushUndo()
    const now = currentHM()
    ev.actual = { start: now, end: now, note: '' }
    activeEventId.value = eventId
    activeDdlItem.value = ddlItem || null
    startTimestamp.value = Date.now()
    localStorage.setItem('dt_exec_id', String(eventId))
    localStorage.setItem('dt_exec_ts', String(startTimestamp.value))
    eventStore.save()
    _startTimer()
  }

  /**
   * Start executing from a DDL task item (creates plan event + starts actual)
   */
  function startFromDdlTask(ddlItem, dk) {
    if (activeEventId.value) stopExecution()

    undoStore.pushUndo()
    const now = currentHM()
    // Create a plan event at current time, 1 hour duration
    const [h, m] = now.split(':').map(Number)
    const endMin = Math.min(h * 60 + m + 60, 24 * 60)
    const ev = eventStore.addEvent({
      title: ddlItem.label.split(' · ').pop(), // Use the task name without group prefix
      tag: 'work',
      date: dk,
      repeat: null,
      plan: { start: now, end: m2t(endMin) },
      actual: { start: now, end: now, note: '' }
    })

    activeEventId.value = ev.id
    activeDdlItem.value = ddlItem
    startTimestamp.value = Date.now()
    localStorage.setItem('dt_exec_id', String(ev.id))
    localStorage.setItem('dt_exec_ts', String(startTimestamp.value))
    _startTimer()
  }

  /**
   * Stop the currently executing event, auto-complete linked DDL task
   */
  function stopExecution() {
    if (!activeEventId.value) return

    const ev = eventStore.events.find(e => e.id === activeEventId.value)
    if (ev && ev.actual) {
      undoStore.pushUndo()
      ev.actual.end = currentHM()
      eventStore.save()
    }

    // Auto-complete the linked DDL task
    if (activeDdlItem.value && !activeDdlItem.value.done) {
      toggleDdlTodo(activeDdlItem.value, true)
    }

    activeEventId.value = null
    activeDdlItem.value = null
    startTimestamp.value = 0
    elapsed.value = 0
    localStorage.removeItem('dt_exec_id')
    localStorage.removeItem('dt_exec_ts')
    _stopTimer()
  }

  function formatElapsed(secs) {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return {
    activeEventId,
    activeEvent,
    isActive,
    elapsed,
    startExecution,
    startFromDdlTask,
    stopExecution,
    formatElapsed
  }
}
