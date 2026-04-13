<template>
  <div class="week-view" ref="scrollEl">
    <div class="week-frozen-header">
      <div class="week-header" :style="gridCols">
        <div class="wh-gutter"></div>
        <div
          v-for="d in days" :key="d.key"
          :class="['wh-day', { today: d.isToday }]"
          @click="goToDay(d.date)"
        >
          <div>{{ d.label }}</div>
          <div class="wh-num">{{ d.num }}</div>
        </div>
      </div>
      <div class="week-todo-row" :style="gridCols">
        <div class="wh-gutter"></div>
        <div
          v-for="d in days" :key="'todo-'+d.key"
          :class="['week-todo-cell', { 'ddl-drop-target': ddlDropTarget === d.key }]"
          @dragover.prevent="onDdlDragOver(d.key, $event)"
          @dragleave="ddlDropTarget = null"
          @drop="onDdlDrop(d.key, $event)"
        >
          <label
            v-for="(it, idx) in d.tasks" :key="idx"
            :class="['ddl-todo-item', 'compact', { done: it.done }]"
            draggable="true"
            @dragstart="onDdlDragStart(it, d.key, $event)"
            @dragend="ddlDragItem = null; ddlDropTarget = null; endTaskDrag()"
            @contextmenu.prevent="showDdlMenu(it, d.key, $event)"
          >
            <input type="checkbox" class="ddl-todo-cb" :checked="it.done"
              @change="onTodoCb(it, $event.target.checked)">
            <span class="ddl-todo-dot" :style="{ background: it.tagColor }"></span>
            <span v-if="it.repeat" class="ddl-repeat-icon" title="循环任务">🔁</span>
            <span class="ddl-todo-text">{{ it.label }}</span>
          </label>
          <div class="ddl-add-btn" @click.stop="onTodoCellClick(d.key, $event)">+</div>
        </div>
      </div>
    </div>
    <div class="week-grid" :style="gridCols" ref="gridEl">
      <div class="time-gutter" :style="{ height: colH + 'px' }">
        <div v-for="i in totalSlots" :key="i" class="time-mark">
          <span>{{ slotLabel(i - 1) }}</span>
        </div>
      </div>
      <div
        v-for="(d, idx) in days" :key="'col-'+d.key"
        class="week-col"
        :data-date="d.key"
        :style="{ height: colH + 'px' }"
        :ref="el => weekColRefs[idx] = el"
        @mousedown="onColMousedown(idx, d.key, $event)"
        @dragover.prevent="onGridDragOver($event)"
        @drop="onGridDrop(d.key, $event)"
      >
        <div class="drag-ghost"></div>
        <div class="ev-drop-preview"></div>
        <div v-for="i in totalSlots" :key="i" :class="['grid-line', { hour: (i - 1) % 2 === 0 }]"></div>
        <EventBlock
          v-for="ev in d.colEvs" :key="ev.id"
          :ev="ev" :layout="d.layoutMap.get(ev.id)" :showResize="true"
          :ref="el => bindEvEl(el, ev.id)"
          @click-event="onClickEvent"
          @ctx-event="onCtxEvent"
        />
        <NowLine v-if="idx === 0" />
      </div>
    </div>
  </div>
  <ContextMenu ref="ddlCtxMenu" />
  <TaskMiniPop ref="taskMiniPop" />
  <TaskEditPop ref="taskEditPop" />
</template>

<script setup>
import { computed, ref, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useUiStore } from '../stores/ui'
import { useEventStore } from '../stores/events'
import { useTaskStore } from '../stores/tasks'
import { useUndoStore } from '../stores/undo'
import { weekStart, dateKey, sameDay, WDE, SH, EH, SL, SNAP, TAG_COLORS, t2m, y2m, m2t, pos } from '../utils/time'
import { calcOverlapLayout } from '../utils/layout'
import { usePopover } from '../composables/usePopover'
import { getTasksForDate as getTasksForDateFn, toggleDdlTodo, changeDdlDeadline, deleteDdlTodo, deleteDdlRepeatThis, deleteDdlRepeatFuture, getTomorrowKey, getNextWeekKey } from '../composables/useDdlTodo'
import { createDragMoveHandler } from '../composables/useDragMove'
import { setupResize } from '../composables/useResize'
import { taskDrag, endTaskDrag, moveTaskDrag, startTaskDrag } from '../composables/useTaskDrag'
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
const weekColRefs = reactive([])

const dayCount = 7
const totalSlots = (EH - SH) * 2
const colH = totalSlots * SL
const gridCols = computed(() => ({ '--week-cols': dayCount }))

const days = computed(() => {
  const ws = weekStart(ui.curDate), today = new Date(), result = []
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(ws); d.setDate(d.getDate() + i)
    const dk = dateKey(d)
    const dayEvs = eventStore.eventsForDate(d)
    const colEvs = dayEvs.filter(e => e.actual || e.plan)
    const layoutMap = calcOverlapLayout(colEvs.map(e => {
      const td = e.actual || e.plan
      return { id: e.id, startMin: t2m(td.start), endMin: t2m(td.end) }
    }))
    result.push({
      date: d, key: dk, label: WDE[i], num: d.getDate(),
      isToday: sameDay(d, today), colEvs, layoutMap,
      tasks: getTasksForDate(dk)
    })
  }
  return result
})

function getTasksForDate(dk) { return getTasksForDateFn(dk) }

function onTodoCb(item, checked) { toggleDdlTodo(item, checked) }

// ─── DDL drag to change deadline ───
const ddlDragItem = ref(null)
const ddlDropTarget = ref(null)
const ddlCtxMenu = ref(null)
const taskMiniPop = ref(null)
const taskEditPop = ref(null)

function onDdlDragStart(item, fromDk, e) {
  ddlDragItem.value = { ...item, fromDk }
  e.dataTransfer.effectAllowed = 'copyMove'
  e.dataTransfer.setData('text/plain', 'ddl')
  // Also set taskDrag so grid columns can accept the drop
  taskDrag.active = true
  taskDrag.title = item.label
  taskDrag.tag = 'work'
}

function onDdlDragOver(dk, e) {
  if (!ddlDragItem.value) return
  e.dataTransfer.dropEffect = 'move'
  ddlDropTarget.value = dk
}

function onDdlDrop(newDk, e) {
  ddlDropTarget.value = null
  const item = ddlDragItem.value
  if (!item || newDk === item.fromDk) { ddlDragItem.value = null; return }

  const undoStore = useUndoStore()
  undoStore.pushUndo()

  const t = taskStore.tasks.find(x => x.id === item.taskId)
  if (!t) { ddlDragItem.value = null; return }

  if (item.type === 'sub') {
    const s = t.subtasks[item.subIdx]
    if (s) s.deadline = newDk
  } else {
    t.deadline = newDk
  }

  // Sync to weeklyTasks
  const wt = item.type !== 'sub'
    ? (taskStore.weeklyTasks.find(w => w.frozenTaskId === t.id) || taskStore.weeklyTasks.find(w => w.title === t.title && w.deadline === item.fromDk))
    : null
  if (wt) { wt.deadline = newDk; taskStore.saveGoals() }

  taskStore.saveTasks()
  ddlDragItem.value = null
}

// ─── HTML5 DnD drop on grid (for DDL → calendar) ───
function onGridDragOver(e) {
  if (!ddlDragItem.value && !taskDrag.active) return
  e.dataTransfer.dropEffect = 'copy'
  // Show snap preview
  const col = e.target.closest('.week-col')
  if (col) {
    const snapMin = y2m(getGridY(e.clientY))
    hideTaskPreview()
    showTaskPreview(col, snapMin)
  }
}

function onGridDrop(dk, e) {
  e.preventDefault()
  hideTaskPreview()
  if (!taskDrag.active && !ddlDragItem.value) return
  const snapMin = y2m(getGridY(e.clientY))
  const endMin = Math.min(snapMin + 60, EH * 60)
  if (snapMin < SH * 60 || snapMin >= endMin) return

  const title = taskDrag.active ? taskDrag.title : ddlDragItem.value?.label || ''
  const tag = taskDrag.tag || 'work'

  undoStore.pushUndo()
  eventStore.addEvent({
    title, tag, date: dk,
    repeat: null, plan: { start: m2t(snapMin), end: m2t(endMin) }, actual: null
  })

  endTaskDrag()
  ddlDragItem.value = null
}

function onTodoCellClick(dk, e) {
  if (e.target.closest('.ddl-todo-item')) return
  taskMiniPop.value?.open(e.clientX, e.clientY, dk)
}

function showDdlMenu(item, dk, e) {
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
    { act: 'tomorrow', icon: '📅', label: '挪到明天', fn() { changeDdlDeadline(item, getTomorrowKey(dk)) } },
    { act: 'nextweek', icon: '📅', label: '挪到下周', fn() { changeDdlDeadline(item, getNextWeekKey(dk)) } },
    { act: 'done', icon: item.done ? '↩️' : '✅', label: item.done ? '标记未完成' : '标记完成', fn() { toggleDdlTodo(item, !item.done) } }
  )
  if (item.repeat) {
    menuItems.push(
      { act: 'delete-this', icon: '🗑', label: '删除此任务', cls: 'ctx-danger', fn() { deleteDdlRepeatThis(item, dk) } },
      { act: 'delete-future', icon: '🗑', label: '删除此任务及以后', cls: 'ctx-danger', fn() { deleteDdlRepeatFuture(item, dk) } }
    )
  } else {
    menuItems.push(
      { act: 'delete', icon: '🗑', label: '删除', cls: 'ctx-danger', fn() { deleteDdlTodo(item) } }
    )
  }

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
let dragIdx = -1, dragging = false, sY = 0, cY = 0, dragDk = ''

function onColMousedown(idx, dk, e) {
  if (e.target.closest('.ev') || e.button !== 0) return
  dragIdx = idx; dragDk = dk; dragging = true
  sY = getGridY(e.clientY); cY = sY
  const col = weekColRefs[idx]
  if (col) col.style.cursor = 'grabbing'
  const ghost = col?.querySelector('.drag-ghost')
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
function getWeekColFromPoint(clientX) {
  for (let i = 0; i < weekColRefs.length; i++) {
    const col = weekColRefs[i]
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

function onDocMousemove(e) {
  // Task drag preview
  if (taskDrag.active) {
    moveTaskDrag(e)
    const col = getWeekColFromPoint(e.clientX)
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
  const ghost = weekColRefs[dragIdx]?.querySelector('.drag-ghost')
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
    const col = getWeekColFromPoint(e.clientX)
    hideTaskPreview()
    if (col?.dataset?.date) {
      const snapMin = y2m(getGridY(e.clientY))
      const endMin = Math.min(snapMin + 60, EH * 60)
      if (snapMin >= SH * 60 && snapMin < endMin) {
        undoStore.pushUndo()
        eventStore.addEvent({
          title: taskDrag.title, tag: taskDrag.tag, date: col.dataset.date,
          repeat: null, plan: { start: m2t(snapMin), end: m2t(endMin) }, actual: null
        })
      }
    }
    endTaskDrag()
    return
  }
  if (!dragging) return
  dragging = false
  const col = weekColRefs[dragIdx]
  if (col) col.style.cursor = ''
  const ghost = col?.querySelector('.drag-ghost')
  const minY = Math.min(sY, cY), maxY = Math.max(sY, cY)
  let s = y2m(minY), en = y2m(maxY)
  if (en - s < SNAP) en = s + SNAP
  if (en > EH * 60) en = EH * 60
  if (s >= en) { if (ghost) ghost.style.display = 'none'; return }
  const anchor = ghost ? { x: ghost.getBoundingClientRect().right, y: ghost.getBoundingClientRect().top } : null
  if (ghost) ghost.style.display = 'none'
  openCreate('plan', m2t(s), m2t(en), dragDk, anchor)
}

// ─── Drag-move (cross-day) ───
function getEvData(id) { return eventStore.events.find(e => e.id === id) }

function getViewDateForEl(el) {
  const col = el?.closest?.('[data-date]')
  return col?.dataset?.date || ''
}

function isRepeatOnViewDate(evData, viewDate) {
  return evData && evData.repeat && viewDate && evData.date !== viewDate
}

function getTargetDateCol(clientX) {
  for (let i = 0; i < weekColRefs.length; i++) {
    const col = weekColRefs[i]
    if (!col) continue
    const r = col.getBoundingClientRect()
    if (clientX >= r.left && clientX <= r.right) return col
  }
  return null
}

function hideAllPreviews() {
  weekColRefs.forEach(col => {
    const p = col?.querySelector('.ev-drop-preview')
    if (p) { p.style.display = 'none'; p.textContent = '' }
  })
}

function getPreview(col) { return col?.querySelector('.ev-drop-preview') }

const dragMoveHandler = createDragMoveHandler(getGridY, {
  getTargetCol: getTargetDateCol,
  hideAllPreviews,
  getPreview,
  onComplete(evData, newStart, newEnd, targetCol, srcEl) {
    undoStore.pushUndo()
    const viewDate = srcEl ? getViewDateForEl(srcEl) : ''
    const destDate = targetCol?.dataset?.date || viewDate
    // Repeat instance on non-origin date: fork
    if (isRepeatOnViewDate(evData, viewDate)) {
      eventStore.forkInstance(evData.id, viewDate, {
        date: destDate,
        plan: evData.plan ? { start: m2t(newStart), end: m2t(newEnd) } : null
      })
      return
    }
    const timeData = evData.actual || evData.plan
    if (timeData) { timeData.start = m2t(newStart); timeData.end = m2t(newEnd) }
    if (targetCol?.dataset?.date) evData.date = targetCol.dataset.date
    eventStore.save()
  }
})

function bindEvEl(comp, evId) {
  if (!comp) return
  nextTick(() => {
    const el = comp.$el
    if (!el || el._bound) return
    el._bound = true
    dragMoveHandler.setup(el, evId, getEvData)
    // Resize: determine col type from the event
    const ev = getEvData(evId)
    const col = ev?.actual ? 'actual' : 'plan'
    setupResize(el, evId, getEvData, col, (evData, c, newEnd) => {
      undoStore.pushUndo()
      const viewDate = getViewDateForEl(el)
      // Repeat instance on non-origin date: fork with new end time
      if (isRepeatOnViewDate(evData, viewDate)) {
        const plan = evData.plan ? { ...evData.plan, end: newEnd } : null
        eventStore.forkInstance(evData.id, viewDate, { plan })
        return
      }
      const data = evData.actual || evData.plan
      if (data) data.end = newEnd
      eventStore.save()
    })
  })
}

function onClickEvent(id, col, e) {
  const rect = e.target.closest('.ev')?.getBoundingClientRect()
  // Get the date from the parent week-col
  const colEl = e.target.closest('.week-col')
  const viewDate = colEl?.dataset?.date || ''
  openEdit(id, col, rect ? { x: rect.right, y: rect.top } : null, viewDate)
}

function onCtxEvent(id, col, e) {
  const ev = eventStore.events.find(x => x.id === id)
  if (!ev) return
  // Determine the view date from the column element
  const colEl = e.target.closest('.week-col')
  const viewDate = colEl?.dataset?.date || ''
  const isRepeatView = isRepeatOnViewDate(ev, viewDate)

  const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const items = []

  items.push({ act: 'tomorrow', icon: '📅', label: '挪到明天', fn() {
    undoStore.pushUndo()
    if (isRepeatView) {
      const tmr = new Date(viewDate + 'T00:00:00'); tmr.setDate(tmr.getDate() + 1)
      eventStore.forkInstance(id, viewDate, { date: fmtDate(tmr) })
    } else {
      const d = new Date(ev.date + 'T00:00:00'); d.setDate(d.getDate() + 1)
      ev.date = fmtDate(d)
      eventStore.save()
    }
  }})
  items.push({ act: 'nextweek', icon: '📅', label: '挪到下周', fn() {
    undoStore.pushUndo()
    if (isRepeatView) {
      const nw = new Date(viewDate + 'T00:00:00'); nw.setDate(nw.getDate() + 7)
      eventStore.forkInstance(id, viewDate, { date: fmtDate(nw) })
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
      eventStore.addExclude(id, viewDate || ev.date)
    }})
    items.push({ act: 'delete-future', icon: '🗑', label: '删除此日程及以后', cls: 'ctx-danger', fn() {
      undoStore.pushUndo()
      eventStore.stopRepeatFrom(id, viewDate || ev.date)
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

function goToDay(d) { ui.goToDate(d); ui.setView('day') }

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
