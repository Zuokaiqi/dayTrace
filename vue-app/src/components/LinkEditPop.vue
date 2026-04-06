<template>
  <Teleport to="body">
    <div v-if="visible" class="lep-mask" @mousedown.self="close">
      <div class="lep-dialog" @mousedown.stop>
        <div class="lep-title">编辑链接</div>
        <div class="lep-field">
          <label class="lep-label">链接名称</label>
          <input
            ref="nameInput"
            class="lep-input"
            v-model="form.name"
            placeholder="链接名称"
            @keydown.enter="doSave"
            @keydown.escape="close"
          >
        </div>
        <div class="lep-field">
          <label class="lep-label">链接地址</label>
          <input
            class="lep-input"
            v-model="form.url"
            placeholder="https://..."
            @keydown.enter="doSave"
            @keydown.escape="close"
          >
        </div>
        <div class="lep-field">
          <label class="lep-label">分组</label>
          <div class="lep-group-picker" ref="groupPickerRef">
            <div class="lep-group-trigger" @click="groupDropOpen = !groupDropOpen">
              <span class="lep-group-text">{{ form.group }}</span>
              <span class="lep-group-arrow" :class="{ open: groupDropOpen }">▾</span>
            </div>
            <div v-if="groupDropOpen" class="lep-group-dropdown">
              <div
                v-for="g in allGroups" :key="g"
                :class="['lep-group-opt', { sel: form.group === g }]"
                @click="form.group = g; groupDropOpen = false"
              >{{ g }}</div>
            </div>
          </div>
        </div>
        <div class="lep-foot">
          <button class="lep-btn lep-cancel" @click="close">取消</button>
          <button class="lep-btn lep-save" @click="doSave">保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useLinkStore } from '../stores/links'
import { useUndoStore } from '../stores/undo'

const linkStore = useLinkStore()
const undoStore = useUndoStore()

const visible = ref(false)
const nameInput = ref(null)
const groupDropOpen = ref(false)
const groupPickerRef = ref(null)

const form = reactive({ name: '', url: '', group: '未分类' })
let editId = null
let _resolve = null

const allGroups = computed(() => {
  const set = new Set(linkStore.groups)
  linkStore.links.forEach(l => { if (l.group) set.add(l.group) })
  if (!set.size) set.add('未分类')
  return [...set]
})

function open(lk) {
  editId = lk.id
  form.name = lk.name || ''
  form.url = lk.url || ''
  form.group = lk.group || '未分类'
  groupDropOpen.value = false
  visible.value = true
  nextTick(() => nameInput.value?.focus())
  return new Promise(resolve => { _resolve = resolve })
}

function close() {
  visible.value = false
  groupDropOpen.value = false
  if (_resolve) { _resolve(false); _resolve = null }
}

function doSave() {
  const name = form.name.trim()
  const url = form.url.trim()
  if (!name || !url) return
  undoStore.pushUndo()
  linkStore.updateLink(editId, {
    name,
    url,
    group: form.group,
    domain: (() => { try { return new URL(url).hostname } catch { return url } })(),
    favicon: (() => { try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32` } catch { return '' } })()
  })
  visible.value = false
  if (_resolve) { _resolve(true); _resolve = null }
}

function onDocClick(e) {
  if (groupPickerRef.value && !groupPickerRef.value.contains(e.target)) groupDropOpen.value = false
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocClick))

defineExpose({ open })
</script>

<style>
.lep-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg-mask); z-index: 350;
  display: flex; align-items: center; justify-content: center;
}
.lep-dialog {
  background: var(--bg); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);
  padding: 24px; width: 360px; animation: lepIn .15s ease;
}
@keyframes lepIn { from { opacity: 0; transform: scale(.96); } to { opacity: 1; } }
.lep-title { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 16px; }
.lep-field { margin-bottom: 12px; }
.lep-label { display: block; font-size: 12px; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px; }
.lep-input {
  width: 100%; padding: 8px 12px; border: 1px solid var(--border-light);
  border-radius: var(--radius); font-size: 13px; font-family: var(--font);
  color: var(--text); background: var(--bg); outline: none;
  box-sizing: border-box; transition: var(--transition);
}
.lep-input:focus { border-color: var(--blue); box-shadow: 0 0 0 2px var(--blue-bg); }
.lep-group-picker { position: relative; }
.lep-group-trigger {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border: 1px solid var(--border-light); border-radius: var(--radius);
  cursor: pointer; font-size: 13px; color: var(--text); background: var(--bg);
  transition: var(--transition); user-select: none;
}
.lep-group-trigger:hover { border-color: var(--border); }
.lep-group-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lep-group-arrow { font-size: 10px; color: var(--text-light); transition: transform .15s; }
.lep-group-arrow.open { transform: rotate(180deg); }
.lep-group-dropdown {
  position: absolute; top: 100%; left: 0; margin-top: 4px;
  min-width: 100%; width: max-content;
  background: var(--bg); border: 1px solid var(--border-light); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg); max-height: 180px; overflow-y: auto; z-index: 360;
  padding: 4px; animation: lepDropIn .12s ease;
}
@keyframes lepDropIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; } }
.lep-group-opt {
  padding: 8px 12px; font-size: 13px; color: var(--text); cursor: pointer;
  border-radius: var(--radius); transition: var(--transition); white-space: nowrap;
}
.lep-group-opt:hover { background: var(--bg-hover); }
.lep-group-opt.sel { color: var(--blue); font-weight: 500; background: var(--blue-bg); }
.lep-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.lep-btn {
  padding: 7px 18px; border-radius: var(--radius); font-size: 13px;
  font-family: var(--font); cursor: pointer; transition: var(--transition); border: none;
}
.lep-cancel { background: var(--bg-hover); color: var(--text-secondary); }
.lep-cancel:hover { background: var(--border-light); }
.lep-save { background: var(--blue); color: #fff; }
.lep-save:hover { opacity: .9; }
</style>