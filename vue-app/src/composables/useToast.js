import { ref } from 'vue'

const message = ref('')
const visible = ref(false)
let timer = null

export function showToast(msg, duration = 1500) {
  message.value = msg
  visible.value = true
  clearTimeout(timer)
  timer = setTimeout(() => { visible.value = false }, duration)
}

export function useToast() {
  return { message, visible, showToast }
}
