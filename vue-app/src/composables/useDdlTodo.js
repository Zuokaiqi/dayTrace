import { useTaskStore } from '../stores/tasks'
import { useUndoStore } from '../stores/undo'
import { TAG_COLORS } from '../utils/time'

/**
 * Get DDL todo items for a date key, with enough info to toggle done.
 */
export function getTasksForDate(dk) {
  const taskStore = useTaskStore()
  const result = []
  taskStore.tasks.forEach(t => {
    if (t.deadline === dk) {
      let label = t.title
      try {
        const wt = taskStore.weeklyTasks.find(w => w.frozenTaskId === t.id) ||
                   taskStore.weeklyTasks.find(w => w.title === t.title && w.deadline === t.deadline)
        if (wt?.monthGoalId) {
          const g = taskStore.monthlyGoals.find(x => x.id === wt.monthGoalId)
          if (g) label = g.title + ' · ' + t.title
        }
      } catch {}
      result.push({
        type: 'task', taskId: t.id, subIdx: -1,
        label, done: taskStore.isTaskCompleted(t),
        tagColor: TAG_COLORS[t.tag] || 'var(--text-light)'
      })
    }
    if (t.subtasks) t.subtasks.forEach((s, si) => {
      if (s.deadline === dk) {
        result.push({
          type: 'sub', taskId: t.id, subIdx: si,
          label: t.title + ' · ' + (s.title || s.label || ''),
          done: s.done,
          tagColor: TAG_COLORS[t.tag] || 'var(--text-light)'
        })
      }
    })
  })
  return result
}

/**
 * Toggle a DDL todo item's done state, with bidirectional sync.
 */
export function toggleDdlTodo(item, checked) {
  const taskStore = useTaskStore()
  const undoStore = useUndoStore()
  undoStore.pushUndo()

  const t = taskStore.tasks.find(x => x.id === item.taskId)
  if (!t) return

  if (item.type === 'sub') {
    const s = t.subtasks[item.subIdx]
    if (s) { s.done = checked; t.completed = taskStore.isTaskCompleted(t) }
  } else {
    t.completed = checked
    if (t.subtasks) t.subtasks.forEach(s => { s.done = checked })
  }

  // Sync to goals panel weeklyTasks
  const taskId = item.type === 'sub' ? null : t.id
  let wt = taskId ? taskStore.weeklyTasks.find(w => w.frozenTaskId === taskId) : null
  if (!wt) {
    const title = item.type === 'sub' ? (t.subtasks[item.subIdx]?.title || t.subtasks[item.subIdx]?.label) : t.title
    const dl = item.type === 'sub' ? t.subtasks[item.subIdx]?.deadline : t.deadline
    wt = taskStore.weeklyTasks.find(w => w.title === title && w.deadline === dl)
    if (wt && taskId) wt.frozenTaskId = taskId
  }
  if (wt) { wt.done = checked; taskStore.saveGoals() }

  taskStore.saveTasks()
}

/**
 * Change deadline of a DDL todo item.
 */
export function changeDdlDeadline(item, newDk) {
  const taskStore = useTaskStore()
  const undoStore = useUndoStore()
  undoStore.pushUndo()

  const t = taskStore.tasks.find(x => x.id === item.taskId)
  if (!t) return

  if (item.type === 'sub') {
    const s = t.subtasks[item.subIdx]
    if (s) s.deadline = newDk
  } else {
    t.deadline = newDk
  }

  // Sync to weeklyTasks
  if (item.type !== 'sub') {
    const wt = taskStore.weeklyTasks.find(w => w.frozenTaskId === t.id) ||
               taskStore.weeklyTasks.find(w => w.title === t.title)
    if (wt) { wt.deadline = newDk; taskStore.saveGoals() }
  }
  taskStore.saveTasks()
}

/**
 * Delete a DDL todo item.
 */
export function deleteDdlTodo(item) {
  const taskStore = useTaskStore()
  const undoStore = useUndoStore()
  undoStore.pushUndo()

  const t = taskStore.tasks.find(x => x.id === item.taskId)
  if (!t) return

  if (item.type === 'sub') {
    t.subtasks.splice(item.subIdx, 1)
  } else {
    // Also remove linked weeklyTask
    const wt = taskStore.weeklyTasks.find(w => w.frozenTaskId === t.id)
    if (wt) {
      taskStore.weeklyTasks = taskStore.weeklyTasks.filter(x => x.id !== wt.id)
      taskStore.saveGoals()
    }
    taskStore.tasks = taskStore.tasks.filter(x => x.id !== t.id)
  }
  taskStore.saveTasks()
}

/**
 * Get tomorrow key from a date key.
 */
export function getTomorrowKey(dk) {
  const d = new Date(dk + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Get next week key from a date key.
 */
export function getNextWeekKey(dk) {
  const d = new Date(dk + 'T00:00:00')
  d.setDate(d.getDate() + 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
