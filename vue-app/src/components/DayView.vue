<template>
  <div class="day-view">
    <div class="day-timeline" ref="scrollEl">
      <div class="day-frozen-header">
        <div class="ddl-todo-bar" >
          <div
            v-for="(it, idx) in todayTasks" :key="idx"
            :class="['ddl-todo-item', { done: it.done, running: isTaskRunning(it) }]"
            draggable="true"
            @dragstart="onDdlDragStart(it, $event)"
            @dragend="endTaskDrag()"
            @contextmenu.prevent="showDdlMenu(it, dk, $event)"
          >
            <span class="ddl-todo-dot" :style="{ background: it.tagColor }"></span>
            <span class="ddl-todo-text">{{ it.label }}</span>
            <button v-if="isTaskRunning(it)" class="ddl-exec-btn ddl-exec-stop" @click.stop="onExecStop()" title="结束执行">
              <span class="ddl-exec-timer">{{ formatElapsed(elapsed) }}</span> ■
            </button>
            <button v-else-if="it.done" class="ddl-exec-btn ddl-exec-done" disabled>✓</button>
            <button v-else class="ddl-exec-btn ddl-exec-start" @click.stop="onExecStart(it)" title="开始执行">▶</button>
          </div>
          <div class="ddl-add-btn ddl-add-btn-h" @click.stop="onTodoBarClick($event)">+</div>
        </div>
        <div style="display:grid;grid-template-columns:56px 1fr 1fr;">
          <div style="background:var(--bg);border-bottom:1px solid var(--border);padding:8px;"></div>
          <div class="col-header plan-h">PLANNED · 计划执行</div>
          <div class="col-header actual-h">ACTUAL · 实际发生</div>
        </div>
      </div>
      <div class="day-grid" ref="gridEl">
        <div class="time-gutter" :style="{ height: colH + 'px' }">
          <div v-for="i in totalSlots" :key="i" class="time-mark">
            <span>{{ slotLabel(i - 1) }}</span>
          </div>
        </div>
        <div class="day-col plan-col" ref="planColRef" :style="{ height: colH + 'px' }" @mousedown="onPlanMousedown" @dragover.prevent="onGridDragOver($event)" @drop="onGridDrop('plan', $event)">
          <div class="drag-ghost"></div>
          <div class="ev-drop-preview"></div>
          <div v-for="i in totalSlots" :key="i" :class="['grid-line', { hour: (i - 1) % 2 === 0 }]"></div>
          <EventBlock
            v-for="ev in planEvs" :key="ev.id"
            :ev="ev" col="plan" :layout="planLayout.get(ev.id)" :showResize="true"
            :ref="el => bindEvEl(el, ev.id, 'plan')"
            @click-event="onClickEvent"
            @ctx-event="onCtxEvent"
          />
          <NowLine />
        </div>
        <div class="day-col actual-col" ref="actualColRef" :style="{ height: colH + 'px' }" @mousedown="onActualMousedown" @dragover.prevent="onGridDragOver($event)" @drop="onGridDrop('actual', $event)">
          <div class="drag-ghost"></div>
          <div class="ev-drop-preview"></div>
          <div v-for="i in totalSlots" :key="i" :class="['grid-line', { hour: (i - 1) % 2 === 0 }]"></div>
          <EventBlock
            v-for="ev in actualEvs" :key="ev.id"
            :ev="ev" col="actual" :layout="actualLayout.get(ev.id)" :showResize="true"
            :ref="el => bindEvEl(el, ev.id, 'actual')"
            @click-event="onClickEvent"
            @ctx-event="onCtxEvent"
          />
          <NowLine />
        </div>
      </div>
    </div>
  </div>
  <ContextMenu ref="ddlCtxMenu" />
  <TaskMiniPop ref="taskMiniPop" />
  <TaskEditPop ref="taskEditPop" />
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useUiStore } from '../stores/ui'
import { useEventStore } from '../stores/events'
import { useTaskStore } from '../stores/tasks'
import { useUndoStore } from '../stores/undo'
import { dateKey, SH, EH, SL, TAG_COLORS, t2m, y2m, m2t, pos, SNAP } from '../utils/time'
import { calcOverlapLayout } from '../utils/layout'
import { usePopover } from '../composables/usePopover'
import { getTasksForDate, toggleDdlTodo, changeDdlDeadline, deleteDdlTodo, getTomorrowKey, getNextWeekKey } from '../composables/useDdlTodo'
import { useExecution } from '../composables/useExecution'
import { createDragMoveHandler } from '../composables/useDragMove'
import { setupResize } from '../composables/useResize'
import { taskDrag, endTaskDrag, moveTaskDrag } from '../composables/useTaskDrag'
import EventBlock from './EventBlock.vue'
import NowLine from './NowLine.vue'
import ContextMenu from './ContextMenu.vue'
import TaskMiniPop from './TaskMiniPop.vue'
import TaskEditPop from './TaskEditPop.vue'

const ui = useUiStore()
const eventStore = useEventStore()
const taskStore = useTaskStore()
const undoStore = useUndoStore()
const { openCreate, openEdit } = usePopover()

const scrollEl = ref(null)
const gridEl = ref(null)
const planColRef = ref(null)
const actualColRef = ref(null)
const totalSlots = (EH - SH) * 2
const colH = totalSlots * SL

const dayEvs = computed(() => eventStore.eventsForDate(ui.curDate))
const planEvs = computed(() => dayEvs.value.filter(e => e.plan))
const actualEvs = computed(() => dayEvs.value.filter(e => e.actual))
const planLayout = computed(() =>
  calcOverlapLayout(planEvs.value.map(e => ({ id: e.id, startMin: t2m(e.plan.start), endMin: t2m(e.plan.end) })))
)
const actualLayout = computed(() =>
  calcOverlapLayout(actualEvs.value.map(e => ({ id: e.id, startMin: t2m(e.actual.start), endMin: t2m(e.actual.end) })))
)
const dk = computed(() => dateKey(ui.curDate))

const todayTasks = computed(() => getTasksForDate(dk.value))
const ddlCtxMenu = ref(null)
const taskMiniPop = ref(null)
const taskEditPop = ref(null)

const { activeEventId, elapsed, startFromDdlTask, stopExecution, formatElapsed } = useExecution()

function isTaskRunning(item) {
  if (!activeEventId.value) return false
  // Check if the active event was started from this DDL task
  const ev = eventStore.events.find(e => e.id === activeEventId.value)
  if (!ev) return false
  // Match by title (strip group prefix)
  const taskName = item.label.split(' · ').pop()
  return ev.title === taskName
}

function onExecStart(item) {
  startFromDdlTask(item, dk.value)
}

function onExecStop() {
  stopExecution()
}

function onDdlDragStart(item, e) {
  e.dataTransfer.effectAllowed = 'copyMove'
  e.dataTransfer.setData('text/plain', 'ddl')
  taskDrag.active = true
  taskDrag.title = item.label
  taskDrag.tag = 'work'
}

function onTodoBarClick(e) {
  taskMiniPop.value?.open(e.clientX, e.clientY, dk.value)
}

// ─── HTML5 DnD drop on grid (for DDL/task → calendar) ───
function onGridDragOver(e) {
  if (!taskDrag.active) return
  e.dataTransfer.dropEffect = 'copy'
  const col = e.target.closest('.day-col')
  if (col) {
    const snapMin = y2m(getGridY(e.clientY))
    hideTaskPreview()
    showTaskPreview(col, snapMin)
  }
}

function onGridDrop(colType, e) {
  e.preventDefault()
  hideTaskPreview()
  if (!taskDrag.active) return
  const snapMin = y2m(getGridY(e.clientY))
  const endMin = Math.min(snapMin + 60, EH * 60)
  if (snapMin < SH * 60 || snapMin >= endMin) { endTaskDrag(); return }

  // Tasks from left panel / DDL bar always create plan events
  undoStore.pushUndo()
  eventStore.addEvent({
    title: taskDrag.title, tag: taskDrag.tag, date: dk.value,
    repeat: null,
    plan: { start: m2t(snapMin), end: m2t(endMin) },
    actual: null
  })
  endTaskDrag()
}

function showDdlMenu(item, dkRef, e) {
  const d = typeof dkRef === 'object' ? dkRef.value : dkRef
  const menuItems = []

  // Find linked weeklyTask for edit
  if (item.type !== 'sub') {
    const t = taskStore.tasks.find(x => x.id === item.taskId)
    if (t) {
      const wt = taskStore.weeklyTasks.find(w => w.frozenTaskId === t.id) ||
                 taskStore.weeklyTasks.find(w => w.title === t.title && w.deadline === t.deadline)
      if (wt) {
        menuItems.push({ act: 'edit', icon: '📝', label: '编辑', fn() { taskEditPop.value?.open(wt, e.clientX, e.clientY) } })
      }
    }
  }

  menuItems.push(
    { act: 'tomorrow', icon: '📅', label: '挪到明天', fn() { changeDdlDeadline(item, getTomorrowKey(d)) } },
    { act: 'nextweek', icon: '📅', label: '挪到下周', fn() { changeDdlDeadline(item, getNextWeekKey(d)) } },
    { act: 'done', icon: item.done ? '↩️' : '✅', label: item.done ? '标记未完成' : '标记完成', fn() { toggleDdlTodo(item, !item.done) } },
    { act: 'delete', icon: '🗑', label: '删除', cls: 'ctx-danger', fn() { deleteDdlTodo(item) } }
  )

  ddlCtxMenu.value?.show(e.clientX, e.clientY, menuItems)
}

function slotLabel(i) {
  const mins = SH * 60 + i * 30, h = Math.floor(mins / 60), m = mins % 60
  return m === 0 && i > 0 ? String(h).padStart(2, '0') + ':00' : ''
}

function getGridY(clientY) {
  const g = gridEl.value
  return g ? clientY - g.getBoundingClientRect().top : clientY
}

// ─── Drag-create ───
let dragCol = null, dragging = false, sY = 0, cY = 0

function startDragCreate(col, e) {
  if (e.target.closest('.ev') || e.button !== 0) return
  dragCol = col
  dragging = true
  sY = getGridY(e.clientY); cY = sY
  const colEl = col === 'plan' ? planColRef.value : actualColRef.value
  if (colEl) colEl.style.cursor = 'grabbing'
  const ghost = colEl?.querySelector('.drag-ghost')
  if (ghost) {
    const snap = y2m(sY)
    ghost.style.top = pos(m2t(snap)) + 'px'
    ghost.style.height = SL + 'px'
    ghost.style.display = 'block'
    ghost.textContent = `${m2t(snap)} – ${m2t(snap + SNAP)}`
  }
  e.preventDefault()
}

// ─── Task drag drop helpers ───
function getColFromPoint(clientX) {
  for (const col of [planColRef.value, actualColRef.value]) {
    if (!col) continue
    const r = col.getBoundingClientRect()
    if (clientX >= r.left && clientX <= r.right) return col
  }
  return null
}

let _taskPreview = null
function showTaskPreview(colEl, snapMin) {
  if (!_taskPreview) { _taskPreview = document.createElement('div'); _taskPreview.className = 'task-drop-preview' }
  const endMin = Math.min(snapMin + 60, EH * 60)
  const top = pos(m2t(snapMin)), h = pos(m2t(endMin)) - top
  _taskPreview.style.cssText = `position:absolute;top:${top}px;height:${Math.max(h, 20)}px;left:4px;right:4px;display:flex;align-items:center;justify-content:center;`
  _taskPreview.textContent = m2t(snapMin) + ' – ' + m2t(endMin)
  if (_taskPreview.parentElement !== colEl) colEl.appendChild(_taskPreview)
}
function hideTaskPreview() { if (_taskPreview?.parentElement) _taskPreview.remove() }

function onPlanMousedown(e) { startDragCreate('plan', e) }
function onActualMousedown(e) { startDragCreate('actual', e) }

function onDocMousemove(e) {
  // Task drag preview
  if (taskDrag.active) {
    moveTaskDrag(e)
    const col = getColFromPoint(e.clientX)
    hideTaskPreview()
    if (col) {
      const snapMin = y2m(getGridY(e.clientY))
      showTaskPreview(col, snapMin)
    }
    return
  }
  if (!dragging) return
  cY = getGridY(e.clientY)
  const minY = Math.min(sY, cY), maxY = Math.max(sY, cY)
  const s = y2m(minY); let en = y2m(maxY); if (en <= s) en = s + SNAP
  const colEl = dragCol === 'plan' ? planColRef.value : actualColRef.value
  const ghost = colEl?.querySelector('.drag-ghost')
  if (ghost) {
    const tp = pos(m2t(s)), h = pos(m2t(en)) - tp
    ghost.style.top = tp + 'px'
    ghost.style.height = Math.max(h, SL) + 'px'
    ghost.textContent = `${m2t(s)} – ${m2t(en)}`
  }
}

function onDocMouseup(e) {
  // Task drag drop
  if (taskDrag.active) {
    const col = getColFromPoint(e.clientX)
    hideTaskPreview()
    if (col) {
      const snapMin = y2m(getGridY(e.clientY))
      const endMin = Math.min(snapMin + 60, EH * 60)
      if (snapMin >= SH * 60 && snapMin < endMin) {
        undoStore.pushUndo()
        eventStore.addEvent({
          title: taskDrag.title, tag: taskDrag.tag, date: dk.value,
          repeat: null, plan: { start: m2t(snapMin), end: m2t(endMin) }, actual: null
        })
      }
    }
    endTaskDrag()
    return
  }
  if (!dragging) return
  dragging = false
  const colEl = dragCol === 'plan' ? planColRef.value : actualColRef.value
  if (colEl) colEl.style.cursor = ''
  const ghost = colEl?.querySelector('.drag-ghost')
  const minY = Math.min(sY, cY), maxY = Math.max(sY, cY)
  let s = y2m(minY), en = y2m(maxY)
  if (en - s < SNAP) en = s + SNAP
  if (en > EH * 60) en = EH * 60
  if (s >= en) { if (ghost) ghost.style.display = 'none'; return }
  // Get ghost rect before hiding for popover anchor
  const anchor = ghost ? { x: ghost.getBoundingClientRect().right, y: ghost.getBoundingClientRect().top } : null
  if (ghost) ghost.style.display = 'none'
  openCreate(dragCol, m2t(s), m2t(en), dk.value, anchor)
}

// ─── Drag-move (cross-column) ───
function getEvData(id) { return eventStore.events.find(e => e.id === id) }

function isRepeatOnView(evData) {
  return evData && evData.repeat && evData.date !== dk.value
}

function getTargetCol(clientX) {
  const p = planColRef.value, a = actualColRef.value
  if (p) { const r = p.getBoundingClientRect(); if (clientX >= r.left && clientX <= r.right) return 'plan' }
  if (a) { const r = a.getBoundingClientRect(); if (clientX >= r.left && clientX <= r.right) return 'actual' }
  return null
}

function hideAllPreviews() {
  [planColRef.value, actualColRef.value].forEach(col => {
    const p = col?.querySelector('.ev-drop-preview')
    if (p) { p.style.display = 'none'; p.textContent = '' }
  })
}

function getPreview(colName) {
  const col = colName === 'plan' ? planColRef.value : actualColRef.value
  return col?.querySelector('.ev-drop-preview')
}

const dragMoveHandler = createDragMoveHandler(getGridY, {
  getTargetCol,
  hideAllPreviews,
  getPreview,
  onComplete(evData, newStart, newEnd, targetCol) {
    undoStore.pushUndo()
    const timeObj = { start: m2t(newStart), end: m2t(newEnd) }
    // Repeat instance on non-origin date: fork instead of modifying original
    if (isRepeatOnView(evData)) {
      const origCol = evData.plan ? 'plan' : null
      const overrides = {}
      if (targetCol === 'actual' || (!targetCol && origCol !== 'plan')) {
        overrides.actual = { ...timeObj, note: '' }
      } else {
        overrides.plan = { ...timeObj }
      }
      eventStore.forkInstance(evData.id, dk.value, overrides)
      return
    }
    const origCol = evData.actual ? 'actual' : (evData.plan ? 'plan' : null)
    if (targetCol && targetCol !== origCol) {
      if (origCol === 'plan' && targetCol === 'actual') evData.actual = { ...timeObj, note: '' }
      else if (origCol === 'actual' && targetCol === 'plan') evData.plan = { ...timeObj }
    } else {
      const data = evData.actual || evData.plan
      if (data) { data.start = timeObj.start; data.end = timeObj.end }
    }
    eventStore.save()
  }
})

// ─── Bind per-element interactions ───
function bindEvEl(comp, evId, col) {
  if (!comp) return
  nextTick(() => {
    const el = comp.$el
    if (!el || el._bound) return
    el._bound = true
    // Drag-move
    dragMoveHandler.setup(el, evId, getEvData)
    // Resize
    setupResize(el, evId, getEvData, col, (evData, c, newEnd) => {
      undoStore.pushUndo()
      // Repeat instance on non-origin date: fork with new end time
      if (isRepeatOnView(evData)) {
        const plan = evData.plan ? { ...evData.plan, end: newEnd } : null
        eventStore.forkInstance(evData.id, dk.value, { plan })
        return
      }
      const data = c === 'plan' ? evData.plan : evData.actual
      if (data) data.end = newEnd
      eventStore.save()
    })
  })
}

function onCtxEvent(id, col, e) {
  const ev = eventStore.events.find(x => x.id === id)
  if (!ev) return
  const isRepeatView = isRepeatOnView(ev)

  const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const items = []

  // Move actions: for repeat instances, fork then move the fork
  items.push({ act: 'tomorrow', icon: '📅', label: '挪到明天', fn() {
    undoStore.pushUndo()
    if (isRepeatView) {
      const tmr = new Date(dk.value + 'T00:00:00'); tmr.setDate(tmr.getDate() + 1)
      eventStore.forkInstance(id, dk.value, { date: fmtDate(tmr) })
    } else {
      const d = new Date(ev.date + 'T00:00:00'); d.setDate(d.getDate() + 1)
      ev.date = fmtDate(d)
      eventStore.save()
    }
  }})
  items.push({ act: 'nextweek', icon: '📅', label: '挪到下周', fn() {
    undoStore.pushUndo()
    if (isRepeatView) {
      const nw = new Date(dk.value + 'T00:00:00'); nw.setDate(nw.getDate() + 7)
      eventStore.forkInstance(id, dk.value, { date: fmtDate(nw) })
    } else {
      const d = new Date(ev.date + 'T00:00:00'); d.setDate(d.getDate() + 7)
      ev.date = fmtDate(d)
      eventStore.save()
    }
  }})
  items.push({ act: 'reminder', icon: '🔔', label: '提醒设置', children: [
    { act: 'r1', icon: ev.reminder === 1 ? '✓' : ' ', label: '提前 1 分钟', fn() { undoStore.pushUndo(); ev.reminder = 1; eventStore.save() }},
    { act: 'r5', icon: ev.reminder === 5 ? '✓' : ' ', label: '提前 5 分钟', fn() { undoStore.pushUndo(); ev.reminder = 5; eventStore.save() }},
    { act: 'r10', icon: ev.reminder === 10 ? '✓' : ' ', label: '提前 10 分钟', fn() { undoStore.pushUndo(); ev.reminder = 10; eventStore.save() }},
    { act: 'r30', icon: ev.reminder === 30 ? '✓' : ' ', label: '提前 30 分钟', fn() { undoStore.pushUndo(); ev.reminder = 30; eventStore.save() }},
    { act: 'r60', icon: ev.reminder === 60 ? '✓' : ' ', label: '提前 1 小时', fn() { undoStore.pushUndo(); ev.reminder = 60; eventStore.save() }},
    ...(ev.reminder ? [{ act: 'r-off', icon: '🔕', label: '取消提醒', fn() { undoStore.pushUndo(); ev.reminder = null; eventStore.save() }}] : [])
  ]})
  if (ev.repeat) {
    items.push({ act: 'delete-this', icon: '🗑', label: '删除此日程', cls: 'ctx-danger', fn() {
      undoStore.pushUndo()
      eventStore.addExclude(id, dk.value)
    }})
    items.push({ act: 'delete-future', icon: '🗑', label: '删除此日程及以后', cls: 'ctx-danger', fn() {
      undoStore.pushUndo()
      eventStore.stopRepeatFrom(id, dk.value)
    }})
  } else {
    items.push({ act: 'delete', icon: '🗑', label: '删除', cls: 'ctx-danger', fn() {
      undoStore.pushUndo()
      if (col === 'plan') ev.plan = null; else ev.actual = null
      if (!ev.plan && !ev.actual) eventStore.removeEvent(id); else eventStore.save()
    }})
  }

  ddlCtxMenu.value?.show(e.clientX, e.clientY, items)
}

function onClickEvent(id, col, e) {
  const rect = e.target.closest('.ev')?.getBoundingClientRect()
  openEdit(id, col, rect ? { x: rect.right, y: rect.top } : null, dk.value)
}

function scrollToNow() {
  if (!scrollEl.value) return
  const now = new Date(), nm = now.getHours() * 60 + now.getMinutes()
  if (nm >= SH * 60 && nm <= EH * 60) scrollEl.value.scrollTop = Math.max(0, ((nm - SH * 60) / 30) * SL - 200)
  else scrollEl.value.scrollTop = ((8 - SH) * 2) * SL
}

onMounted(() => {
  document.addEventListener('mousemove', onDocMousemove)
  document.addEventListener('mouseup', onDocMouseup)
  nextTick(scrollToNow)
})
onUnmounted(() => {
  document.removeEventListener('mousemove', onDocMousemove)
  document.removeEventListener('mouseup', onDocMouseup)
})
watch(() => ui.curDate, () => nextTick(scrollToNow))
</script>

<style scoped>
.ddl-todo-bar {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 10px 14px; background: var(--bg);
  border-bottom: 1px solid var(--border-light); min-height: 20px;
}
</style>
