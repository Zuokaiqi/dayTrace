<template>
  <div class="ov-list" ref="listEl">
    <div v-if="!displayGoals.length && !unlinkedItems.length" class="goals-empty">暂无任务</div>

    <div v-for="g in displayGoals" :key="g.id" class="ov-group">
      <div class="ov-group-header" @click="toggleCollapse(g.id)" @contextmenu.prevent="showGroupMenu(g, $event)">
        <span class="ov-collapse">{{ collapsed[g.id] ? '▶' : '▼' }}</span>
        <span class="ov-dot" :style="{ background: tagColor(g.tag) }"></span>
        <span class="ov-group-name">{{ g.title }}</span>
        <span class="ov-group-stat">{{ groupDone(g.id) }}/{{ groupItems(g.id).length }}</span>
      </div>
      <div class="ov-progress-track">
        <div class="ov-progress-fill" :style="{ width: groupPercent(g.id) + '%', background: tagColor(g.tag) }"></div>
      </div>
      <div v-if="!collapsed[g.id]" class="ov-tasks">
        <label v-for="w in groupItems(g.id)" :key="w.id"
          :class="['ov-task', { done: w.done }]"
          @contextmenu.prevent="showTaskMenu(w, $event)"
          @mousedown="onTaskMousedown(w, $event)">
          <input type="checkbox" class="ov-cb" :checked="w.done" @change="onToggle(w.id, $event.target.checked)">
          <span class="ov-task-title">{{ w.title }}</span>
          <span v-if="w.deadline" class="ov-task-ddl">{{ fmtDdl(w.deadline) }}</span>
        </label>
      </div>
    </div>

    <!-- Unlinked -->
    <div v-if="unlinkedItems.length" class="ov-group">
      <div class="ov-group-header" @click="toggleCollapse('_unlinked')">
        <span class="ov-collapse">{{ collapsed['_unlinked'] ? '▶' : '▼' }}</span>
        <span class="ov-dot" style="background:var(--text-light)"></span>
        <span class="ov-group-name" style="color:var(--text-light)">未分组</span>
        <span class="ov-group-stat">{{ unlinkedDone }}/{{ unlinkedItems.length }}</span>
      </div>
      <div class="ov-progress-track">
        <div class="ov-progress-fill" :style="{ width: unlinkedPercent + '%' }"></div>
      </div>
      <div v-if="!collapsed['_unlinked']" class="ov-tasks">
        <label v-for="w in unlinkedItems" :key="w.id"
          :class="['ov-task', { done: w.done }]"
          @contextmenu.prevent="showTaskMenu(w, $event)"
          @mousedown="onTaskMousedown(w, $event)">
          <input type="checkbox" class="ov-cb" :checked="w.done" @change="onToggle(w.id, $event.target.checked)">
          <span class="ov-task-title">{{ w.title }}</span>
          <span v-if="w.deadline" class="ov-task-ddl">{{ fmtDdl(w.deadline) }}</span>
        </label>
      </div>
    </div>
  </div>

  <ContextMenu ref="ctxMenu" />
  <TaskEditPop ref="taskEditPop" />
</template>

<script setup>
import { ref, computed, reactive, nextTick, onMounted, onUnmounted } from 'vue'
import { useTaskStore } from '../stores/tasks'
import { useUndoStore } from '../stores/undo'
import { TAG_COLORS } from '../utils/time'
import { startTaskDrag, moveTaskDrag, endTaskDrag, taskDrag } from '../composables/useTaskDrag'
import ContextMenu from './ContextMenu.vue'
import TaskEditPop from './TaskEditPop.vue'

const taskStore = useTaskStore()
const undoStore = useUndoStore()

const listEl = ref(null)
const collapsed = reactive({})
const ctxMenu = ref(null)
const taskEditPop = ref(null)

const displayGoals = computed(() => taskStore.monthlyGoals)
const unlinkedItems = computed(() => sortTasks([...taskStore.weeklyTasks.filter(w => !w.monthGoalId)]))

function sortTasks(list) {
  return list.sort((a, b) => {
    if (a.done !== b.done) return a.done - b.done
    const da = a.deadline || '\uffff'
    const db = b.deadline || '\uffff'
    return da < db ? -1 : da > db ? 1 : 0
  })
}
function groupItems(gid) {
  return sortTasks(taskStore.weeklyTasks.filter(w => w.monthGoalId === gid))
}
function groupDone(gid) { return groupItems(gid).filter(w => w.done).length }
function groupPercent(gid) {
  const items = groupItems(gid)
  return items.length ? Math.round(groupDone(gid) / items.length * 100) : 0
}
const unlinkedDone = computed(() => unlinkedItems.value.filter(w => w.done).length)
const unlinkedPercent = computed(() =>
  unlinkedItems.value.length ? Math.round(unlinkedDone.value / unlinkedItems.value.length * 100) : 0
)

function tagColor(tag) { return TAG_COLORS[tag] || 'var(--text-light)' }
function toggleCollapse(id) { collapsed[id] = !collapsed[id] }

function fmtDdl(d) {
  if (!d) return ''
  return d.slice(5).replace('-', '/')
}

function onToggle(wid, done) { undoStore.pushUndo(); taskStore.toggleWeeklyDone(wid, done) }

function onDelete(wid) {
  undoStore.pushUndo()
  const w = taskStore.weeklyTasks.find(x => x.id === wid)
  if (w) {
    const m = taskStore.findFrozenMatch(w)
    if (m) {
      if (m.sub) { const idx = m.task.subtasks.indexOf(m.sub); if (idx >= 0) m.task.subtasks.splice(idx, 1) }
      else { const idx = taskStore.tasks.findIndex(t => t.id === m.task.id); if (idx >= 0) taskStore.tasks.splice(idx, 1) }
      taskStore.saveTasks()
    }
  }
  taskStore.weeklyTasks = taskStore.weeklyTasks.filter(x => x.id !== wid)
  taskStore.saveGoals()
}

function showTaskMenu(w, e) {
  ctxMenu.value?.show(e.clientX, e.clientY, [
    { act: 'edit', icon: '📝', label: '编辑', fn() { taskEditPop.value?.open(w, e.clientX, e.clientY) } },
    { act: 'done', icon: w.done ? '↩️' : '✅', label: w.done ? '标记未完成' : '标记完成', fn() { onToggle(w.id, !w.done) } },
    { act: 'delete', icon: '🗑', label: '删除', cls: 'ctx-danger', fn() { onDelete(w.id) } }
  ])
}

function showGroupMenu(g, e) {
  ctxMenu.value?.show(e.clientX, e.clientY, [
    { act: 'delete', icon: '🗑', label: '删除分组', cls: 'ctx-danger', fn() { deleteGroup(g.id) } }
  ])
}

function deleteGroup(gid) {
  undoStore.pushUndo()
  taskStore.weeklyTasks.forEach(w => { if (w.monthGoalId === gid) w.monthGoalId = null })
  taskStore.monthlyGoals = taskStore.monthlyGoals.filter(x => x.id !== gid)
  taskStore.saveGoals()
}

// ─── Calendar drag (mousedown-based) ───
let mDown = false, mStartX = 0, mStartY = 0, mDragging = false, mTask = null

function onTaskMousedown(w, e) {
  if (e.button !== 0) return
  if (e.target.closest('.ov-cb,button,input,select')) return
  mDown = true; mStartX = e.clientX; mStartY = e.clientY; mDragging = false; mTask = w
}

function onDocMousemove(e) {
  if (!mDown) return
  if (!mDragging) {
    if (Math.abs(e.clientX - mStartX) < 6 && Math.abs(e.clientY - mStartY) < 6) return
    mDragging = true
    startTaskDrag(mTask.title, mTask.tag, e)
  }
  moveTaskDrag(e)
}

function onDocMouseup() {
  if (!mDown) return
  mDown = false
  if (!mDragging) { mTask = null; return }
  mDragging = false
  mTask = null
  setTimeout(() => {
    if (taskDrag.active) endTaskDrag()
  }, 10)
}

onMounted(() => {
  document.addEventListener('mousemove', onDocMousemove)
  document.addEventListener('mouseup', onDocMouseup)
})
onUnmounted(() => {
  document.removeEventListener('mousemove', onDocMousemove)
  document.removeEventListener('mouseup', onDocMouseup)
})
</script>

<style>
.ov-list { padding: 10px 16px; flex: 1; overflow-y: auto; }
.ov-group { margin-bottom: 16px; }
.ov-group-header {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 4px; cursor: pointer; border-radius: 8px;
  transition: background .12s ease;
}
.ov-group-header:hover { background: var(--bg-hover); }
.ov-collapse { font-size: 9px; color: var(--text-light); width: 12px; flex-shrink: 0; user-select: none; }
.ov-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.ov-group-name {
  flex: 1; font-size: 14px; font-weight: 600; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ov-group-stat {
  font-size: 12px; color: var(--text-light); font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.ov-progress-track {
  height: 3px; background: var(--bg-hover); border-radius: 2px;
  margin: 4px 4px 8px 24px; overflow: hidden;
}
.ov-progress-fill {
  height: 100%; border-radius: 2px; background: var(--blue);
  transition: width .3s cubic-bezier(.4,0,.2,1);
}
.ov-tasks { padding-left: 24px; }
.ov-task {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 8px; border-radius: 6px; cursor: default;
  transition: background .1s ease;
}
.ov-task:hover { background: var(--bg-hover); }
.ov-task.done { opacity: .45; }
.ov-cb {
  width: 14px; height: 14px; border-radius: 3px; cursor: pointer;
  flex-shrink: 0; accent-color: var(--blue); margin: 0;
}
.ov-task-title {
  flex: 1; font-size: 13px; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ov-task.done .ov-task-title { text-decoration: line-through; color: var(--text-light); }
.ov-task-ddl {
  font-size: 11px; color: var(--text-light); flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
</style>
