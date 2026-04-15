import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { dateKey, weekStart, WD } from '../utils/time'

export const useUiStore = defineStore('ui', () => {
  const view = ref<'day' | 'week' | 'month'>('day')
  const curDate = ref(new Date())
  const theme = ref<string>(uni.getStorageSync('dt_theme') || 'light')

  // Native app: isMobile is always true
  const isMobile = ref(true)
  const mobileTab = ref<'calendar' | 'tasks' | 'review'>('calendar')

  const title = computed(() => {
    const d = curDate.value
    if (view.value === 'day') {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${WD[d.getDay()]}`
    }
    if (view.value === 'week') {
      const s = weekStart(d)
      const e = new Date(s)
      e.setDate(e.getDate() + 6)
      return `${s.getMonth() + 1}月${s.getDate()}日 – ${e.getMonth() + 1}月${e.getDate()}日, ${s.getFullYear()}`
    }
    return `${d.getFullYear()}年${d.getMonth() + 1}月`
  })

  function setView(v: 'day' | 'week' | 'month') { view.value = v }

  function prev() {
    const d = new Date(curDate.value)
    if (view.value === 'day') d.setDate(d.getDate() - 1)
    else if (view.value === 'week') d.setDate(d.getDate() - 7)
    else d.setMonth(d.getMonth() - 1)
    curDate.value = d
  }

  function next() {
    const d = new Date(curDate.value)
    if (view.value === 'day') d.setDate(d.getDate() + 1)
    else if (view.value === 'week') d.setDate(d.getDate() + 7)
    else d.setMonth(d.getMonth() + 1)
    curDate.value = d
  }

  function goToday() { curDate.value = new Date() }
  function goToDate(d: Date) { curDate.value = new Date(d) }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    uni.setStorageSync('dt_theme', theme.value)
  }

  return { view, curDate, theme, title, isMobile, mobileTab, setView, prev, next, goToday, goToDate, toggleTheme }
})
