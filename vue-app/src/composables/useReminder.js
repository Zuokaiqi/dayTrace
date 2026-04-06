import { ref } from 'vue'
import { useEventStore } from '../stores/events'
import { dateKey, t2m } from '../utils/time'

let _timer = null
const _notifiedSet = new Set()
// Reference to the ReminderAlert component instance, set by MainView
const alertRef = ref(null)

function setAlertRef(r) {
  alertRef.value = r
}

/**
 * Show an in-page reminder alert with sound.
 */
function fireReminder(title, body) {
  if (alertRef.value) {
    alertRef.value.show(title, body)
  }
}

/**
 * Check all events for today and fire reminders for any
 * that have a reminder set and are within the reminder window.
 */
function checkReminders() {
  const eventStore = useEventStore()
  const now = new Date()
  const today = dateKey(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const todayEvents = eventStore.eventsForDate(now)

  for (const ev of todayEvents) {
    if (!ev.reminder) continue
    const plan = ev.plan
    if (!plan || !plan.start) continue

    const startMinutes = t2m(plan.start)
    const reminderMinutes = ev.reminder || 5
    const triggerAt = startMinutes - reminderMinutes

    const viewDate = ev._viewDate || ev.date
    const notifKey = `${ev.id}_${viewDate}_${plan.start}`

    if (_notifiedSet.has(notifKey)) continue

    // In the notification window: [triggerAt, startMinutes)
    if (nowMinutes >= triggerAt && nowMinutes < startMinutes) {
      _notifiedSet.add(notifKey)
      fireReminder(
        `📅 ${ev.title || '日程提醒'}`,
        `将在 ${reminderMinutes} 分钟后开始 (${plan.start})`
      )
    }

    // Already started — skip
    if (nowMinutes >= startMinutes) {
      _notifiedSet.add(notifKey)
    }
  }
}

/**
 * Start the reminder checker. Runs every 30 seconds.
 */
function startReminders() {
  _notifiedSet.clear()
  checkReminders()
  _timer = setInterval(checkReminders, 30 * 1000)

  // Reset notified set at midnight
  const now = new Date()
  const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
  const midnightTimer = setTimeout(() => { _notifiedSet.clear() }, msUntilMidnight)

  return () => {
    clearInterval(_timer)
    clearTimeout(midnightTimer)
    _timer = null
  }
}

/**
 * Fire a test reminder after a delay (for testing purposes).
 */
function testReminder(delaySec = 10) {
  setTimeout(() => {
    fireReminder('📅 DayTrace 测试提醒', '如果你看到了这个弹窗并听到了声音，说明提醒功能正常！')
  }, delaySec * 1000)
}

export function useReminder() {
  return {
    startReminders,
    setAlertRef,
    testReminder,
    fireReminder
  }
}
