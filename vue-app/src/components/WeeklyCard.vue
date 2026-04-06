<template>
  <div
    :class="['weekly-card', { done: task.done }]"
    draggable="true"
    @dragstart="onDragStart"
    @dragover.prevent="onDragOver"
    @dragleave="dragOver = false"
    @drop="onDrop"
    @dragend="onDragEnd"
    @contextmenu.prevent="$emit('contextmenu', $event)"
    @mousedown="onCardMousedown"
    :data-wid="task.id"
    :style="dragOver ? 'box-shadow:0 -2px 0 0 var(--blue)' : ''"
  >
    <div class="weekly-card-header">
      <span class="weekly-drag-handle" @mousedown.stop="onHandleMousedown" title="拖拽排序">⠿</span>
      <input
        type="checkbox"
        class="weekly-cb"
        :checked="task.done"
        @change="$emit('toggle', $event.target.checked)"
      >
      <!-- Inline rename mode -->
      <input
        v-if="renaming"
        ref="renameInput"
        class="goals-rename-input"
        v-model="renameVal"
        @blur="finishRename"
        @keydown.enter="finishRename"
        @keydown.escape="renaming = false"
        @click.stop
      >
      <span v-else class="weekly-title">{{ task.title }}</span>
      <span class="goal-tag" :style="{ background: tagColor }">{{ tagName }}</span>
      <button class="weekly-del" @click.stop="$emit('delete')">✕</button>
    </div>
    <div class="weekly-meta">
      <span v-if="task.startDate" class="weekly-date">🟢 {{ task.startDate.slice(5) }}</span>
      <span v-if="task.deadline" class="weekly-date">{{ task.deadline.slice(5) }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { TAG_COLORS, TAG_NAMES } from '../utils/time'
import { startTaskDrag, moveTaskDrag, endTaskDrag, taskDrag } from '../composables/useTaskDrag'

const props = defineProps({ task: Object })
const emit = defineEmits(['toggle', 'delete', 'rename', 'drop', 'contextmenu'])

const tagColor = computed(() => TAG_COLORS[props.task.tag] || 'var(--text-light)')
const tagName = computed(() => TAG_NAMES[props.task.tag] || props.task.tag)

// Rename (triggered externally via ref)
const renaming = ref(false)
const renameVal = ref('')
const renameInput = ref(null)

function startRename() {
  renameVal.value = props.task.title
  renaming.value = true
  nextTick(() => { renameInput.value?.focus(); renameInput.value?.select() })
}

function finishRename() {
  if (!renaming.value) return
  renaming.value = false
  const v = renameVal.value.trim()
  if (v && v !== props.task.title) emit('rename', v)
}

// Drag reorder (HTML5 DnD, handle only)
const dragOver = ref(false)
let fromHandle = false

function onHandleMousedown() { fromHandle = true }

function onDragStart(e) {
  if (!fromHandle) { e.preventDefault(); return }
  e.stopPropagation()
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(props.task.id))
}
function onDragOver() { dragOver.value = true }
function onDrop(e) {
  dragOver.value = false
  const fromId = parseInt(e.dataTransfer.getData('text/plain'))
  if (fromId !== props.task.id) emit('drop', fromId, props.task.id)
}
function onDragEnd() { dragOver.value = false; fromHandle = false }

// Calendar drag (mousedown-based, non-handle area)
let mDown = false, mStartX = 0, mStartY = 0, mDragging = false

function onCardMousedown(e) {
  if (e.button !== 0) return
  if (e.target.closest('.weekly-drag-handle,.weekly-cb,.weekly-del,.goals-rename-input,button,input,select')) return
  mDown = true; mStartX = e.clientX; mStartY = e.clientY; mDragging = false
}

function onDocMousemove(e) {
  if (!mDown) return
  if (!mDragging) {
    if (Math.abs(e.clientX - mStartX) < 6 && Math.abs(e.clientY - mStartY) < 6) return
    mDragging = true
    startTaskDrag(props.task.title, props.task.tag, e)
  }
  moveTaskDrag(e)
}

function onDocMouseup() {
  if (!mDown) return
  mDown = false
  if (!mDragging) return
  mDragging = false
  // Don't call endTaskDrag here — let the calendar view handle the drop.
  // If mouseup happens outside any calendar (e.g. back on the panel), 
  // we still need cleanup, but with a small delay so calendar mouseup fires first.
  setTimeout(() => {
    if (taskDrag.active) endTaskDrag()
  }, 10)
}

import { onMounted, onUnmounted } from 'vue'
onMounted(() => {
  document.addEventListener('mousemove', onDocMousemove)
  document.addEventListener('mouseup', onDocMouseup)
})
onUnmounted(() => {
  document.removeEventListener('mousemove', onDocMousemove)
  document.removeEventListener('mouseup', onDocMouseup)
})

defineExpose({ startRename })
</script>
