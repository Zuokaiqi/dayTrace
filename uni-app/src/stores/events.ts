import { ref } from 'vue'
import { defineStore } from 'pinia'
import { authFetch } from '../utils/api'
import { dateKey } from '../utils/time'
import { useSync } from '../composables/useSync'

export const useEventStore = defineStore('events', () => {
  const events = ref<any[]>([])
  const nextId = ref(1)

  let _syncTimer: ReturnType<typeof setTimeout> | null = null
  let _dirty = false

  function load() {
    try {
      const d = uni.getStorageSync('dt_events')
      if (d) {
        events.value = typeof d === 'string' ? JSON.parse(d) : d
        nextId.value = parseInt(uni.getStorageSync('dt_nid')) || events.value.length + 1
      }
    } catch { events.value = [] }
  }

  function save() {
    uni.setStorageSync('dt_events', JSON.stringify(events.value))
    uni.setStorageSync('dt_nid', String(nextId.value))
    _syncToServer()
  }

  function _syncToServer() {
    if (_syncTimer) clearTimeout(_syncTimer)
    _dirty = true
    uni.setStorageSync('dt_events_dirty', '1')
    const { notifyDirty } = useSync()
    notifyDirty()
    _syncTimer = setTimeout(() => { _pushNow() }, 500)
  }

  function _pushNow() {
    if (!_dirty) return
    _dirty = false
    const { notifyPushStart, notifyPushComplete } = useSync()
    notifyPushStart()
    authFetch('/api/events', {
      method: 'POST',
      data: { events: events.value, nextId: nextId.value }
    }).then(() => {
      uni.removeStorageSync('dt_events_dirty')
      notifyPushComplete(true)
    }).catch(() => notifyPushComplete(false))
  }

  async function syncFromServer(): Promise<boolean> {
    if (_dirty) return false
    try {
      const resp = await authFetch('/api/events')
      if (!resp.ok) return false
      if (_dirty) return false
      const data = await resp.json()
      if (data.events?.length > 0) {
        events.value = data.events
        nextId.value = data.nextId || data.events.reduce((m: number, e: any) => Math.max(m, e.id || 0), 0) + 1
        uni.setStorageSync('dt_events', JSON.stringify(events.value))
        uni.setStorageSync('dt_nid', String(nextId.value))
        return true
      }
    } catch {}
    return false
  }

  function matchesRepeat(e: any, d: Date, k: string): boolean {
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

  function eventsForDate(d: Date): any[] {
    const k = dateKey(d)
    const result: any[] = []
    events.value.forEach(e => {
      if (!matchesRepeat(e, d, k)) return
      if (e.repeat && e.date !== k) {
        result.push({ ...e, plan: e.plan ? { ...e.plan } : null, _viewDate: k, _repeatSrc: e.id })
      } else {
        result.push(e)
      }
    })
    return result
  }

  function addEvent(ev: any): any {
    ev.id = nextId.value++
    if (!ev.linkedTaskIds) ev.linkedTaskIds = []
    events.value.push(ev)
    save()
    return ev
  }

  function updateEvent(id: number, updates: any): void {
    const ev = events.value.find(e => e.id === id)
    if (ev) Object.assign(ev, updates)
    save()
  }

  function removeEvent(id: number): void {
    events.value = events.value.filter(e => e.id !== id)
    save()
  }

  function addExclude(id: number, dateStr: string): void {
    const ev = events.value.find(e => e.id === id)
    if (!ev || !ev.repeat) return
    if (!ev.excludes) ev.excludes = []
    if (!ev.excludes.includes(dateStr)) ev.excludes.push(dateStr)
    save()
  }

  function stopRepeatFrom(id: number, dateStr: string): void {
    const ev = events.value.find(e => e.id === id)
    if (!ev || !ev.repeat) return
    if (dateStr === ev.date) {
      removeEvent(id)
    } else {
      const d = new Date(dateStr + 'T00:00:00')
      d.setDate(d.getDate() - 1)
      ev.repeatEnd = dateKey(d)
      save()
    }
  }

  function forkInstance(id: number, viewDate: string, overrides: any): any {
    const ev = events.value.find(e => e.id === id)
    if (!ev) return null
    addExclude(id, viewDate)
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
  if (uni.getStorageSync('dt_events_dirty')) {
    _dirty = true
    _pushNow()
  }

  return {
    events, nextId,
    save, load, syncFromServer,
    eventsForDate, addEvent, updateEvent, removeEvent,
    addExclude, stopRepeatFrom, forkInstance
  }
})
