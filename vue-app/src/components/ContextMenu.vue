<template>
  <Teleport to="body">
    <!-- Invisible overlay to block interactions with elements below -->
    <div v-if="visible" class="ctx-overlay" @mousedown="hide" @contextmenu.prevent="hide"></div>
    <div v-if="visible" class="ctx-menu open" :style="menuStyle" ref="menuEl" @mousedown.stop @contextmenu.stop.prevent>
      <div
        v-for="item in items" :key="item.act"
        :class="['ctx-menu-item', item.cls, { 'has-sub': item.children, 'sub-open': item.children && subParent === item.act }]"
        @click="onItemClick(item)"
        @mouseenter="onHover(item, $event)"
      >
        <span class="ctx-icon">{{ item.icon }}</span>
        <span class="ctx-label">{{ item.label }}</span>
        <span v-if="item.children" class="ctx-arrow">›</span>
      </div>
    </div>
    <!-- Sub menu -->
    <div v-if="subVisible" class="ctx-menu ctx-sub open" :style="subStyle" ref="subEl"
         @mousedown.stop @contextmenu.stop.prevent>
      <div
        v-for="si in subItems" :key="si.act"
        :class="['ctx-menu-item', si.cls]"
        @click="onSubClick(si)"
      >
        <span class="ctx-icon">{{ si.icon }}</span>{{ si.label }}
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue'

const visible = ref(false)
const items = ref([])
const menuStyle = ref({})
const menuEl = ref(null)

const subVisible = ref(false)
const subItems = ref([])
const subStyle = ref({})
const subEl = ref(null)
const subParent = ref(null)
let _resolve = null

function show(x, y, menuItems) {
  subVisible.value = false
  subParent.value = null
  items.value = menuItems
  visible.value = true
  menuStyle.value = { left: x + 'px', top: y + 'px' }
  nextTick(() => {
    if (!menuEl.value) return
    const r = menuEl.value.getBoundingClientRect()
    if (r.right > window.innerWidth) menuStyle.value.left = (window.innerWidth - r.width - 8) + 'px'
    if (r.bottom > window.innerHeight) menuStyle.value.top = (window.innerHeight - r.height - 8) + 'px'
  })
  return new Promise(resolve => { _resolve = resolve })
}

function hide() {
  visible.value = false
  subVisible.value = false
  subParent.value = null
  if (_resolve) { _resolve(null); _resolve = null }
}

function onItemClick(item) {
  if (item.children) return
  visible.value = false
  subVisible.value = false
  if (item.fn) item.fn()
  if (_resolve) { _resolve(item.act); _resolve = null }
}

function onHover(item, e) {
  if (!item.children) {
    subVisible.value = false
    subParent.value = null
    return
  }
  subParent.value = item.act
  subItems.value = item.children
  const rect = e.currentTarget.getBoundingClientRect()
  let left = rect.right + 4
  let top = rect.top
  subStyle.value = { left: left + 'px', top: top + 'px' }
  subVisible.value = true
  nextTick(() => {
    if (!subEl.value) return
    const sr = subEl.value.getBoundingClientRect()
    if (sr.right > window.innerWidth) {
      subStyle.value.left = (rect.left - sr.width - 4) + 'px'
    }
    if (sr.bottom > window.innerHeight) {
      subStyle.value.top = (window.innerHeight - sr.height - 8) + 'px'
    }
  })
}

function onSubClick(si) {
  visible.value = false
  subVisible.value = false
  if (si.fn) si.fn()
  if (_resolve) { _resolve(si.act); _resolve = null }
}

function onEsc(e) {
  if (e.key === 'Escape' && visible.value) hide()
}

onMounted(() => document.addEventListener('keydown', onEsc))
onUnmounted(() => document.removeEventListener('keydown', onEsc))

defineExpose({ show, hide })
</script>

<style>
.ctx-overlay {
  position: fixed; inset: 0; z-index: 299;
  background: transparent;
}
.ctx-menu {
  position: fixed; z-index: 300; min-width: 140px;
  background: var(--bg); border: 1px solid var(--border-light);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
  padding: 4px; animation: ctxIn .12s ease;
}
.ctx-sub { z-index: 301; }
@keyframes ctxIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; } }
.ctx-menu-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; font-size: 13px; color: var(--text);
  cursor: pointer; border-radius: var(--radius); transition: var(--transition); white-space: nowrap;
}
.ctx-menu-item:hover, .ctx-menu-item.sub-open { background: var(--bg-hover); }
.ctx-menu-item.ctx-danger:hover { background: var(--red-bg); color: var(--red); }
.ctx-icon { font-size: 14px; flex-shrink: 0; }
.ctx-label { flex: 1; }
.ctx-arrow { font-size: 14px; color: var(--text-light); margin-left: 8px; }
</style>
