import { reactive } from 'vue'

// Global task drag state — shared between goals panel, DDL todos, and calendar views
export const taskDrag = reactive({
  active: false,
  title: '',
  tag: 'work',
  ghost: null  // DOM element
})

export function startTaskDrag(title, tag, e) {
  taskDrag.active = true
  taskDrag.title = title
  taskDrag.tag = tag || 'work'

  // Create floating ghost
  const ghost = document.createElement('div')
  ghost.className = 'task-drag-ghost'
  ghost.textContent = title
  ghost.style.left = (e.clientX + 12) + 'px'
  ghost.style.top = (e.clientY - 14) + 'px'
  document.body.appendChild(ghost)
  taskDrag.ghost = ghost
  document.body.classList.add('task-dragging')
  document.body.style.userSelect = 'none'
}

export function moveTaskDrag(e) {
  if (!taskDrag.active || !taskDrag.ghost) return
  taskDrag.ghost.style.left = (e.clientX + 12) + 'px'
  taskDrag.ghost.style.top = (e.clientY - 14) + 'px'
}

export function endTaskDrag() {
  taskDrag.active = false
  document.body.classList.remove('task-dragging')
  document.body.style.userSelect = ''
  if (taskDrag.ghost) {
    taskDrag.ghost.remove()
    taskDrag.ghost = null
  }
}
