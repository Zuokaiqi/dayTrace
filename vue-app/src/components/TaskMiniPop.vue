<template>
  <Teleport to="body">
    <div v-if="visible" class="task-mini-pop" :style="popStyle" ref="popEl" @mousedown.stop="onPopMousedown">
      <div class="tmp-header">新建任务 <span class="tmp-date">{{ dateLabel }}</span></div>
      <input
        ref="nameInput"
        class="tmp-input"
        v-model="name"
        placeholder="任务名称"
        @keydown.enter.prevent="doCreate"
        @keydown.escape="close"
      >
      <div class="tmp-tags">
        <span
          v-for="(label, key) in tags" :key="key"
          :class="['tmp-tag', { sel: tag === key }]"
          :style="tag === key ? `background:${tagColors[key]};color:#fff;border-color:${tagColors[key]}` : ''"
          @click="tag = key"
        >{{ label }}</span>
      </div>
      <div class="tmp-date-row">
        <span class="tmp-date-label">截止</span>
        <DatePicker v-model="deadline" placeholder="选择日期" />
      </div>
      <div class="tmp-date-row">
        <span class="tmp-date-label">循环</span>
        <div class="tmp-picker" ref="repeatPickerRef" style="margin-bottom:0">
          <div class="tmp-picker-trigger" @click="repeatDropOpen = !repeatDropOpen">
            <span class="tmp-picker-text">{{ repeatLabel }}</span>
            <span class="tmp-picker-arrow" :class="{ open: repeatDropOpen }">▾</span>
          </div>
          <div v-if="repeatDropOpen" class="tmp-picker-dropdown">
            <div v-for="opt in repeatOpts" :key="opt.value"
              :class="['tmp-picker-opt', { sel: repeat === opt.value }]"
              @click="repeat = opt.value; repeatDropOpen = false">
              {{ opt.label }}
            </div>
          </div>
        </div>
      </div>
      <div class="tmp-picker" ref="parentPickerRef">
        <div class="tmp-picker-trigger" @click="parentDropOpen = !parentDropOpen">
          <span class="tmp-picker-text">{{ parentLabel }}</span>
          <span class="tmp-picker-arrow" :class="{ open: parentDropOpen }">▾</span>
        </div>
        <div v-if="parentDropOpen" class="tmp-picker-dropdown">
          <div :class="['tmp-picker-opt', { sel: !parentId }]"
            @click="parentId = ''; parentDropOpen = false">
            <span class="tmp-picker-dot" style="background:var(--text-light)"></span>
            创建为分组
          </div>
          <div v-for="g in goals" :key="g.id"
            :class="['tmp-picker-opt', { sel: parentId == g.id }]"
            @click="parentId = g.id; parentDropOpen = false">
            <span class="tmp-picker-dot" :style="{ background: tagColors[g.tag] || 'var(--text-light)' }"></span>
            {{ g.title }}
          </div>
        </div>
      </div>
      <div class="tmp-foot">
        <button class="tmp-cancel" @click="close">取消</button>
        <button class="tmp-confirm" @click="doCreate">创建</button>
      </div>
    </div>
    <div v-if="visible" class="tmp-backdrop" @mousedown="close"></div>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useTaskStore } from '../stores/tasks'
import { useUndoStore } from '../stores/undo'
import { dateKey, TAG_COLORS, TAG_NAMES } from '../utils/time'
import DatePicker from './DatePicker.vue'

const taskStore = useTaskStore()
const undoStore = useUndoStore()

const visible = ref(false)
const popEl = ref(null)
const nameInput = ref(null)
const popStyle = ref({})

const name = ref('')
const tag = ref('work')
const deadline = ref('')
const repeat = ref('')
const parentId = ref('')
const defaultDk = ref('')
const repeatDropOpen = ref(false)
const repeatPickerRef = ref(null)
const parentDropOpen = ref(false)
const parentPickerRef = ref(null)

const repeatOpts = [
  { value: '', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekday', label: '工作日' },
  { value: 'weekly', label: '每周' }
]
const repeatLabel = computed(() => {
  const o = repeatOpts.find(x => x.value === repeat.value)
  return o ? o.label : '不重复'
})
const parentLabel = computed(() => {
  if (!parentId.value) return '创建为分组'
  const g = taskStore.monthlyGoals.find(x => x.id == parentId.value)
  return g ? g.title : '创建为分组'
})

const tags = TAG_NAMES
const tagColors = { work: 'var(--blue)', personal: 'var(--green)', admin: 'var(--orange)' }

const goals = computed(() => taskStore.monthlyGoals)

const dateLabel = computed(() => {
  const dk = deadline.value || defaultDk.value
  return dk ? dk.slice(5).replace('-', '/') : ''
})

function open(x, y, dk) {
  defaultDk.value = dk || dateKey(new Date())
  deadline.value = dk || ''
  name.value = ''
  tag.value = 'work'
  repeat.value = ''
  parentId.value = ''
  visible.value = true

  nextTick(() => {
    let top = y, left = x
    const pw = 240
    if (left + pw > window.innerWidth) left = window.innerWidth - pw - 8
    if (top + 260 > window.innerHeight) top = window.innerHeight - 264
    if (top < 4) top = 4
    if (left < 4) left = 4
    popStyle.value = { top: top + 'px', left: left + 'px' }
    nameInput.value?.focus()
  })
}

function close() { visible.value = false; repeatDropOpen.value = false; parentDropOpen.value = false }

function onPopMousedown(e) {
  if (repeatPickerRef.value && !repeatPickerRef.value.contains(e.target)) repeatDropOpen.value = false
  if (parentPickerRef.value && !parentPickerRef.value.contains(e.target)) parentDropOpen.value = false
}

function doCreate() {
  const title = name.value.trim()
  if (!title) return
  undoStore.pushUndo()

  const gid = parentId.value ? parseInt(parentId.value) : null
  const dl = deadline.value || defaultDk.value || null
  const ws = (() => {
    if (!dl) return dateKey(new Date())
    const d = new Date(dl + 'T00:00:00')
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return dateKey(d)
  })()

  // Create frozen task
  const frozenId = taskStore.taskNextId++
  const taskObj = {
    id: frozenId, title, tag: tag.value, completed: false,
    subtasks: [], createdAt: new Date().toISOString(), deadline: dl
  }
  if (repeat.value) taskObj.repeat = repeat.value
  taskStore.tasks.push(taskObj)
  taskStore.saveTasks()

  if (gid) {
    // Create weeklyTask linked to group
    const goal = taskStore.monthlyGoals.find(g => g.id === gid)
    taskStore.weeklyTasks.push({
      id: taskStore.wNextId++, title, tag: goal?.tag || tag.value,
      monthGoalId: gid, month: (dl || ws).slice(0, 7), weekStart: ws,
      startDate: null, deadline: dl, done: false, frozenTaskId: frozenId
    })
  } else {
    // Create new group
    taskStore.monthlyGoals.push({
      id: taskStore.mNextId++, title, tag: tag.value,
      month: (dl || ws).slice(0, 7), done: false
    })
  }
  taskStore.saveGoals()
  close()
}

defineExpose({ open, close })
</script>

<style>
.task-mini-pop {
  position: fixed; z-index: 300; width: 240px;
  background: var(--bg); border: 1px solid var(--border-light);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
  padding: 12px; animation: tmpIn .15s ease;
}
@keyframes tmpIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; } }
.tmp-header {
  font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 10px;
  display: flex; align-items: center; gap: 6px;
}
.tmp-date { font-size: 11px; font-weight: 400; color: var(--text-light); }
.tmp-input {
  width: 100%; padding: 7px 10px; border: 1px solid var(--border-light);
  border-radius: var(--radius); font-size: 13px; font-family: var(--font);
  color: var(--text); background: var(--bg); outline: none; transition: var(--transition);
  box-sizing: border-box;
}
.tmp-input:focus { border-color: var(--blue); box-shadow: 0 0 0 2px var(--blue-bg); }
.tmp-tags { display: flex; gap: 4px; margin: 10px 0; }
.tmp-tag {
  padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 500;
  border: 1px solid var(--border-light); background: transparent;
  color: var(--text-secondary); cursor: pointer; transition: var(--transition);
}
.tmp-tag:hover { border-color: var(--text-light); }
.tmp-date-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
}
.tmp-date-label { font-size: 12px; color: var(--text-light); font-weight: 500; flex-shrink: 0; }
.tmp-picker { position: relative; flex: 1; margin-bottom: 10px; }
.tmp-picker-trigger {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; border: 1px solid var(--border-light); border-radius: var(--radius);
  cursor: pointer; font-size: 12px; color: var(--text); background: var(--bg);
  transition: var(--transition); user-select: none; box-sizing: border-box;
}
.tmp-picker-trigger:hover { border-color: var(--border); }
.tmp-picker-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tmp-picker-arrow { font-size: 10px; color: var(--text-light); transition: transform .15s; }
.tmp-picker-arrow.open { transform: rotate(180deg); }
.tmp-picker-dropdown {
  position: absolute; top: 100%; left: 0; margin-top: 4px;
  min-width: 100%; width: max-content;
  background: var(--bg); border: 1px solid var(--border-light); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg); max-height: 180px; overflow-y: auto; z-index: 310;
  padding: 4px; animation: tmpDropIn .12s ease;
}
@keyframes tmpDropIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; } }
.tmp-picker-opt {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; font-size: 12px; color: var(--text); cursor: pointer;
  border-radius: var(--radius); transition: var(--transition); white-space: nowrap;
}
.tmp-picker-opt:hover { background: var(--bg-hover); }
.tmp-picker-opt.sel { color: var(--blue); font-weight: 500; background: var(--blue-bg); }
.tmp-picker-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.tmp-foot { display: flex; justify-content: flex-end; gap: 6px; }
.tmp-cancel, .tmp-confirm {
  padding: 5px 14px; border-radius: var(--radius); font-size: 12px;
  font-family: var(--font); cursor: pointer; transition: var(--transition); border: none;
}
.tmp-cancel { background: var(--bg-hover); color: var(--text-secondary); }
.tmp-cancel:hover { background: var(--border-light); }
.tmp-confirm { background: var(--blue); color: #fff; }
.tmp-confirm:hover { opacity: .9; }
.tmp-backdrop {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 299; background: transparent;
}
</style>
