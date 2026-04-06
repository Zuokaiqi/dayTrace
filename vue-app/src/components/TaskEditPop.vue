<template>
  <Teleport to="body">
    <div v-if="visible" class="task-edit-pop" :style="popStyle" ref="popEl" @mousedown.stop>
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
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
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
const tagNames = TAG_NAMES
const tagColors = TAG_COLORS

const form = reactive({
  title: '',
  tag: 'work',
  startDate: '',
  deadline: '',
  monthGoalId: null
})

let editWid = null

const goals = computed(() => taskStore.monthlyGoals)

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

function close() { visible.value = false; groupDropOpen.value = false; editWid = null }

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

function onDocClick(e) {
  if (groupPickerRef.value && !groupPickerRef.value.contains(e.target)) groupDropOpen.value = false
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocClick))

defineExpose({ open, close })
</script>

<style>
.task-edit-pop {
  position: fixed; z-index: 300; width: 300px;
  background: var(--bg); border: 1px solid var(--border-light);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
  padding: 16px; animation: tepIn .15s ease;
}
@keyframes tepIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; } }
.tep-header {
  font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 14px;
}
.tep-field { margin-bottom: 12px; }
.tep-label {
  display: block; font-size: 12px; font-weight: 500; color: var(--text-secondary);
  margin-bottom: 6px;
}
.tep-input {
  width: 100%; padding: 7px 10px; border: 1px solid var(--border-light);
  border-radius: var(--radius); font-size: 13px; font-family: var(--font);
  color: var(--text); background: var(--bg); outline: none; transition: var(--transition);
  box-sizing: border-box;
}
.tep-input:focus { border-color: var(--blue); box-shadow: 0 0 0 2px var(--blue-bg); }
.tep-tags { display: flex; gap: 4px; }
.tep-tag {
  padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 500;
  border: 1px solid var(--border-light); background: transparent;
  color: var(--text-secondary); cursor: pointer; transition: var(--transition);
}
.tep-tag:hover { border-color: var(--text-light); }
.tep-group-picker { position: relative; }
.tep-group-trigger {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 10px; border: 1px solid var(--border-light); border-radius: var(--radius);
  cursor: pointer; font-size: 13px; color: var(--text); background: var(--bg);
  transition: var(--transition); user-select: none; box-sizing: border-box;
}
.tep-group-trigger:hover { border-color: var(--border); }
.tep-group-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tep-group-arrow { font-size: 10px; color: var(--text-light); transition: transform .15s; }
.tep-group-arrow.open { transform: rotate(180deg); }
.tep-group-dropdown {
  position: absolute; top: 100%; left: 0; margin-top: 4px;
  min-width: 100%; width: max-content;
  background: var(--bg); border: 1px solid var(--border-light); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg); max-height: 180px; overflow-y: auto; z-index: 310;
  padding: 4px; animation: tepDropIn .12s ease;
}
@keyframes tepDropIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; } }
.tep-group-opt {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; font-size: 13px; color: var(--text); cursor: pointer;
  border-radius: var(--radius); transition: var(--transition); white-space: nowrap;
}
.tep-group-opt:hover { background: var(--bg-hover); }
.tep-group-opt.sel { color: var(--blue); font-weight: 500; background: var(--blue-bg); }
.tep-group-opt-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.tep-group-opt-name { flex: 1; }
.tep-foot { display: flex; justify-content: flex-end; gap: 6px; margin-top: 4px; }
.tep-btn {
  padding: 6px 16px; border-radius: var(--radius); font-size: 13px;
  font-family: var(--font); cursor: pointer; transition: var(--transition); border: none;
}
.tep-cancel { background: var(--bg-hover); color: var(--text-secondary); }
.tep-cancel:hover { background: var(--border-light); }
.tep-save { background: var(--blue); color: #fff; }
.tep-save:hover { opacity: .9; }
.tep-backdrop {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 299; background: transparent;
}
</style>