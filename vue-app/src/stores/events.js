import { ref } from 'vue'
import { defineStore } from 'pinia'
import { authFetch } from '../utils/api'
import { dateKey, t2m } from '../utils/time'
import { useSync } from '../composables/useSync'

export const useEventStore = defineStore('events', () => {
  const events = ref([])
  const nextId = ref(1)

  let _syncTimer = null

  // ─── Local persistence ───
  function load() {
    try {
      const d = localStorage.getItem('dt_events')
      if (d) {
        events.value = JSON.parse(d)
        nextId.value = parseInt(localStorage.getItem('dt_nid')) || events.value.length + 1
      }
    } catch { events.value = [] }
  }

  function save() {
    localStorage.setItem('dt_events', JSON.stringify(events.value))
    localStorage.setItem('dt_nid', nextId.value)
    _syncToServer()
  }

  function _syncToServer() {
    clearTimeout(_syncTimer)
    _syncTimer = setTimeout(() => {
      const { notifyPushStart, notifyPushComplete } = useSync()
      notifyPushStart()
      authFetch('/api/events', {
        method: 'POST',
        body: JSON.stringify({ events: events.value, nextId: nextId.value })
      }).then(() => notifyPushComplete(true))
        .catch(() => notifyPushComplete(false))
    }, 500)
  }

  async function syncFromServer() {
    try {
      const resp = await authFetch('/api/events')
      if (!resp.ok) return false
      const data = await resp.json()
      if (data.events?.length > 0) {
        events.value = data.events
        nextId.value = data.nextId || data.events.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1
        localStorage.setItem('dt_events', JSON.stringify(events.value))
        localStorage.setItem('dt_nid', nextId.value)
        return true
      }
    } catch {}
    return false
  }

  // ─── Queries ───
  function matchesRepeat(e, d, k) {
    // Excludes check applies to all dates including origin
    if (e.excludes && e.excludes.includes(k)) return false
    if (e.date === k) return true
    if (!e.repeat) return false
    const ed = new Date(e.date + 'T00:00:00')
    if (d < ed) return false
    if (e.repeatEnd && k > e.repeatEnd) return false
    const dow = d.getDay()
    if (e.repeat === 'daily') return true
    if (e.repeat === 'weekday' && dow >= 1 && dow <= 5) return true
    if (e.repeat === 'weekly' && ed.getDay() === dow) return true
    return false
  }

  function eventsForDate(d) {
    const k = dateKey(d)
    const result = []
    events.value.forEach(e => {
      if (!matchesRepeat(e, d, k)) return
      if (e.repeat && e.date !== k) {
        // Return a clone with _viewDate for repeat instances on non-origin dates
        result.push({ ...e, plan: e.plan ? { ...e.plan } : null, _viewDate: k, _repeatSrc: e.id })
      } else {
        result.push(e)
      }
    })
    return result
  }

  // ─── Mutations ───
  function addEvent(ev) {
    ev.id = nextId.value++
    events.value.push(ev)
    save()
    return ev
  }

  function updateEvent(id, updates) {
    const ev = events.value.find(e => e.id === id)
    if (ev) Object.assign(ev, updates)
    save()
  }

  function removeEvent(id) {
    events.value = events.value.filter(e => e.id !== id)
    save()
  }

  // Add a date to a repeat event's excludes list (skip that date)
  function addExclude(id, dateStr) {
    const ev = events.value.find(e => e.id === id)
    if (!ev || !ev.repeat) return
    if (!ev.excludes) ev.excludes = []
    if (!ev.excludes.includes(dateStr)) ev.excludes.push(dateStr)
    save()
  }

  // Exclude all dates from a given date onward by setting repeat to null
  // and keeping only dates before the cutoff (by changing event end behavior)
  function stopRepeatFrom(id, dateStr) {
    const ev = events.value.find(e => e.id === id)
    if (!ev || !ev.repeat) return
    if (dateStr === ev.date) {
      // Stopping from origin = delete entirely
      removeEvent(id)
    } else {
      // Store the repeat-end date: the day before dateStr
      const d = new Date(dateStr + 'T00:00:00')
      d.setDate(d.getDate() - 1)
      ev.repeatEnd = dateKey(d)
      save()
    }
  }

  // Fork a single instance out of a repeat event as a standalone event
  function forkInstance(id, viewDate, overrides) {
    const ev = events.value.find(e => e.id === id)
    if (!ev) return null
    // Exclude this date from the repeat
    addExclude(id, viewDate)
    // Create standalone copy
    const forked = {
      title: ev.title, tag: ev.tag, date: viewDate, repeat: null,
      plan: ev.plan ? { ...ev.plan } : null,
      actual: null,
      ...overrides
    }
    return addEvent(forked)
  }

  // Init
  load()

  return {
    events, nextId,
    save, load, syncFromServer,
    eventsForDate, addEvent, updateEvent, removeEvent,
    addExclude, stopRepeatFrom, forkInstance
  }
})
