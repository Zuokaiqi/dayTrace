<template>
  <Teleport to="body">
    <div v-if="isOpen" :class="['popover', 'open']" :style="popStyle" ref="popEl" @mousedown.stop>
      <div class="pop-body">
        <input
          ref="titleInput"
          class="pop-title-input"
          v-model="form.title"
          placeholder="添加主题"
          @keydown.enter.prevent="handleSave"
          @keydown.escape="close"
        />
        <!-- Plan / Actual tabs -->
        <div class="pop-type-tabs">
          <button :class="['pop-type-tab', { sel: form.col === 'plan' }]" @click="form.col = 'plan'">计划</button>
          <button :class="['pop-type-tab', { sel: form.col === 'actual' }]" :disabled="!!form.repeat" @click="form.col = 'actual'">实际</button>
        </div>
        <!-- Time row -->
        <div class="pop-row">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/></svg>
          <TimePicker v-model="form.start" />
          <span class="time-sep">–</span>
          <TimePicker v-model="form.end" />
          <div class="pop-date-pick">
            <DatePicker v-model="form.date" placeholder="选择日期" />
          </div>
        </div>
        <!-- Tags -->
        <div class="pop-row">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4h12M2 8h12M2 12h8"/></svg>
          <div class="pop-tags">
            <span
              v-for="(name, key) in tags" :key="key"
              :class="['pop-tag', { sel: form.tag === key }]"
              @click="form.tag = key"
            >{{ name }}</span>
          </div>
        </div>
        <!-- Note (actual only) -->
        <div v-if="form.col === 'actual'" class="pop-row">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3h10v10H3z"/><path d="M5 6h6M5 8.5h4"/></svg>
          <textarea class="pop-note" v-model="form.note" placeholder="添加描述" rows="1"></textarea>
        </div>
        <!-- Repeat (only shown for plan column) -->
        <div v-if="form.col === 'plan'" class="pop-row">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l2 2-2 2M4 14l-2-2 2-2M14 4H6a4 4 0 000 8h4"/></svg>
          <select v-model="form.repeat" class="pop-repeat-sel" @change="onRepeatChange">
            <option value="">不重复</option>
            <option value="daily">每天</option>
            <option value="weekday">工作日</option>
            <option value="weekly">每周</option>
          </select>
        </div>
      </div>
      <div class="pop-foot">
        <button v-if="editId !== null" class="pbtn pbtn-del" @click="handleDelete">删除</button>
        <button
          v-if="editId !== null && editCol === 'plan' && !editEvHasActual"
          class="pbtn" style="background:var(--green);color:#fff;"
          @click="handleStartExecution"
        >▶ 开始执行</button>
        <div class="spacer"></div>
        <button class="pbtn pbtn-cancel" @click="close">取消</button>
        <button class="pbtn pbtn-save" @click="handleSave">保存</button>
      </div>
    </div>
    <!-- Repeat choice dialog (for edit or delete) -->
    <div v-if="repeatChoice === 'asking' || deleteChoice === 'asking'" class="repeat-choice-overlay" @mousedown.stop>
      <div class="repeat-choice-dialog">
        <div class="repeat-choice-title">{{ deleteChoice === 'asking' ? '删除重复日程' : '修改重复日程' }}</div>
        <div class="repeat-choice-desc">此日程为重复日程，你想如何{{ deleteChoice === 'asking' ? '删除' : '修改' }}？</div>
        <div class="repeat-choice-btns">
          <button class="repeat-choice-btn" @click="deleteChoice === 'asking' ? onDeleteChoice('this') : onRepeatChoice('this')">仅此日程</button>
          <button class="repeat-choice-btn repeat-choice-all" @click="deleteChoice === 'asking' ? onDeleteChoice('all') : onRepeatChoice('all')">此日程及以后</button>
        </div>
        <button class="repeat-choice-cancel" @click="repeatChoice = ''; deleteChoice = ''">取消</button>
      </div>
    </div>
    <!-- Backdrop for click-outside -->
    <div v-if="isOpen" class="pop-backdrop" @mousedown="close"></div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useEventStore } from '../stores/events'
import { useUndoStore } from '../stores/undo'
import { t2m, m2t, dateKey } from '../utils/time'
import TimePicker from './TimePicker.vue'
import DatePicker from './DatePicker.vue'

const eventStore = useEventStore()
const undoStore = useUndoStore()

const tags = { work: '工作', personal: '生活', admin: '事务' }

const isOpen = ref(false)
const popEl = ref(null)
const titleInput = ref(null)
const popStyle = ref({})

const editId = ref(null)
const editCol = ref('plan')
const editViewDate = ref('')  // the date the user was viewing when editing a repeat event

const form = reactive({
  title: '',
  col: 'plan',
  start: '09:00',
  end: '10:00',
  tag: 'work',
  note: '',
  repeat: '',
  date: ''
})

const editEvHasActual = computed(() => {
  if (editId.value === null) return false
  const ev = eventStore.events.find(e => e.id === editId.value)
  return ev?.actual != null
})

function openCreate(colType, start, end, date, anchor) {
  editId.value = null
  editCol.value = colType
  form.title = ''
  form.col = colType
  form.start = start
  form.end = end
  form.tag = 'work'
  form.note = ''
  form.repeat = ''
  form.date = date || dateKey(new Date())
  isOpen.value = true
  positionAt(anchor)
  nextTick(() => titleInput.value?.focus())
}

function openEdit(id, col, anchor, viewDate) {
  const ev = eventStore.events.find(e => e.id === id)
  if (!ev) return
  const data = col === 'plan' ? ev.plan : ev.actual
  if (!data) return
  editId.value = id
  editCol.value = col
  editViewDate.value = viewDate || ev.date
  form.title = ev.title
  form.col = col
  form.start = data.start
  form.end = data.end
  form.tag = ev.tag
  form.note = (col === 'actual' && data.note) ? data.note : ''
  form.repeat = ev.repeat || ''
  form.date = ev.date
  isOpen.value = true
  positionAt(anchor)
  nextTick(() => titleInput.value?.focus())
}

function positionAt(anchor) {
  if (!anchor) {
    popStyle.value = { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }
    return
  }
  nextTick(() => {
    const pw = 360, vw = window.innerWidth, vh = window.innerHeight
    const ph = popEl.value?.offsetHeight || 360
    let x = anchor.x + 6
    if (x + pw > vw - 12) x = anchor.x - pw - 6
    if (x < 8) x = 8
    let y = anchor.y
    if (y + ph > vh - 12) y = vh - ph - 12
    if (y < 52) y = 52
    popStyle.value = { left: x + 'px', top: y + 'px', transform: 'none' }
  })
}

function close() { isOpen.value = false; repeatChoice.value = ''; deleteChoice.value = '' }

// When repeat is selected, force plan column (repeat events only exist in plan)
function onRepeatChange() {
  if (form.repeat) form.col = 'plan'
}

// Repeat edit/delete choice dialogs
const repeatChoice = ref('')   // '' | 'asking' | 'this' | 'all'
const deleteChoice = ref('')   // '' | 'asking' | 'this' | 'all'

function isRepeatInstance() {
  if (editId.value === null) return false
  const ev = eventStore.events.find(e => e.id === editId.value)
  return ev && !!ev.repeat && editViewDate.value && editViewDate.value !== ev.date
}

function handleSave() {
  if (!form.title.trim()) return
  if (!form.start || !form.end || t2m(form.end) <= t2m(form.start)) return

  if (editId.value !== null) {
    const ev = eventStore.events.find(e => e.id === editId.value)
    if (!ev) return

    const isRepeat = !!ev.repeat
    const isNonOriginDate = editViewDate.value && editViewDate.value !== ev.date

    // Editing a repeat event on a non-origin date
    if (isRepeat && isNonOriginDate) {
      if (repeatChoice.value === '') {
        repeatChoice.value = 'asking'
        return  // wait for user choice
      }
      undoStore.pushUndo()
      if (repeatChoice.value === 'this') {
        // Fork: create standalone for this date only
        eventStore.forkInstance(editId.value, editViewDate.value, {
          title: form.title.trim(), tag: form.tag,
          plan: { start: form.start, end: form.end }
        })
      } else {
        // All: modify the original repeat event (affects this and future)
        ev.title = form.title.trim()
        ev.tag = form.tag
        ev.repeat = form.repeat || null
        if (ev.plan) {
          ev.plan.start = form.start
          ev.plan.end = form.end
        } else {
          ev.plan = { start: form.start, end: form.end }
        }
        eventStore.save()
      }
      close()
      return
    }

    // Normal (non-repeat or origin date): direct edit
    undoStore.pushUndo()
    ev.title = form.title.trim()
    ev.tag = form.tag
    ev.date = form.date
    ev.repeat = form.repeat || null
    if (form.col === 'plan') {
      if (!ev.plan) ev.plan = {}
      ev.plan.start = form.start
      ev.plan.end = form.end
    } else {
      if (!ev.actual) ev.actual = {}
      ev.actual.start = form.start
      ev.actual.end = form.end
      ev.actual.note = form.note.trim()
    }
    eventStore.save()
  } else {
    undoStore.pushUndo()
    // Repeat events can only be created in plan
    const hasRepeat = !!form.repeat
    eventStore.addEvent({
      title: form.title.trim(),
      tag: form.tag,
      date: form.date,
      repeat: form.repeat || null,
      plan: (form.col === 'plan' || hasRepeat) ? { start: form.start, end: form.end } : null,
      actual: (form.col === 'actual' && !hasRepeat) ? { start: form.start, end: form.end, note: form.note.trim() } : null
    })
  }
  close()
}

function onRepeatChoice(choice) {
  repeatChoice.value = choice
  handleSave()
}

function handleDelete() {
  if (editId.value === null) return
  const ev = eventStore.events.find(e => e.id === editId.value)
  if (!ev) return

  // For any repeat event, ask the user how to delete
  if (ev.repeat) {
    if (deleteChoice.value === '') {
      deleteChoice.value = 'asking'
      return
    }
    undoStore.pushUndo()
    const viewDate = editViewDate.value || ev.date
    if (deleteChoice.value === 'this') {
      if (viewDate === ev.date) {
        // Deleting origin date: exclude it, but keep the repeat going
        eventStore.addExclude(editId.value, viewDate)
      } else {
        // Exclude just this date
        eventStore.addExclude(editId.value, viewDate)
      }
    } else {
      // Stop repeat from this date onward
      eventStore.stopRepeatFrom(editId.value, viewDate)
    }
    close()
    return
  }

  // Non-repeat event: original behavior
  undoStore.pushUndo()
  if (editCol.value === 'plan') ev.plan = null
  else ev.actual = null
  if (!ev.plan && !ev.actual) eventStore.removeEvent(editId.value)
  else eventStore.save()
  close()
}

function onDeleteChoice(choice) {
  deleteChoice.value = choice
  handleDelete()
}

function handleStartExecution() {
  if (editId.value === null) return
  const ev = eventStore.events.find(e => e.id === editId.value)
  if (!ev || !ev.plan || ev.actual) return
  undoStore.pushUndo()
  const now = new Date()
  const nowM = now.getHours() * 60 + now.getMinutes()
  const snapNow = Math.round(nowM / 30) * 30
  const duration = t2m(ev.plan.end) - t2m(ev.plan.start)
  const actualTime = { start: m2t(snapNow), end: m2t(Math.min(snapNow + duration, 24 * 60)), note: '' }

  // For repeat instances: fork then add actual to the fork
  if (ev.repeat && editViewDate.value && editViewDate.value !== ev.date) {
    eventStore.forkInstance(editId.value, editViewDate.value, {
      actual: actualTime
    })
  } else {
    ev.actual = actualTime
    eventStore.save()
  }
  close()
}

function onKeydown(e) {
  if (e.key === 'Escape' && isOpen.value) close()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

defineExpose({ openCreate, openEdit, close })
</script>

<style>
.pop-backdrop {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  z-index: 199; background: transparent;
}
.pop-repeat-sel {
  border: 1px solid transparent; border-radius: var(--radius);
  padding: 4px 8px; font-family: inherit; font-size: 13px;
  color: var(--text); background: transparent; outline: none;
  cursor: pointer; transition: var(--transition);
}
.pop-repeat-sel:hover { background: var(--bg-hover); }

/* Repeat choice dialog */
.repeat-choice-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg-mask); z-index: 250;
  display: flex; align-items: center; justify-content: center;
}
.repeat-choice-dialog {
  background: var(--bg); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);
  padding: 24px 28px; width: 300px; text-align: center;
}
.repeat-choice-title { font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 8px; }
.repeat-choice-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; }
.repeat-choice-btns { display: flex; gap: 10px; margin-bottom: 12px; }
.repeat-choice-btn {
  flex: 1; padding: 10px; border: 1px solid var(--border-light); border-radius: var(--radius-lg);
  background: var(--bg); color: var(--text); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: var(--transition);
}
.repeat-choice-btn:hover { border-color: var(--blue); color: var(--blue); background: var(--blue-bg); }
.repeat-choice-all { background: var(--blue); color: #fff; border-color: var(--blue); }
.repeat-choice-all:hover { opacity: .9; background: var(--blue); color: #fff; }
.repeat-choice-cancel {
  border: none; background: transparent; color: var(--text-light); font-size: 12px;
  cursor: pointer; padding: 4px 12px;
}
</style>
