<template>
  <div class="time-picker-wrap" ref="wrapEl">
    <div :class="['time-picker-display', { active: open }]" @click.stop="toggle">
      {{ modelValue || '—' }}
    </div>
    <Teleport to="body">
      <div
        v-if="open"
        ref="dropEl"
        class="time-picker-drop open"
        :style="dropStyle"
        @click.stop
      >
        <div
          v-for="t in options" :key="t"
          :class="['time-picker-opt', { sel: t === modelValue }]"
          :ref="el => { if (t === modelValue) selRef = el }"
          @click="select(t)"
        >{{ t }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { SH, EH, SNAP } from '../utils/time'

const props = defineProps({ modelValue: String })
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const wrapEl = ref(null)
const dropEl = ref(null)
let selRef = null
const dropStyle = ref({})

const options = computed(() => {
  const o = []
  for (let h = SH; h < EH; h++)
    for (let m = 0; m < 60; m += SNAP)
      o.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  o.push(`${String(EH).padStart(2, '0')}:00`)
  return o
})

function toggle() {
  open.value = !open.value
  if (open.value) nextTick(position)
}

function position() {
  if (!wrapEl.value) return
  const r = wrapEl.value.getBoundingClientRect()
  let top = r.bottom + 4, left = r.left
  if (top + 200 > window.innerHeight) top = r.top - 204
  dropStyle.value = { top: top + 'px', left: left + 'px' }
  nextTick(() => { if (selRef) selRef.scrollIntoView({ block: 'center', behavior: 'instant' }) })
}

function select(t) {
  emit('update:modelValue', t)
  open.value = false
}

function onClickOutside(e) {
  if (wrapEl.value?.contains(e.target)) return
  if (dropEl.value?.contains(e.target)) return
  open.value = false
}

onMounted(() => document.addEventListener('mousedown', onClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside))
</script>
