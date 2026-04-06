import { ref } from 'vue'
import { defineStore } from 'pinia'
import { authFetch } from '../utils/api'
import { dateKey } from '../utils/time'
import { useSync } from '../composables/useSync'

export const useTaskStore = defineStore('tasks', () => {
  // ─── Frozen view tasks ───
  const tasks = ref([])
  const taskNextId = ref(1)

  // ─── Goals system ───
  const monthlyGoals = ref([])
  const weeklyTasks = ref([])
  const mNextId = ref(1)
  const wNextId = ref(1)

  let _taskSyncTimer = null
  let _goalsSyncTimer = null

  // ═══ Tasks (frozen view) persistence ═══
  function loadTasks() {
    try {
      const d = localStorage.getItem('dt_tasks')
      if (d) {
        tasks.value = JSON.parse(d)
        taskNextId.value = parseInt(localStorage.getItem('dt_tnid')) || tasks.value.length + 1
      }
    } catch { tasks.value = [] }
  }

  function saveTasks() {
    localStorage.setItem('dt_tasks', JSON.stringify(tasks.value))
    localStorage.setItem('dt_tnid', taskNextId.value)
    clearTimeout(_taskSyncTimer)
    _taskSyncTimer = setTimeout(() => {
      const { notifyPushStart, notifyPushComplete } = useSync()
      notifyPushStart()
      authFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ tasks: tasks.value, taskNextId: taskNextId.value })
      }).then(() => notifyPushComplete(true))
        .catch(() => notifyPushComplete(false))
    }, 500)
  }

  async function syncTasksFromServer() {
    try {
      const resp = await authFetch('/api/tasks')
      if (!resp.ok) return false
      const data = await resp.json()
      if (data.tasks?.length > 0) {
        tasks.value = data.tasks
        taskNextId.value = data.taskNextId || data.tasks.reduce((m, t) => Math.max(m, t.id || 0), 0) + 1
        localStorage.setItem('dt_tasks', JSON.stringify(tasks.value))
        localStorage.setItem('dt_tnid', taskNextId.value)
        return true
      }
    } catch {}
    return false
  }

  // ═══ Goals persistence ═══
  function loadGoals() {
    try {
      const s = localStorage.getItem('dt_goals')
      if (s) {
        const d = JSON.parse(s)
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
    localStorage.setItem('dt_goals', JSON.stringify(data))
    clearTimeout(_goalsSyncTimer)
    _goalsSyncTimer = setTimeout(() => {
      const { notifyPushStart, notifyPushComplete } = useSync()
      notifyPushStart()
      authFetch('/api/goals', { method: 'POST', body: JSON.stringify(data) })
        .then(() => notifyPushComplete(true))
        .catch(() => notifyPushComplete(false))
    }, 600)
  }

  async function syncGoalsFromServer() {
    try {
      const resp = await authFetch('/api/goals')
      if (!resp.ok) return false
      const d = await resp.json()
      if (d.monthlyGoals) monthlyGoals.value = d.monthlyGoals
      if (d.weeklyTasks) weeklyTasks.value = d.weeklyTasks
      if (d.mNextId) mNextId.value = d.mNextId
      if (d.wNextId) wNextId.value = d.wNextId
      localStorage.setItem('dt_goals', JSON.stringify({
        monthlyGoals: monthlyGoals.value,
        weeklyTasks: weeklyTasks.value,
        mNextId: mNextId.value,
        wNextId: wNextId.value
      }))
      return true
    } catch {}
    return false
  }

  // ═══ Cross-system binding ═══
  function findFrozenMatch(w) {
    // 1. By frozenTaskId (new data)
    if (w.frozenTaskId) {
      const ft = tasks.value.find(t => t.id === w.frozenTaskId)
      if (ft) return { task: ft, sub: null }
    }
    // 2. Main task by title+deadline
    const ft2 = tasks.value.find(t => t.title === w.title && t.deadline === w.deadline)
    if (ft2) { w.frozenTaskId = ft2.id; return { task: ft2, sub: null } }
    // 3. Subtask by title+deadline (legacy)
    for (const t of tasks.value) {
      if (!t.subtasks) continue
      const s = t.subtasks.find(s => (s.title || s.label) === w.title && s.deadline === w.deadline)
      if (s) return { task: t, sub: s }
    }
    return null
  }

  function migrateFrozenTaskIds() {
    let changed = false
    weeklyTasks.value.forEach(w => {
      if (w.frozenTaskId) return
      const ft = tasks.value.find(t => t.title === w.title && t.deadline === w.deadline)
      if (ft) { w.frozenTaskId = ft.id; changed = true }
    })
    if (changed) saveGoals()
  }

  function isTaskCompleted(task) {
    if (!task.subtasks || task.subtasks.length === 0) return task.completed
    return task.subtasks.every(s => s.done)
  }

  // ─── Sync toggle done ───
  function toggleWeeklyDone(wid, done) {
    const w = weeklyTasks.value.find(x => x.id === wid)
    if (!w) return
    w.done = done
    const m = findFrozenMatch(w)
    if (m) {
      if (m.sub) { m.sub.done = done; m.task.completed = isTaskCompleted(m.task) }
      else { m.task.completed = done; if (m.task.subtasks) m.task.subtasks.forEach(s => { s.done = done }) }
      saveTasks()
    }
    saveGoals()
  }

  // Init
  loadTasks()
  loadGoals()

  return {
    tasks, taskNextId, monthlyGoals, weeklyTasks, mNextId, wNextId,
    loadTasks, saveTasks, syncTasksFromServer,
    loadGoals, saveGoals, syncGoalsFromServer,
    findFrozenMatch, migrateFrozenTaskIds, isTaskCompleted,
    toggleWeeklyDone
  }
})
