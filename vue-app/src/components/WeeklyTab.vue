<template>
  <div class="goals-nav">
    <button class="goals-nav-btn" @click="prevWeek">‹</button>
    <span class="goals-nav-title">{{ weekLabel }}</span>
    <button class="goals-nav-btn" @click="nextWeekNav">›</button>
  </div>
  <div class="goals-list" ref="listEl">
    <div v-if="!displayGoals.length && !unlinkedItems.length" class="goals-empty">本周暂无任务</div>

    <!-- Groups -->
    <div
      v-for="g in displayGoals" :key="g.id"
      class="weekly-group"
      draggable="true"
      @dragstart="onGroupDragStart(g.id, $event)"
      @dragover.prevent="onGroupDragOver(g.id)"
      @dragleave="groupDragOver = null"
      @drop="onGroupDrop(g.id, $event)"
      @dragend="groupDragOver = null"
      :style="groupDragOver === g.id ? 'box-shadow:0 -2px 0 0 var(--blue)' : ''"
    >
      <div class="weekly-group-header" @click="toggleCollapse(g.id)" @contextmenu.prevent="showGroupMenu(g, $event)">
        <span class="wg-collapse-btn">{{ collapsed[g.id] ? '▶' : '▼' }}</span>
        <span class="weekly-group-drag" @mousedown.stop="onGroupHandleDown" title="拖拽排序">⠿</span>
        <span class="weekly-group-dot" :style="{ background: tagColor(g.tag) }"></span>
        <input
          v-if="renamingGroupId === g.id"
          :ref="el => groupRenameEl = el"
          class="goals-rename-input"
          v-model="groupRenameVal"
          @blur="finishGroupRename(g)"
          @keydown.enter="finishGroupRename(g)"
          @keydown.escape="renamingGroupId = null"
          @click.stop
        >
        <span v-else class="weekly-group-title">{{ g.title }}</span>
        <span class="weekly-group-progress">{{ groupProgress(g.id) }}%</span>
        <span class="weekly-group-count">{{ groupItems(g.id).length }}</span>
        <button class="weekly-del" @click.stop="deleteGroup(g.id)" title="删除分组">✕</button>
      </div>
      <div v-if="!collapsed[g.id]" class="weekly-group-body">
        <WeeklyCard
          v-for="w in groupItems(g.id)" :key="w.id"
          :ref="el => { if (el) cardRefs[w.id] = el }"
          :task="w"
          @toggle="onToggle(w.id, $event)"
          @delete="onDelete(w.id)"
          @rename="onRename(w.id, $event)"
          @drop="onReorder"
          @contextmenu="showTaskMenu(w, $event)"
        />
        <div class="weekly-group-add" @click="addTask(g.id)">
          <span class="wga-icon">+</span><span class="wga-label">添加任务</span>
        </div>
      </div>
    </div>

    <!-- Unlinked -->
    <div v-if="unlinkedItems.length" class="weekly-group">
      <div class="weekly-group-header" @click="toggleCollapse('_unlinked')">
        <span class="wg-collapse-btn">{{ collapsed['_unlinked'] ? '▶' : '▼' }}</span>
        <span class="weekly-group-dot" style="background:var(--text-light)"></span>
        <span class="weekly-group-title" style="color:var(--text-light)">未关联目标</span>
        <span class="weekly-group-count">{{ unlinkedItems.length }}</span>
      </div>
      <div v-if="!collapsed['_unlinked']" class="weekly-group-body">
        <WeeklyCard
          v-for="w in unlinkedItems" :key="w.id"
          :ref="el => { if (el) cardRefs[w.id] = el }"
          :task="w"
          @toggle="onToggle(w.id, $event)"
          @delete="onDelete(w.id)"
          @rename="onRename(w.id, $event)"
          @drop="onReorder"
          @contextmenu="showTaskMenu(w, $event)"
        />
      </div>
    </div>
  </div>

  <!-- New group -->
  <div class="goals-new-group">
    <span class="wga-icon">+</span>
    <input class="goals-new-group-input" v-model="newGroupTitle" placeholder="新建分组..."
      @keydown.enter="createGroup" @keydown.escape="newGroupTitle = ''">
  </div>

  <!-- Context menu -->
  <ContextMenu ref="ctxMenu" />

  <!-- Task edit popover -->
  <TaskEditPop ref="taskEditPop" />

  <!-- Deadline picker (hidden, triggered by context menu) -->
  <Teleport to="body">
    <div v-if="ddlPickerVisible" class="ddl-picker-backdrop" @mousedown="ddlPickerVisible = false"></div>
    <div v-if="ddlPickerVisible" class="ddl-picker-float" :style="ddlPickerStyle">
      <DatePicker v-model="ddlPickerVal" @update:modelValue="onDdlPicked" />
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, reactive, nextTick } from 'vue'
import { useTaskStore } from '../stores/tasks'
import { useUndoStore } from '../stores/undo'
import { dateKey, TAG_COLORS } from '../utils/time'
import WeeklyCard from './WeeklyCard.vue'
import ContextMenu from './ContextMenu.vue'
import DatePicker from './DatePicker.vue'
import TaskEditPop from './TaskEditPop.vue'

const taskStore = useTaskStore()
const undoStore = useUndoStore()

const listEl = ref(null)
const collapsed = reactive({})
const newGroupTitle = ref('')
const ctxMenu = ref(null)
const taskEditPop = ref(null)
const cardRefs = reactive({})

// Group rename state
const renamingGroupId = ref(null)
const groupRenameVal = ref('')
let groupRenameEl = null
const groupDragOver = ref(null)

// Deadline picker state
const ddlPickerVisible = ref(false)
const ddlPickerVal = ref('')
const ddlPickerStyle = ref({})
let ddlPickerWid = null

// Week navigation
const goalsWeek = ref((() => {
  const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return dateKey(d)
})())

const weekLabel = computed(() => {
  const d = new Date(goalsWeek.value + 'T00:00:00')
  const end = new Date(d); end.setDate(end.getDate() + 6)
  return `${d.getMonth() + 1}/${d.getDate()} – ${end.getMonth() + 1}/${end.getDate()}`
})

function prevWeek() {
  const d = new Date(goalsWeek.value + 'T00:00:00'); d.setDate(d.getDate() - 7)
  goalsWeek.value = dateKey(d)
}
function nextWeekNav() {
  const d = new Date(goalsWeek.value + 'T00:00:00'); d.setDate(d.getDate() + 7)
  goalsWeek.value = dateKey(d)
}

function isInWeekRange(deadline) {
  if (!deadline) return false
  const ws = new Date(goalsWeek.value + 'T00:00:00')
  const we = new Date(ws); we.setDate(we.getDate() + 6)
  const dl = new Date(deadline + 'T00:00:00')
  return dl >= ws && dl <= we
}

const weekFiltered = computed(() => taskStore.weeklyTasks.filter(w => isInWeekRange(w.deadline)))
const displayGoals = computed(() => {
  const activeIds = [...new Set(weekFiltered.value.map(w => w.monthGoalId).filter(Boolean))]
  const weekYm = goalsWeek.value.slice(0, 7)
  return taskStore.monthlyGoals.filter(g => {
    if (activeIds.includes(g.id)) return true
    if (g.month === weekYm && !taskStore.weeklyTasks.some(w => w.monthGoalId === g.id)) return true
    return false
  })
})
const unlinkedItems = computed(() => weekFiltered.value.filter(w => !w.monthGoalId))

function groupItems(gid) { return weekFiltered.value.filter(w => w.monthGoalId === gid) }
function groupProgress(gid) {
  const items = groupItems(gid)
  if (!items.length) return 0
  return Math.round(items.filter(w => w.done).length / items.length * 100)
}
function tagColor(tag) { return TAG_COLORS[tag] || 'var(--text-light)' }
function toggleCollapse(id) { collapsed[id] = !collapsed[id] }

// ─── Task actions ───
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

function onRename(wid, newTitle) {
  const w = taskStore.weeklyTasks.find(x => x.id === wid)
  if (!w) return
  undoStore.pushUndo()
  const m = taskStore.findFrozenMatch(w)
  if (m) {
    if (m.sub) { m.sub.title = newTitle; m.sub.label = newTitle } else { m.task.title = newTitle }
    taskStore.saveTasks()
  }
  w.title = newTitle
  taskStore.saveGoals()
}

function onReorder(fromId, toId) {
  const fromIdx = taskStore.weeklyTasks.findIndex(x => x.id === fromId)
  const toIdx = taskStore.weeklyTasks.findIndex(x => x.id === toId)
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return
  undoStore.pushUndo()
  const item = taskStore.weeklyTasks.splice(fromIdx, 1)[0]
  taskStore.weeklyTasks.splice(toIdx, 0, item)
  taskStore.saveGoals()
}

function addTask(gid) {
  const title = prompt('任务名称')
  if (!title?.trim()) return
  undoStore.pushUndo()
  const goal = gid ? taskStore.monthlyGoals.find(g => g.id === gid) : null
  const tag = goal?.tag || 'work'
  const ws = goalsWeek.value
  const frozenId = taskStore.taskNextId++
  taskStore.tasks.push({ id: frozenId, title: title.trim(), tag, completed: false, subtasks: [], deadline: null })
  taskStore.saveTasks()
  taskStore.weeklyTasks.push({
    id: taskStore.wNextId++, title: title.trim(), tag,
    monthGoalId: gid || null, month: ws.slice(0, 7), weekStart: ws,
    startDate: null, deadline: null, done: false, frozenTaskId: frozenId
  })
  taskStore.saveGoals()
}

function createGroup() {
  const title = newGroupTitle.value.trim()
  if (!title) return
  undoStore.pushUndo()
  taskStore.monthlyGoals.push({ id: taskStore.mNextId++, title, tag: 'work', month: goalsWeek.value.slice(0, 7), done: false })
  taskStore.saveGoals()
  newGroupTitle.value = ''
}

// ─── Task context menu ───
function showTaskMenu(w, e) {
  ctxMenu.value?.show(e.clientX, e.clientY, [
    { act: 'edit', icon: '📝', label: '编辑', fn() { taskEditPop.value?.open(w, e.clientX, e.clientY) } },
    { act: 'rename', icon: '✏️', label: '重命名', fn() { nextTick(() => cardRefs[w.id]?.startRename()) } },
    { act: 'deadline', icon: '📅', label: w.deadline ? '修改截止日期' : '设置截止日期', fn() { openDdlPicker(w, e) } },
    { act: 'done', icon: w.done ? '↩️' : '✅', label: w.done ? '标记未完成' : '标记完成', fn() { onToggle(w.id, !w.done) } },
    { act: 'delete', icon: '🗑', label: '删除', cls: 'ctx-danger', fn() { onDelete(w.id) } }
  ])
}

function openDdlPicker(w, e) {
  ddlPickerWid = w.id
  ddlPickerVal.value = w.deadline || ''
  ddlPickerStyle.value = { top: e.clientY + 'px', left: e.clientX + 'px' }
  ddlPickerVisible.value = true
}

function onDdlPicked(val) {
  ddlPickerVisible.value = false
  if (ddlPickerWid === null) return
  const w = taskStore.weeklyTasks.find(x => x.id === ddlPickerWid)
  if (!w) return
  undoStore.pushUndo()
  w.deadline = val || null
  // Sync to frozen view
  const m = taskStore.findFrozenMatch(w)
  if (m) {
    if (m.sub) m.sub.deadline = val || null
    else m.task.deadline = val || null
    taskStore.saveTasks()
  }
  taskStore.saveGoals()
  ddlPickerWid = null
}

// ─── Group context menu ───
function showGroupMenu(g, e) {
  ctxMenu.value?.show(e.clientX, e.clientY, [
    { act: 'rename', icon: '✏️', label: '重命名', fn() { startGroupRename(g) } },
    { act: 'delete', icon: '🗑', label: '删除分组', cls: 'ctx-danger', fn() { deleteGroup(g.id) } }
  ])
}

function startGroupRename(g) {
  renamingGroupId.value = g.id
  groupRenameVal.value = g.title
  nextTick(() => { groupRenameEl?.focus(); groupRenameEl?.select() })
}

function finishGroupRename(g) {
  if (renamingGroupId.value !== g.id) return
  renamingGroupId.value = null
  const v = groupRenameVal.value.trim()
  if (v && v !== g.title) { undoStore.pushUndo(); g.title = v; taskStore.saveGoals() }
}

function deleteGroup(gid) {
  undoStore.pushUndo()
  taskStore.weeklyTasks.forEach(w => { if (w.monthGoalId === gid) w.monthGoalId = null })
  taskStore.monthlyGoals = taskStore.monthlyGoals.filter(x => x.id !== gid)
  taskStore.saveGoals()
}

// ─── Group drag reorder ───
let _groupDragId = null
let _groupFromHandle = false

function onGroupHandleDown() { _groupFromHandle = true }

function onGroupDragStart(gid, e) {
  // If not from group handle, don't interfere (let child card drag bubble)
  if (!_groupFromHandle) return
  _groupDragId = gid
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', 'group-' + gid)
  e.stopPropagation()
}
function onGroupDragOver(gid) {
  if (!_groupDragId) return
  groupDragOver.value = gid
}
function onGroupDrop(toGid, e) {
  groupDragOver.value = null
  if (!_groupDragId || _groupDragId === toGid) return
  // Only handle group drops, not card drops
  const data = e.dataTransfer.getData('text/plain')
  if (!data.startsWith('group-')) return
  e.stopPropagation()
  const fromIdx = taskStore.monthlyGoals.findIndex(x => x.id === _groupDragId)
  const toIdx = taskStore.monthlyGoals.findIndex(x => x.id === toGid)
  if (fromIdx < 0 || toIdx < 0) return
  undoStore.pushUndo()
  const item = taskStore.monthlyGoals.splice(fromIdx, 1)[0]
  taskStore.monthlyGoals.splice(toIdx, 0, item)
  taskStore.saveGoals()
  _groupDragId = null
  _groupFromHandle = false
}
</script>

<style>
.ddl-picker-backdrop {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 398; background: transparent;
}
.ddl-picker-float {
  position: fixed; z-index: 399;
}
</style>
