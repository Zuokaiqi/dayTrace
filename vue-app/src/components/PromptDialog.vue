<template>
  <Teleport to="body">
    <div v-if="visible" class="prompt-dlg-mask" @mousedown.self="onCancel">
      <div class="prompt-dlg" @mousedown.stop>
        <div class="prompt-dlg-title">{{ title }}</div>
        <input
          ref="inputEl"
          class="prompt-dlg-input"
          v-model="inputVal"
          :placeholder="placeholder"
          @keydown.enter="onConfirm"
          @keydown.escape="onCancel"
        >
        <div class="prompt-dlg-foot">
          <button class="prompt-dlg-btn prompt-dlg-cancel" @click="onCancel">取消</button>
          <button class="prompt-dlg-btn prompt-dlg-ok" @click="onConfirm">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, nextTick } from 'vue'

const visible = ref(false)
const title = ref('')
const placeholder = ref('')
const inputVal = ref('')
const inputEl = ref(null)
let _resolve = null

function open(opts = {}) {
  title.value = opts.title || '请输入'
  placeholder.value = opts.placeholder || ''
  inputVal.value = opts.defaultValue || ''
  visible.value = true
  nextTick(() => { inputEl.value?.focus(); inputEl.value?.select() })
  return new Promise(resolve => { _resolve = resolve })
}

function onConfirm() {
  visible.value = false
  if (_resolve) { _resolve(inputVal.value); _resolve = null }
}

function onCancel() {
  visible.value = false
  if (_resolve) { _resolve(null); _resolve = null }
}

defineExpose({ open })
</script>

<style>
.prompt-dlg-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg-mask); z-index: 350;
  display: flex; align-items: center; justify-content: center;
}
.prompt-dlg {
  background: var(--bg); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);
  padding: 24px; width: 320px; animation: promptIn .15s ease;
}
@keyframes promptIn { from { opacity: 0; transform: scale(.96); } to { opacity: 1; } }
.prompt-dlg-title {
  font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 14px;
}
.prompt-dlg-input {
  width: 100%; padding: 8px 12px; border: 1px solid var(--border-light);
  border-radius: var(--radius); font-size: 13px; font-family: var(--font);
  color: var(--text); background: var(--bg); outline: none;
  box-sizing: border-box; transition: var(--transition);
}
.prompt-dlg-input:focus { border-color: var(--blue); box-shadow: 0 0 0 2px var(--blue-bg); }
.prompt-dlg-foot {
  display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;
}
.prompt-dlg-btn {
  padding: 7px 18px; border-radius: var(--radius); font-size: 13px;
  font-family: var(--font); cursor: pointer; transition: var(--transition); border: none;
}
.prompt-dlg-cancel { background: var(--bg-hover); color: var(--text-secondary); }
.prompt-dlg-cancel:hover { background: var(--border-light); }
.prompt-dlg-ok { background: var(--blue); color: #fff; }
.prompt-dlg-ok:hover { opacity: .9; }
</style>