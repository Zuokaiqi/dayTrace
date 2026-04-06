<template>
  <Teleport to="body">
    <div v-if="visible" class="task-mini-pop" :style="popStyle" ref="popEl" @mousedown.stop>
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
      <select class="tmp-parent" v-model="parentId">
        <option value="">创建为分组</option>
        <option v-for="g in goals" :key="g.id" :value="g.id">{{ g.title }}</option>
      </select>
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
const parentId = ref('')
const defaultDk = ref('')

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

function close() { visible.value = false }

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
  taskStore.tasks.push({
    id: frozenId, title, tag: tag.value, completed: false,
    subtasks: [], createdAt: new Date().toISOString(), deadline: dl
  })
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
.tmp-parent {
  width: 100%; padding: 6px 10px; border: 1px solid var(--border-light);
  border-radius: var(--radius); font-size: 12px; font-family: var(--font);
  color: var(--text); background: var(--bg); outline: none;
  margin-bottom: 10px; cursor: pointer; box-sizing: border-box;
}
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
