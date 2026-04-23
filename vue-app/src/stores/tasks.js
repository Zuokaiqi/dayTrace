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
  let _tasksDirty = false
  let _goalsDirty = false
  let _tasksPushInFlight = false
  let _goalsPushInFlight = false
  let _tasksLastDirtyTime = 0
  let _goalsLastDirtyTime = 0
  // Startup guard: block push until first pullFromServer runs.
  let _tasksInitPhase = false
  let _goalsInitPhase = false

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
    _tasksDirty = true
    _tasksLastDirtyTime = Date.now()
    localStorage.setItem('dt_tasks_dirty', '1')
    const { notifyDirty } = useSync()
    notifyDirty()
    clearTimeout(_taskSyncTimer)
    _taskSyncTimer = setTimeout(_pushTasksNow, 500)
  }

  function _pushTasksNow() {
    if (_tasksInitPhase) return
    if (_tasksPushInFlight || !_tasksDirty) return
    _tasksPushInFlight = true
    const pushStart = Date.now()
    const { notifyPushStart, notifyPushComplete } = useSync()
    notifyPushStart()
    authFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ tasks: tasks.value, taskNextId: taskNextId.value })
    }).then(() => {
      _tasksPushInFlight = false
      if (_tasksLastDirtyTime <= pushStart) {
        _tasksDirty = false
        localStorage.removeItem('dt_tasks_dirty')
      }
      notifyPushComplete(true)
      if (_tasksDirty) _pushTasksNow()
    }).catch(() => {
      _tasksPushInFlight = false
      notifyPushComplete(false)
    })
  }

  async function syncTasksFromServer() {
    if (_tasksDirty || _tasksPushInFlight) { _tasksInitPhase = false; if (_tasksDirty) _pushTasksNow(); return false }
    try {
      const resp = await authFetch('/api/tasks')
      if (!resp.ok) { _tasksInitPhase = false; if (_tasksDirty) _pushTasksNow(); return false }
      if (_tasksDirty || _tasksPushInFlight) { _tasksInitPhase = false; if (_tasksDirty) _pushTasksNow(); return false }
      const data = await resp.json()
      if (_tasksDirty || _tasksPushInFlight) { _tasksInitPhase = false; if (_tasksDirty) _pushTasksNow(); return false }
      if (data.tasks?.length > 0) {
        tasks.value = data.tasks
        taskNextId.value = data.taskNextId || data.tasks.reduce((m, t) => Math.max(m, t.id || 0), 0) + 1
        localStorage.setItem('dt_tasks', JSON.stringify(tasks.value))
        localStorage.setItem('dt_tnid', taskNextId.value)
        _tasksDirty = false
        localStorage.removeItem('dt_tasks_dirty')
        _tasksInitPhase = false
        return true
      }
      _tasksInitPhase = false
      if (_tasksDirty) _pushTasksNow()
    } catch {}
    _tasksInitPhase = false
    if (_tasksDirty) _pushTasksNow()
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
    _goalsDirty = true
    _goalsLastDirtyTime = Date.now()
    localStorage.setItem('dt_goals_dirty', '1')
    const { notifyDirty } = useSync()
    notifyDirty()
    clearTimeout(_goalsSyncTimer)
    _goalsSyncTimer = setTimeout(_pushGoalsNow, 600)
  }

  function _pushGoalsNow() {
    if (_goalsInitPhase) return
    if (_goalsPushInFlight || !_goalsDirty) return
    _goalsPushInFlight = true
    const pushStart = Date.now()
    const { notifyPushStart, notifyPushComplete } = useSync()
    notifyPushStart()
    const data = {
      monthlyGoals: monthlyGoals.value,
      weeklyTasks: weeklyTasks.value,
      mNextId: mNextId.value,
      wNextId: wNextId.value
    }
    authFetch('/api/goals', { method: 'POST', body: JSON.stringify(data) })
      .then(() => {
        _goalsPushInFlight = false
        if (_goalsLastDirtyTime <= pushStart) {
          _goalsDirty = false
          localStorage.removeItem('dt_goals_dirty')
        }
        notifyPushComplete(true)
        if (_goalsDirty) _pushGoalsNow()
      })
      .catch(() => {
        _goalsPushInFlight = false
        notifyPushComplete(false)
      })
  }

  async function syncGoalsFromServer() {
    if (_goalsDirty || _goalsPushInFlight) { _goalsInitPhase = false; if (_goalsDirty) _pushGoalsNow(); return false }
    try {
      const resp = await authFetch('/api/goals')
      if (!resp.ok) { _goalsInitPhase = false; if (_goalsDirty) _pushGoalsNow(); return false }
      if (_goalsDirty || _goalsPushInFlight) { _goalsInitPhase = false; if (_goalsDirty) _pushGoalsNow(); return false }
      const d = await resp.json()
      if (_goalsDirty || _goalsPushInFlight) { _goalsInitPhase = false; if (_goalsDirty) _pushGoalsNow(); return false }
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
      _goalsDirty = false
      localStorage.removeItem('dt_goals_dirty')
      _goalsInitPhase = false
      return true
    } catch {}
    _goalsInitPhase = false
    if (_goalsDirty) _pushGoalsNow()
    return false
  }

  // ═══ Repeat task helpers ═══
  function matchesTaskRepeat(t, dk) {
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

  function addTaskExclude(id, dateStr) {
    const t = tasks.value.find(x => x.id === id)
    if (!t || !t.repeat) return
    if (!t.excludes) t.excludes = []
    if (!t.excludes.includes(dateStr)) t.excludes.push(dateStr)
    saveTasks()
  }

  function stopTaskRepeatFrom(id, dateStr) {
    const t = tasks.value.find(x => x.id === id)
    if (!t || !t.repeat) return
    if (dateStr === t.deadline) {
      tasks.value = tasks.value.filter(x => x.id !== id)
      // Also remove linked weeklyTask
      const wt = weeklyTasks.value.find(w => w.frozenTaskId === id)
      if (wt) { weeklyTasks.value = weeklyTasks.value.filter(x => x.id !== wt.id); saveGoals() }
    } else {
      const d = new Date(dateStr + 'T00:00:00')
      d.setDate(d.getDate() - 1)
      t.repeatEnd = dateKey(d)
    }
    saveTasks()
  }

  function forkTaskInstance(id, viewDate, overrides) {
    const t = tasks.value.find(x => x.id === id)
    if (!t) return null
    // Inline exclude (avoid double saveTasks from addTaskExclude)
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

  // ─── Event-task bidirectional binding ───
  function linkEventToTasks(eventId, taskIds) {
    weeklyTasks.value.forEach(w => {
      if (!w.linkedEventIds) w.linkedEventIds = []
      w.linkedEventIds = w.linkedEventIds.filter(eid => eid !== eventId)
    })
    taskIds.forEach(tid => {
      const w = weeklyTasks.value.find(x => x.id === tid)
      if (w) {
        if (!w.linkedEventIds) w.linkedEventIds = []
        if (!w.linkedEventIds.includes(eventId)) w.linkedEventIds.push(eventId)
      }
    })
    saveGoals()
  }

  function unlinkEvent(eventId) {
    weeklyTasks.value.forEach(w => {
      if (w.linkedEventIds) {
        w.linkedEventIds = w.linkedEventIds.filter(eid => eid !== eventId)
      }
    })
    saveGoals()
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
  // Defer replay of stale dirty flags until first pullFromServer attempts to sync.
  if (localStorage.getItem('dt_tasks_dirty')) {
    _tasksDirty = true
    _tasksInitPhase = true
  }
  if (localStorage.getItem('dt_goals_dirty')) {
    _goalsDirty = true
    _goalsInitPhase = true
  }

  return {
    tasks, taskNextId, monthlyGoals, weeklyTasks, mNextId, wNextId,
    loadTasks, saveTasks, syncTasksFromServer,
    loadGoals, saveGoals, syncGoalsFromServer,
    findFrozenMatch, migrateFrozenTaskIds, isTaskCompleted,
    toggleWeeklyDone,
    linkEventToTasks, unlinkEvent,
    matchesTaskRepeat, addTaskExclude, stopTaskRepeatFrom, forkTaskInstance
  }
})
