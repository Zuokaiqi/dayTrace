<template>
  <Teleport to="body">
    <div v-if="open" class="links-overlay" @click="open = false"></div>
    <div v-if="open" class="links-panel">
      <div class="links-header">
        <span class="links-title">🔗 常用链接</span>
        <input class="links-search" v-model="search" placeholder="搜索链接...">
        <div class="links-view-toggle">
          <button :class="{ sel: viewMode === 'grid' }" @click="viewMode = 'grid'" title="网格">▦</button>
          <button :class="{ sel: viewMode === 'list' }" @click="viewMode = 'list'" title="列表">☰</button>
        </div>
        <button class="links-close" @click="open = false">✕</button>
      </div>

      <!-- Groups -->
      <div class="links-body">
        <div v-for="group in filteredGroups" :key="group" class="links-group">
          <div class="links-group-header" @click="toggleGroup(group)">
            <span class="links-group-arrow">{{ collapsed[group] ? '▶' : '▼' }}</span>
            <span class="links-group-name">{{ group }}</span>
            <span class="links-group-count">{{ groupLinks(group).length }}</span>
          </div>
          <div v-if="!collapsed[group]" :class="['links-grid', viewMode]">
            <div
              v-for="lk in groupLinks(group)" :key="lk.id"
              :class="['link-card', { starred: lk.starred }]"
              @click="openLink(lk)"
              @contextmenu.prevent="showCtx(lk, $event)"
              draggable="true"
              @dragstart="onDragStart(lk, $event)"
              @dragover.prevent="dragOverId = lk.id"
              @dragleave="dragOverId = null"
              @drop="onDrop(lk, $event)"
              :style="dragOverId === lk.id ? 'box-shadow:0 -2px 0 0 var(--blue)' : ''"
            >
              <img class="link-favicon" :src="lk.favicon || defaultFavicon" @error="e => e.target.src = defaultFavicon">
              <div class="link-info">
                <div class="link-name">{{ lk.name }}</div>
                <div class="link-domain">{{ lk.domain }}</div>
              </div>
              <span v-if="lk.starred" class="link-star">⭐</span>
            </div>
          </div>
        </div>
        <div v-if="!filteredGroups.length" class="links-empty">暂无链接</div>
      </div>

      <!-- Add form -->
      <div class="links-add-wrap">
        <div class="links-add-row1">
          <div class="links-add-url-wrap">
            <span class="links-add-icon">🔗</span>
            <input class="links-add-url" v-model="newUrl" placeholder="粘贴或输入链接地址" @keydown.enter="doAdd" @paste="onPaste">
          </div>
        </div>
        <div class="links-add-row2">
          <input class="links-add-name-input" v-model="newName" placeholder="链接名称（可选）">
          <!-- Custom group dropdown -->
          <div class="lk-group-picker" ref="groupPickerRef">
            <div class="lk-group-trigger" @click="groupDropOpen = !groupDropOpen">
              <span class="lk-group-text">{{ newGroup === '__new__' ? '+ 新分组' : newGroup }}</span>
              <span class="lk-group-arrow" :class="{ open: groupDropOpen }">▾</span>
            </div>
            <div v-if="groupDropOpen" class="lk-group-dropdown">
              <div
                v-for="(g, gi) in allGroups" :key="g"
                :class="['lk-group-opt', { sel: newGroup === g }]"
                @click="selectGroup(g)"
                @contextmenu.prevent="showGroupCtx(g, $event)"
                draggable="true"
                @dragstart="onGroupDragStart(gi, $event)"
                @dragover.prevent="groupDragIdx = gi"
                @dragleave="groupDragIdx = -1"
                @drop="onGroupDrop(gi)"
                :style="groupDragIdx === gi ? 'box-shadow:0 -2px 0 0 var(--blue)' : ''"
              >
                <span class="lk-group-opt-name">{{ g }}</span>
                <span class="lk-group-opt-count">{{ linkStore.links.filter(l => l.group === g).length }}</span>
              </div>
              <div class="lk-group-opt lk-group-new" @click="createNewGroup">
                <span>+ 新分组</span>
              </div>
            </div>
          </div>
          <button class="links-add-submit" @click="doAdd">添加</button>
        </div>
      </div>
    </div>
  </Teleport>
  <ContextMenu ref="ctxMenu" />
  <PromptDialog ref="promptDlg" />
  <LinkEditPop ref="linkEditPop" />
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useLinkStore } from '../stores/links'
import { useUndoStore } from '../stores/undo'
import { showToast } from '../composables/useToast'
import ContextMenu from './ContextMenu.vue'
import PromptDialog from './PromptDialog.vue'
import LinkEditPop from './LinkEditPop.vue'

const linkStore = useLinkStore()
const undoStore = useUndoStore()
const open = ref(false)
const search = ref('')
const viewMode = ref('grid')
const collapsed = reactive({})
const ctxMenu = ref(null)
const promptDlg = ref(null)
const linkEditPop = ref(null)
const dragOverId = ref(null)

const newUrl = ref('')
const newName = ref('')
const newGroup = ref('未分类')
const groupDropOpen = ref(false)
const groupPickerRef = ref(null)
const groupDragIdx = ref(-1)
let _groupDragFrom = -1

const defaultFavicon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text y="13" font-size="14">🔗</text></svg>'

const allGroups = computed(() => {
  // Use store's independent group list
  const storeGroups = linkStore.groups
  // Also include any groups from links that aren't in the list yet
  const set = new Set(storeGroups)
  linkStore.links.forEach(l => { if (l.group && !set.has(l.group)) set.add(l.group) })
  if (!set.size) set.add('未分类')
  return [...set]
})

const filteredGroups = computed(() => {
  const q = search.value.toLowerCase().trim()
  if (!q) return allGroups.value  // show all groups including empty
  return allGroups.value.filter(g => {
    const items = groupLinks(g)
    return items.length > 0
  })
})

function groupLinks(group) {
  const q = search.value.toLowerCase().trim()
  let items = linkStore.links.filter(l => l.group === group)
  if (q) items = items.filter(l => l.name.toLowerCase().includes(q) || l.url.toLowerCase().includes(q) || l.domain?.toLowerCase().includes(q))
  // Starred first
  return items.sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0))
}

function toggleGroup(g) { collapsed[g] = !collapsed[g] }

function openLink(lk) {
  linkStore.recordClick(lk.id)
  window.open(lk.url, '_blank')
}

function selectGroup(g) { newGroup.value = g; groupDropOpen.value = false }

function createNewGroup() {
  promptDlg.value?.open({ title: '新分组名称', placeholder: '输入分组名称' }).then(name => {
    if (name?.trim()) {
      linkStore.addGroup(name.trim())
      newGroup.value = name.trim()
      groupDropOpen.value = false
    }
  })
}

function showGroupCtx(g, e) {
  ctxMenu.value?.show(e.clientX, e.clientY, [
    { act: 'rename', icon: '✏️', label: '重命名', fn() {
      promptDlg.value?.open({ title: '重命名分组', placeholder: '输入新名称', defaultValue: g }).then(val => {
        if (val?.trim() && val.trim() !== g) {
          undoStore.pushUndo()
          linkStore.renameGroup(g, val.trim())
          if (newGroup.value === g) newGroup.value = val.trim()
          showToast('已重命名')
        }
      })
    }},
    { act: 'delete', icon: '🗑', label: '删除分组（链接移到未分类）', cls: 'ctx-danger', fn() {
      undoStore.pushUndo()
      linkStore.links.forEach(l => { if (l.group === g) l.group = '未分类' })
      linkStore.removeGroup(g)
      if (!linkStore.groups.includes('未分类')) linkStore.addGroup('未分类')
      linkStore.save()
      if (newGroup.value === g) newGroup.value = '未分类'
      showToast('已删除分组')
    }}
  ])
}

function onGroupDragStart(idx, e) {
  _groupDragFrom = idx
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', 'group')
}

function onGroupDrop(toIdx) {
  groupDragIdx.value = -1
  if (_groupDragFrom < 0 || _groupDragFrom === toIdx) return
  undoStore.pushUndo()
  const arr = [...allGroups.value]
  const item = arr.splice(_groupDragFrom, 1)[0]
  arr.splice(toIdx, 0, item)
  linkStore.reorderGroups(arr)
  _groupDragFrom = -1
}

// Close dropdown on outside click
import { onUnmounted } from 'vue'
function onDocClick(e) { if (groupPickerRef.value && !groupPickerRef.value.contains(e.target)) groupDropOpen.value = false }
onMounted(() => document.addEventListener('mousedown', onDocClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocClick))

function doAdd() {
  let url = newUrl.value.trim()
  if (!url) return
  if (!url.startsWith('http')) url = 'https://' + url
  const group = newGroup.value || '未分类'
  undoStore.pushUndo()
  linkStore.addLink(newName.value.trim() || '', url, group)
  newUrl.value = ''; newName.value = ''
  showToast('已添加链接')
}

function onPaste(e) {
  // Auto-fill name from URL if empty
  setTimeout(() => {
    if (!newName.value && newUrl.value) {
      try { newName.value = new URL(newUrl.value.startsWith('http') ? newUrl.value : 'https://' + newUrl.value).hostname } catch {}
    }
  }, 50)
}

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => showToast('已复制')).catch(() => fallbackCopy(text))
  } else {
    fallbackCopy(text)
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy'); showToast('已复制') } catch { showToast('复制失败') }
  document.body.removeChild(ta)
}

function showCtx(lk, e) {
  ctxMenu.value?.show(e.clientX, e.clientY, [
    { act: 'copy', icon: '📋', label: '复制链接', fn() { copyToClipboard(lk.url) } },
    { act: 'open', icon: '🔗', label: '新标签打开', fn() { openLink(lk) } },
    { act: 'star', icon: lk.starred ? '⭐' : '☆', label: lk.starred ? '取消收藏' : '收藏', fn() { undoStore.pushUndo(); linkStore.toggleStar(lk.id) } },
    { act: 'edit', icon: '✏️', label: '编辑', fn() { editLink(lk) } },
    { act: 'delete', icon: '🗑', label: '删除', cls: 'ctx-danger', fn() { undoStore.pushUndo(); linkStore.removeLink(lk.id); showToast('已删除') } }
  ])
}

function editLink(lk) {
  linkEditPop.value?.open(lk).then(saved => {
    if (saved) showToast('已保存')
  })
}

// Drag reorder
let _dragId = null
function onDragStart(lk, e) {
  _dragId = lk.id
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(lk.id))
}
function onDrop(toLk, e) {
  dragOverId.value = null
  if (!_dragId || _dragId === toLk.id) return
  const fromIdx = linkStore.links.findIndex(l => l.id === _dragId)
  const toIdx = linkStore.links.findIndex(l => l.id === toLk.id)
  if (fromIdx < 0 || toIdx < 0) return
  undoStore.pushUndo()
  const item = linkStore.links.splice(fromIdx, 1)[0]
  // If dropping to different group, change group
  if (item.group !== toLk.group) item.group = toLk.group
  linkStore.links.splice(toIdx, 0, item)
  linkStore.save()
  _dragId = null
}

function show() { open.value = true }

onMounted(() => { linkStore.syncFromServer() })

defineExpose({ show })
</script>

<style>
.links-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-mask); z-index: 149; }
.links-panel {
  position: fixed; top: var(--topbar-h); right: 0; bottom: 0; width: 420px; max-width: 90vw;
  background: var(--bg); border-left: 1px solid var(--border-light);
  box-shadow: var(--shadow-lg); z-index: 150; display: flex; flex-direction: column;
  animation: linkSlideIn .2s ease;
}
@keyframes linkSlideIn { from { transform: translateX(100%); } to { transform: none; } }

.links-header {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px; border-bottom: 1px solid var(--border-light); flex-shrink: 0;
}
.links-title { font-size: 15px; font-weight: 600; color: var(--text); white-space: nowrap; }
.links-search {
  flex: 1; padding: 6px 10px; border: 1px solid var(--border-light); border-radius: var(--radius);
  font-size: 13px; color: var(--text); background: var(--bg); outline: none; min-width: 0;
}
.links-search:focus { border-color: var(--blue); }
.links-view-toggle { display: flex; gap: 2px; }
.links-view-toggle button {
  border: none; background: transparent; cursor: pointer; font-size: 14px;
  color: var(--text-light); padding: 4px 6px; border-radius: var(--radius); transition: var(--transition);
}
.links-view-toggle button.sel { background: var(--bg-hover); color: var(--text); }
.links-close {
  background: transparent; border: none; cursor: pointer; font-size: 14px;
  color: var(--text-light); padding: 4px; border-radius: var(--radius);
}

.links-body { flex: 1; overflow-y: auto; padding: 8px 14px; }
.links-empty { text-align: center; padding: 40px 0; color: var(--text-light); font-size: 13px; }

.links-group { margin-bottom: 8px; }
.links-group-header {
  display: flex; align-items: center; gap: 6px; padding: 6px 4px;
  cursor: pointer; font-size: 12px; color: var(--text-secondary); font-weight: 600;
  user-select: none;
}
.links-group-header:hover { color: var(--text); }
.links-group-arrow { font-size: 9px; width: 12px; color: var(--text-light); }
.links-group-count {
  font-size: 10px; color: var(--text-light); background: var(--bg-hover);
  padding: 1px 6px; border-radius: 8px; margin-left: auto;
}

/* Grid view */
.links-grid.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
.links-grid.list { display: flex; flex-direction: column; gap: 4px; }

.link-card {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border: 1px solid var(--border-light); border-radius: var(--radius-lg);
  cursor: pointer; transition: var(--transition); background: var(--bg);
}
.link-card:hover { box-shadow: var(--shadow-sm); border-color: var(--border); }
.link-favicon { width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0; }
.link-info { flex: 1; min-width: 0; }
.link-name { font-size: 13px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.link-domain { font-size: 11px; color: var(--text-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.link-star { font-size: 10px; flex-shrink: 0; }

/* Add form */
.links-add-wrap {
  padding: 14px 18px; border-top: 1px solid var(--border-light); flex-shrink: 0;
  display: flex; flex-direction: column; gap: 10px;
}
.links-add-row1 { display: flex; }
.links-add-url-wrap {
  flex: 1; display: flex; align-items: center; gap: 8px;
  border: 1px solid var(--border-light); border-radius: var(--radius-lg);
  padding: 0 12px; transition: var(--transition); background: var(--bg);
}
.links-add-url-wrap:focus-within { border-color: var(--blue); box-shadow: 0 0 0 2px var(--blue-bg); }
.links-add-icon { font-size: 14px; flex-shrink: 0; opacity: .5; }
.links-add-url {
  flex: 1; border: none; outline: none; padding: 10px 0;
  font-size: 13px; color: var(--text); background: transparent; min-width: 0;
}
.links-add-url::placeholder { color: var(--text-light); }
.links-add-row2 { display: flex; gap: 8px; align-items: center; }
.links-add-name-input {
  flex: 1; padding: 8px 12px; border: 1px solid var(--border-light); border-radius: var(--radius);
  font-size: 13px; color: var(--text); background: var(--bg); outline: none; min-width: 0;
  transition: var(--transition);
}
.links-add-name-input:focus { border-color: var(--blue); }
.links-add-name-input::placeholder { color: var(--text-light); }
.links-add-group-sel {
  display: none; /* replaced by custom dropdown */
}
/* Custom group picker */
.lk-group-picker { position: relative; flex-shrink: 0; }
.lk-group-trigger {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border: 1px solid var(--border-light); border-radius: var(--radius);
  cursor: pointer; font-size: 13px; color: var(--text); background: var(--bg);
  transition: var(--transition); min-width: 120px; user-select: none;
}
.lk-group-trigger:hover { border-color: var(--border); }
.lk-group-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lk-group-arrow { font-size: 10px; color: var(--text-light); transition: transform .15s; }
.lk-group-arrow.open { transform: rotate(180deg); }
.lk-group-dropdown {
  position: absolute; bottom: 100%; left: 0; margin-bottom: 4px;
  min-width: 160px; width: max-content;
  background: var(--bg); border: 1px solid var(--border-light); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg); max-height: 220px; overflow-y: auto; z-index: 200;
  padding: 4px; animation: lkDropIn .12s ease;
}
@keyframes lkDropIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; } }
.lk-group-opt {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; font-size: 13px; color: var(--text); cursor: pointer;
  border-radius: var(--radius); transition: var(--transition); white-space: nowrap;
}
.lk-group-opt:hover { background: var(--bg-hover); }
.lk-group-opt.sel { color: var(--blue); font-weight: 500; background: var(--blue-bg); }
.lk-group-opt-name { flex: 1; }
.lk-group-opt-count { font-size: 10px; color: var(--text-light); }
.lk-group-new { color: var(--blue); font-weight: 500; border-top: 1px solid var(--border-light); margin-top: 2px; padding-top: 10px; }
.links-add-submit {
  padding: 8px 18px; border: none; border-radius: var(--radius);
  background: var(--blue); color: #fff; font-size: 13px; font-weight: 500;
  cursor: pointer; flex-shrink: 0; transition: var(--transition);
}
.links-add-submit:hover { opacity: .9; }
</style>
