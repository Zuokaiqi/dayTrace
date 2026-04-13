<template>
  <Teleport to="body">
    <div v-if="visible" class="task-edit-pop" :style="popStyle" ref="popEl" @mousedown.stop="onPopMousedown">
      <div class="tep-header">编辑任务</div>
      <div class="tep-field">
        <label class="tep-label">任务名称</label>
        <input
          ref="titleInput"
          class="tep-input"
          v-model="form.title"
          placeholder="任务名称"
          @keydown.enter.prevent="doSave"
          @keydown.escape="close"
        >
      </div>
      <div class="tep-field">
        <label class="tep-label">标签</label>
        <div class="tep-tags">
          <span
            v-for="(label, key) in tagNames" :key="key"
            :class="['tep-tag', { sel: form.tag === key }]"
            :style="form.tag === key ? `background:${tagColors[key]};color:#fff;border-color:${tagColors[key]}` : ''"
            @click="form.tag = key"
          >{{ label }}</span>
        </div>
      </div>
      <div class="tep-field">
        <label class="tep-label">开始日期</label>
        <DatePicker v-model="form.startDate" placeholder="选择开始日期" />
      </div>
      <div class="tep-field">
        <label class="tep-label">截止日期</label>
        <DatePicker v-model="form.deadline" placeholder="选择截止日期" />
      </div>
      <div class="tep-field">
        <label class="tep-label">循环</label>
        <div class="tep-group-picker" ref="repeatPickerRef">
          <div class="tep-group-trigger" @click="repeatDropOpen = !repeatDropOpen">
            <span class="tep-group-text">{{ repeatLabel }}</span>
            <span class="tep-group-arrow" :class="{ open: repeatDropOpen }">▾</span>
          </div>
          <div v-if="repeatDropOpen" class="tep-group-dropdown">
            <div v-for="opt in repeatOpts" :key="opt.value"
              :class="['tep-group-opt', { sel: form.repeat === opt.value }]"
              @click="form.repeat = opt.value; repeatDropOpen = false">
              <span class="tep-group-opt-name">{{ opt.label }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="tep-field">
        <label class="tep-label">所属分组</label>
        <div class="tep-group-picker" ref="groupPickerRef">
          <div class="tep-group-trigger" @click="groupDropOpen = !groupDropOpen">
            <span class="tep-group-text">{{ selectedGroupLabel }}</span>
            <span class="tep-group-arrow" :class="{ open: groupDropOpen }">▾</span>
          </div>
          <div v-if="groupDropOpen" class="tep-group-dropdown">
            <div
              :class="['tep-group-opt', { sel: !form.monthGoalId }]"
              @click="form.monthGoalId = null; groupDropOpen = false"
            >
              <span class="tep-group-opt-dot" style="background:var(--text-light)"></span>
              <span class="tep-group-opt-name">无分组</span>
            </div>
            <div
              v-for="g in goals" :key="g.id"
              :class="['tep-group-opt', { sel: form.monthGoalId === g.id }]"
              @click="form.monthGoalId = g.id; groupDropOpen = false"
            >
              <span class="tep-group-opt-dot" :style="{ background: tagColors[g.tag] || 'var(--text-light)' }"></span>
              <span class="tep-group-opt-name">{{ g.title }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="tep-foot">
        <button class="tep-btn tep-cancel" @click="close">取消</button>
        <button class="tep-btn tep-save" @click="doSave">保存</button>
      </div>
    </div>
    <div v-if="visible" class="tep-backdrop" @mousedown="close"></div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, nextTick } from 'vue'
import { useTaskStore } from '../stores/tasks'
import { useUndoStore } from '../stores/undo'
import { TAG_COLORS, TAG_NAMES } from '../utils/time'
import DatePicker from './DatePicker.vue'

const taskStore = useTaskStore()
const undoStore = useUndoStore()

const visible = ref(false)
const popEl = ref(null)
const titleInput = ref(null)
const popStyle = ref({})
const groupDropOpen = ref(false)
const groupPickerRef = ref(null)
const repeatDropOpen = ref(false)
const repeatPickerRef = ref(null)
const repeatOpts = [
  { value: '', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekday', label: '工作日' },
  { value: 'weekly', label: '每周' }
]
const tagNames = TAG_NAMES
const tagColors = TAG_COLORS

const form = reactive({
  title: '',
  tag: 'work',
  startDate: '',
  deadline: '',
  repeat: '',
  monthGoalId: null
})

let editWid = null

const goals = computed(() => taskStore.monthlyGoals)

const repeatLabel = computed(() => {
  const o = repeatOpts.find(x => x.value === form.repeat)
  return o ? o.label : '不重复'
})

const selectedGroupLabel = computed(() => {
  if (!form.monthGoalId) return '无分组'
  const g = taskStore.monthlyGoals.find(x => x.id === form.monthGoalId)
  return g ? g.title : '无分组'
})

function open(w, x, y) {
  editWid = w.id
  form.title = w.title || ''
  form.tag = w.tag || 'work'
  form.startDate = w.startDate || ''
  form.deadline = w.deadline || ''
  form.monthGoalId = w.monthGoalId || null
  // Load repeat from frozen task
  const frozen = taskStore.findFrozenMatch(w)
  form.repeat = (frozen && !frozen.sub ? frozen.task.repeat : '') || ''
  visible.value = true

  nextTick(() => {
    let top = y, left = x
    const pw = 300, ph = popEl.value?.offsetHeight || 400
    if (left + pw > window.innerWidth) left = window.innerWidth - pw - 8
    if (top + ph > window.innerHeight) top = window.innerHeight - ph - 8
    if (top < 4) top = 4
    if (left < 4) left = 4
    popStyle.value = { top: top + 'px', left: left + 'px' }
    titleInput.value?.focus()
  })
}

function close() { visible.value = false; groupDropOpen.value = false; repeatDropOpen.value = false; editWid = null }

function doSave() {
  const title = form.title.trim()
  if (!title) return

  const w = taskStore.weeklyTasks.find(x => x.id === editWid)
  if (!w) { close(); return }

  undoStore.pushUndo()

  // Sync to frozen task
  const m = taskStore.findFrozenMatch(w)
  if (m && !m.sub) {
    m.task.title = title
    m.task.tag = form.tag
    m.task.deadline = form.deadline || null
    m.task.repeat = form.repeat || null
    if (!form.repeat) { delete m.task.repeatEnd; delete m.task.excludes }
  } else if (m && m.sub) {
    m.sub.title = title
    m.sub.label = title
    m.sub.deadline = form.deadline || null
  }
  taskStore.saveTasks()

  // Update weekly task
  w.title = title
  w.tag = form.tag
  w.startDate = form.startDate || null
  w.deadline = form.deadline || null
  w.monthGoalId = form.monthGoalId || null

  // If group changed, update tag from group
  if (form.monthGoalId) {
    const goal = taskStore.monthlyGoals.find(g => g.id === form.monthGoalId)
    if (goal && goal.tag) w.tag = goal.tag
  }

  taskStore.saveGoals()
  close()
}

function onPopMousedown(e) {
  if (groupPickerRef.value && !groupPickerRef.value.contains(e.target)) groupDropOpen.value = false
  if (repeatPickerRef.value && !repeatPickerRef.value.contains(e.target)) repeatDropOpen.value = false
}

defineExpose({ open, close })
</script>

<style>
.task-edit-pop {
  position: fixed; z-index: 300; width: 300px;
  background: var(--bg); border-radius: 16px;
  box-shadow: 0 0 0 1px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.08), 0 16px 48px rgba(0,0,0,.12);
  padding: 20px; animation: tepIn .25s cubic-bezier(.16,1,.3,1);
}
html.dark .task-edit-pop {
  box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 4px 16px rgba(0,0,0,.3), 0 16px 48px rgba(0,0,0,.5);
}
@keyframes tepIn {
  from { opacity: 0; transform: translateY(10px) scale(.95); }
  to { opacity: 1; transform: none; }
}
.tep-header {
  font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 16px;
  padding-bottom: 12px; border-bottom: 1px solid var(--border-light);
}
.tep-field { margin-bottom: 12px; }
.tep-label {
  display: block; font-size: 11px; font-weight: 500; color: var(--text-light);
  margin-bottom: 5px; text-transform: uppercase; letter-spacing: .04em;
}
.tep-input {
  width: 100%; padding: 7px 10px; border: 1.5px solid var(--border-light);
  border-radius: 8px; font-size: 13px; font-family: var(--font);
  color: var(--text); background: var(--bg); outline: none; transition: all .15s ease;
  box-sizing: border-box;
}
.tep-input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(51,112,255,.08); }
.tep-tags { display: flex; gap: 6px; }
.tep-tag {
  padding: 4px 12px; border-radius: 14px; font-size: 11px; font-weight: 500;
  border: 1.5px solid var(--border-light); background: transparent;
  color: var(--text-light); cursor: pointer; transition: all .15s ease;
}
.tep-tag:hover { border-color: var(--border); color: var(--text-secondary); }
.tep-tag.sel { border-color: currentColor; }
.tep-group-picker { position: relative; }
.tep-group-trigger {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 10px; border: 1.5px solid var(--border-light); border-radius: 8px;
  cursor: pointer; font-size: 13px; color: var(--text); background: var(--bg);
  transition: all .15s ease; user-select: none; box-sizing: border-box;
}
.tep-group-trigger:hover { border-color: var(--border); }
.tep-group-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tep-group-arrow { font-size: 10px; color: var(--text-light); transition: transform .15s; }
.tep-group-arrow.open { transform: rotate(180deg); }
.tep-group-dropdown {
  position: absolute; top: 100%; left: 0; margin-top: 4px;
  min-width: 100%; width: max-content;
  background: var(--bg); border-radius: 12px;
  box-shadow: 0 0 0 1px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.08), 0 16px 48px rgba(0,0,0,.12);
  max-height: 180px; overflow-y: auto; z-index: 310;
  padding: 5px; animation: tepDropIn .2s cubic-bezier(.16,1,.3,1);
}
html.dark .tep-group-dropdown {
  box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 4px 16px rgba(0,0,0,.3), 0 16px 48px rgba(0,0,0,.5);
}
@keyframes tepDropIn {
  from { opacity: 0; transform: translateY(6px) scale(.96); }
  to { opacity: 1; transform: none; }
}
.tep-group-opt {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px; font-size: 13px; color: var(--text); cursor: pointer;
  border-radius: 8px; transition: all .12s ease; white-space: nowrap;
}
.tep-group-opt:hover { background: var(--bg-hover); }
.tep-group-opt:active { transform: scale(.98); }
.tep-group-opt.sel { color: var(--blue); font-weight: 500; background: var(--blue-bg); }
.tep-group-opt-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.tep-group-opt-name { flex: 1; }
.tep-foot {
  display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px;
  padding-top: 12px; border-top: 1px solid var(--border-light);
}
.tep-btn {
  padding: 6px 16px; border-radius: 8px; font-size: 12px;
  font-family: var(--font); cursor: pointer; transition: all .15s ease; border: none;
  font-weight: 500;
}
.tep-btn:active { transform: scale(.96); }
.tep-cancel { background: var(--bg-hover); color: var(--text-light); }
.tep-cancel:hover { background: var(--border-light); color: var(--text-secondary); }
.tep-save {
  background: var(--blue); color: #fff;
  box-shadow: 0 2px 6px rgba(51,112,255,.25);
}
.tep-save:hover { box-shadow: 0 3px 10px rgba(51,112,255,.3); filter: brightness(1.05); }
.tep-backdrop {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 299; background: transparent;
}
</style>