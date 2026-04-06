import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useEventStore } from './events'
import { useTaskStore } from './tasks'
import { useLinkStore } from './links'

const UNDO_MAX = 50

export const useUndoStore = defineStore('undo', () => {
  const undoStack = ref([])
  const redoStack = ref([])
  let _restoring = false

  function _snap() {
    const ev = useEventStore()
    const tk = useTaskStore()
    const lk = useLinkStore()
    return {
      events: JSON.stringify(ev.events),
      nextId: ev.nextId,
      tasks: JSON.stringify(tk.tasks),
      taskNextId: tk.taskNextId,
      monthlyGoals: JSON.stringify(tk.monthlyGoals),
      weeklyTasks: JSON.stringify(tk.weeklyTasks),
      mNextId: tk.mNextId,
      wNextId: tk.wNextId,
      links: JSON.stringify(lk.links),
      linkGroups: JSON.stringify(lk.groups)
    }
  }

  function _restore(snap) {
    _restoring = true
    const ev = useEventStore()
    const tk = useTaskStore()
    const lk = useLinkStore()
    ev.events = JSON.parse(snap.events)
    ev.nextId = snap.nextId
    ev.save()
    tk.tasks = JSON.parse(snap.tasks)
    tk.taskNextId = snap.taskNextId
    tk.monthlyGoals = JSON.parse(snap.monthlyGoals)
    tk.weeklyTasks = JSON.parse(snap.weeklyTasks)
    tk.mNextId = snap.mNextId
    tk.wNextId = snap.wNextId
    tk.saveTasks()
    tk.saveGoals()
    if (snap.links !== undefined) {
      lk.links = JSON.parse(snap.links)
      lk.groups = JSON.parse(snap.linkGroups)
      lk.save()
      lk.saveGroups()
    }
    _restoring = false
  }

  function pushUndo() {
    if (_restoring) return
    try {
      undoStack.value.push(_snap())
      if (undoStack.value.length > UNDO_MAX) undoStack.value.shift()
      redoStack.value = []
    } catch (e) { console.warn('pushUndo error:', e) }
  }

  function undo() {
    if (!undoStack.value.length) return
    redoStack.value.push(_snap())
    _restore(undoStack.value.pop())
  }

  function redo() {
    if (!redoStack.value.length) return
    undoStack.value.push(_snap())
    _restore(redoStack.value.pop())
  }

  const canUndo = () => undoStack.value.length > 0
  const canRedo = () => redoStack.value.length > 0

  return { undoStack, redoStack, pushUndo, undo, redo, canUndo, canRedo }
})
