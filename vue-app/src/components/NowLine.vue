<template>
  <div v-if="visible" class="now-line" :style="{ top: topPx + 'px' }"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { SH, EH, SL } from '../utils/time'

const topPx = ref(0)
const visible = ref(false)
let timer = null

function update() {
  const now = new Date()
  const nm = now.getHours() * 60 + now.getMinutes()
  if (nm >= SH * 60 && nm <= EH * 60) {
    topPx.value = ((nm - SH * 60) / 30) * SL
    visible.value = true
  } else {
    visible.value = false
  }
}

onMounted(() => {
  update()
  timer = setInterval(update, 15000)
})
onUnmounted(() => clearInterval(timer))
</script>
