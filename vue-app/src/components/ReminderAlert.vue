<template>
  <Teleport to="body">
    <Transition name="reminder-fade">
      <div v-if="visible" class="reminder-overlay" @click.self="dismiss">
        <div class="reminder-card">
          <div class="reminder-icon">🔔</div>
          <div class="reminder-title">{{ title }}</div>
          <div class="reminder-body">{{ body }}</div>
          <button class="reminder-dismiss" @click="dismiss">知道了</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'

const visible = ref(false)
const title = ref('')
const body = ref('')
let _audioCtx = null

function show(t, b) {
  title.value = t
  body.value = b
  visible.value = true
  playSound()
}

function dismiss() {
  visible.value = false
}

function playSound() {
  try {
    // Use Web Audio API to generate a notification chime — no audio file needed
    const ctx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    _audioCtx = ctx

    // Play a pleasant two-tone chime
    const notes = [660, 880, 660]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const startTime = ctx.currentTime + i * 0.2
      gain.gain.setValueAtTime(0.3, startTime)
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3)
      osc.start(startTime)
      osc.stop(startTime + 0.3)
    })
  } catch {
    // Audio not available, silent fallback
  }
}

defineExpose({ show })
</script>

<style>
.reminder-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center;
}
.reminder-card {
  background: var(--bg, #fff); border-radius: 16px;
  padding: 32px 36px; text-align: center;
  box-shadow: 0 20px 60px rgba(0,0,0,.3);
  max-width: 360px; width: 90vw;
  animation: reminder-bounce .4s ease;
}
.reminder-icon { font-size: 48px; margin-bottom: 12px; }
.reminder-title {
  font-size: 18px; font-weight: 700; color: var(--text, #1a1a1a);
  margin-bottom: 8px;
}
.reminder-body {
  font-size: 14px; color: var(--text-secondary, #666);
  margin-bottom: 24px; line-height: 1.5;
}
.reminder-dismiss {
  padding: 10px 40px; border: none; border-radius: 8px;
  background: var(--blue, #3370ff); color: #fff;
  font-size: 14px; font-weight: 500; cursor: pointer;
  transition: background .2s;
}
.reminder-dismiss:hover { opacity: .9; }
.reminder-dismiss:active { transform: scale(.97); }

@keyframes reminder-bounce {
  0% { transform: scale(.8); opacity: 0; }
  50% { transform: scale(1.03); }
  100% { transform: scale(1); opacity: 1; }
}
.reminder-fade-enter-active { transition: opacity .2s; }
.reminder-fade-leave-active { transition: opacity .15s; }
.reminder-fade-enter-from, .reminder-fade-leave-to { opacity: 0; }
</style>
