import { ref } from 'vue'
import { defineStore } from 'pinia'
import { authFetch } from '../utils/api'
import { dateKey } from '../utils/time'
import { useSync } from '../composables/useSync'

export const useTaskStore = defineStore('tasks', () => {
  const tasks = ref<any[]>([])
  const taskNextId = ref(1)
  const monthlyGoals = ref<any[]>([])
  const weeklyTasks = ref<any[]>([])
  const mNextId = ref(1)
  const wNextId = ref(1)

  let _taskSyncTimer: ReturnType<typeof setTimeout> | null = null
  let _goalsSyncTimer: ReturnType<typeof setTimeout> | null = null
  let _tasksDirty = false
  let _goalsDirty = false
  // Startup guard: hold push until first pullFromServer completes so stale
  // local cache can't overwrite newer server data on app start.
  let _tasksInitPhase = false
  let _goalsInitPhase = false

  function loadTasks() {
    try {
      const d = uni.getStorageSync('dt_tasks')
      if (d) {
        tasks.value = typeof d === 'string' ? JSON.parse(d) : d
        taskNextId.value = parseInt(uni.getStorageSync('dt_tnid')) || tasks.value.length + 1
      }
    } catch { tasks.value = [] }
  }

  function saveTasks() {
    uni.setStorageSync('dt_tasks', JSON.stringify(tasks.value))
    uni.setStorageSync('dt_tnid', String(taskNextId.value))
    _tasksDirty = true
    uni.setStorageSync('dt_tasks_dirty', '1')
    const { notifyDirty } = useSync()
    notifyDirty()
    if (_taskSyncTimer) clearTimeout(_taskSyncTimer)
    _taskSyncTimer = setTimeout(() => {
      if (_tasksInitPhase) return
      _tasksDirty = false
      const { notifyPushStart, notifyPushComplete } = useSync()
      notifyPushStart()
      authFetch('/api/tasks', {
        method: 'POST',
        data: { tasks: tasks.value, taskNextId: taskNextId.value }
      }).then(() => { uni.removeStorageSync('dt_tasks_dirty'); notifyPushComplete(true) })
        .catch(() => { _tasksDirty = true; notifyPushComplete(false) })
    }, 500)
  }

  async function syncTasksFromServer(): Promise<boolean> {
    if (_tasksDirty) { _tasksInitPhase = false; if (_tasksDirty) saveTasks(); return false }
    try {
      const resp = await authFetch('/api/tasks')
      if (!resp.ok) { _tasksInitPhase = false; if (_tasksDirty) saveTasks(); return false }
      if (_tasksDirty) { _tasksInitPhase = false; if (_tasksDirty) saveTasks(); return false }
      const data = await resp.json()
      if (data.tasks?.length > 0) {
        tasks.value = data.tasks
        taskNextId.value = data.taskNextId || data.tasks.reduce((m: number, t: any) => Math.max(m, t.id || 0), 0) + 1
        uni.setStorageSync('dt_tasks', JSON.stringify(tasks.value))
        uni.setStorageSync('dt_tnid', String(taskNextId.value))
        _tasksDirty = false
        uni.removeStorageSync('dt_tasks_dirty')
        _tasksInitPhase = false
        return true
      }
      _tasksInitPhase = false
      if (_tasksDirty) saveTasks()
      return false
    } catch {}
    _tasksInitPhase = false
    if (_tasksDirty) saveTasks()
    return false
  }

  function loadGoals() {
    try {
      const s = uni.getStorageSync('dt_goals')
      if (s) {
        const d = typeof s === 'string' ? JSON.parse(s) : s
        monthlyGoals.value = d.monthlyGoals || []
        weeklyTasks.value = d.weeklyTasks || []
        mNextId.value = d.mNextId || 1
        wNextId.value = d.wNextId || 1
      }
    } catch {}
  }

  function saveGoals() {
    const data = {
      monthlyGoals: monthlyGoals.value,
      weeklyTasks: weeklyTasks.value,
      mNextId: mNextId.value,
      wNextId: wNextId.value
    }
    uni.setStorageSync('dt_goals', JSON.stringify(data))
    _goalsDirty = true
    uni.setStorageSync('dt_goals_dirty', '1')
    const { notifyDirty } = useSync()
    notifyDirty()
    if (_goalsSyncTimer) clearTimeout(_goalsSyncTimer)
    _goalsSyncTimer = setTimeout(() => {
      if (_goalsInitPhase) return
      _goalsDirty = false
      const { notifyPushStart, notifyPushComplete } = useSync()
      notifyPushStart()
      authFetch('/api/goals', { method: 'POST', data })
        .then(() => { uni.removeStorageSync('dt_goals_dirty'); notifyPushComplete(true) })
        .catch(() => { _goalsDirty = true; notifyPushComplete(false) })
    }, 600)
  }

  async function syncGoalsFromServer(): Promise<boolean> {
    if (_goalsDirty) { _goalsInitPhase = false; if (_goalsDirty) saveGoals(); return false }
    try {
      const resp = await authFetch('/api/goals')
      if (!resp.ok) { _goalsInitPhase = false; if (_goalsDirty) saveGoals(); return false }
      if (_goalsDirty) { _goalsInitPhase = false; if (_goalsDirty) saveGoals(); return false }
      const d = await resp.json()
      if (d.monthlyGoals) monthlyGoals.value = d.monthlyGoals
      if (d.weeklyTasks) weeklyTasks.value = d.weeklyTasks
      if (d.mNextId) mNextId.value = d.mNextId
      if (d.wNextId) wNextId.value = d.wNextId
      uni.setStorageSync('dt_goals', JSON.stringify({
        monthlyGoals: monthlyGoals.value, weeklyTasks: weeklyTasks.value,
        mNextId: mNextId.value, wNextId: wNextId.value
      }))
      _goalsDirty = false
      uni.removeStorageSync('dt_goals_dirty')
      _goalsInitPhase = false
      return true
    } catch {}
    _goalsInitPhase = false
    if (_goalsDirty) saveGoals()
    return false
  }

  function matchesTaskRepeat(t: any, dk: string): boolean {
    if (!t.deadline) return false
    if (t.excludes && t.excludes.includes(dk)) return false
    if (t.deadline === dk) return true
    if (!t.repeat) return false
    const ed = new Date(t.deadline + 'T00:00:00')
    const d = new Date(dk + 'T00:00:00')
    if (d < ed) return false
    if (t.repeatEnd && dk > t.repeatEnd) return false
    const dow = d.getDay()
    if (t.repeat === 'daily') return true
    if (t.repeat === 'weekday' && dow >= 1 && dow <= 5) return true
    if (t.repeat === 'weekly' && ed.getDay() === dow) return true
    return false
  }

  function addTaskExclude(id: number, dateStr: string): void {
    const t = tasks.value.find((x: any) => x.id === id)
    if (!t || !t.repeat) return
    if (!t.excludes) t.excludes = []
    if (!t.excludes.includes(dateStr)) t.excludes.push(dateStr)
    saveTasks()
  }

  function stopTaskRepeatFrom(id: number, dateStr: string): void {
    const t = tasks.value.find((x: any) => x.id === id)
    if (!t || !t.repeat) return
    if (dateStr === t.deadline) {
      tasks.value = tasks.value.filter((x: any) => x.id !== id)
      const wt = weeklyTasks.value.find((w: any) => w.frozenTaskId === id)
      if (wt) { weeklyTasks.value = weeklyTasks.value.filter((x: any) => x.id !== wt.id); saveGoals() }
    } else {
      const d = new Date(dateStr + 'T00:00:00')
      d.setDate(d.getDate() - 1)
      t.repeatEnd = dateKey(d)
    }
    saveTasks()
  }

  function forkTaskInstance(id: number, viewDate: string, overrides: any): any {
    const t = tasks.value.find((x: any) => x.id === id)
    if (!t) return null
    if (t.repeat) {
      if (!t.excludes) t.excludes = []
      if (!t.excludes.includes(viewDate)) t.excludes.push(viewDate)
    }
    const forked = {
      id: taskNextId.value++,
      title: t.title, tag: t.tag, deadline: viewDate,
      completed: false, subtasks: [], repeat: null,
      createdAt: new Date().toISOString(),
      ...overrides
    }
    tasks.value.push(forked)
    saveTasks()
    return forked
  }

  function findFrozenMatch(w: any): { task: any; sub: any } | null {
    if (w.frozenTaskId) {
      const ft = tasks.value.find((t: any) => t.id === w.frozenTaskId)
      if (ft) return { task: ft, sub: null }
    }
    const ft2 = tasks.value.find((t: any) => t.title === w.title && t.deadline === w.deadline)
    if (ft2) { w.frozenTaskId = ft2.id; return { task: ft2, sub: null } }
    for (const t of tasks.value) {
      if (!t.subtasks) continue
      const s = t.subtasks.find((s: any) => (s.title || s.label) === w.title && s.deadline === w.deadline)
      if (s) return { task: t, sub: s }
    }
    return null
  }

  function migrateFrozenTaskIds(): void {
    let changed = false
    weeklyTasks.value.forEach((w: any) => {
      if (w.frozenTaskId) return
      const ft = tasks.value.find((t: any) => t.title === w.title && t.deadline === w.deadline)
      if (ft) { w.frozenTaskId = ft.id; changed = true }
    })
    if (changed) saveGoals()
  }

  function isTaskCompleted(task: any): boolean {
    if (!task.subtasks || task.subtasks.length === 0) return task.completed
    return task.subtasks.every((s: any) => s.done)
  }

  function linkEventToTasks(eventId: number, taskIds: number[]): void {
    weeklyTasks.value.forEach((w: any) => {
      if (!w.linkedEventIds) w.linkedEventIds = []
      w.linkedEventIds = w.linkedEventIds.filter((eid: number) => eid !== eventId)
    })
    taskIds.forEach(tid => {
      const w = weeklyTasks.value.find((x: any) => x.id === tid)
      if (w) {
        if (!w.linkedEventIds) w.linkedEventIds = []
        if (!w.linkedEventIds.includes(eventId)) w.linkedEventIds.push(eventId)
      }
    })
    saveGoals()
  }

  function unlinkEvent(eventId: number): void {
    weeklyTasks.value.forEach((w: any) => {
      if (w.linkedEventIds) {
        w.linkedEventIds = w.linkedEventIds.filter((eid: number) => eid !== eventId)
      }
    })
    saveGoals()
  }

  function toggleWeeklyDone(wid: number, done: boolean): void {
    const w = weeklyTasks.value.find((x: any) => x.id === wid)
    if (!w) return
    w.done = done
    const m = findFrozenMatch(w)
    if (m) {
      if (m.sub) { m.sub.done = done; m.task.completed = isTaskCompleted(m.task) }
      else { m.task.completed = done; if (m.task.subtasks) m.task.subtasks.forEach((s: any) => { s.done = done }) }
      saveTasks()
    }
    saveGoals()
  }

  // Init
  loadTasks()
  loadGoals()

  // Defer replay of stale dirty flags until the first pullFromServer runs.
  // A successful pull clears the dirty flag; a failed pull keeps it so a later
  // user action can retry the push with merged data.
  if (uni.getStorageSync('dt_tasks_dirty')) {
    _tasksDirty = true
    _tasksInitPhase = true
  }
  if (uni.getStorageSync('dt_goals_dirty')) {
    _goalsDirty = true
    _goalsInitPhase = true
  }

  return {
    tasks, taskNextId, monthlyGoals, weeklyTasks, mNextId, wNextId,
    loadTasks, saveTasks, syncTasksFromServer,
    loadGoals, saveGoals, syncGoalsFromServer,
    findFrozenMatch, migrateFrozenTaskIds, isTaskCompleted,
    toggleWeeklyDone, linkEventToTasks, unlinkEvent,
    matchesTaskRepeat, addTaskExclude, stopTaskRepeatFrom, forkTaskInstance
  }
})
