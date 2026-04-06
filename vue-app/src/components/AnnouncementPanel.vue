<template>
  <Teleport to="body">
    <Transition name="ann-fade">
      <div v-if="open" class="ann-overlay" @click="open = false"></div>
    </Transition>
    <Transition name="ann-slide">
      <div v-if="open" class="ann-panel">
        <div class="ann-header">
          <div class="ann-header-left">
            <span class="ann-header-icon">📢</span>
            <span class="ann-header-title">公告</span>
            <span v-if="list.length" class="ann-count">{{ list.length }}</span>
          </div>
          <button class="ann-close" @click="open = false">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="ann-body">
          <!-- Admin compose -->
          <div v-if="auth.isAdmin" class="ann-compose">
            <div class="ann-compose-inner">
              <textarea v-model="newContent" class="ann-input" rows="3"
                placeholder="输入公告内容..." @keydown.ctrl.enter="postAnnouncement"></textarea>
              <div class="ann-compose-footer">
                <span class="ann-compose-hint">Ctrl+Enter 发布</span>
                <button class="ann-post-btn" :disabled="!newContent.trim() || posting" @click="postAnnouncement">
                  <template v-if="posting">
                    <span class="ann-spinner"></span> 发布中
                  </template>
                  <template v-else>发布</template>
                </button>
              </div>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="loading" class="ann-empty">
            <span class="ann-spinner lg"></span>
            <div>加载中...</div>
          </div>

          <!-- Empty -->
          <div v-else-if="!list.length" class="ann-empty">
            <div class="ann-empty-icon">📭</div>
            <div>暂无公告</div>
          </div>

          <!-- List -->
          <div v-else class="ann-list">
            <div v-for="(a, i) in list" :key="a.id" class="ann-item" :class="{ 'ann-latest': i === 0 }">
              <div class="ann-item-dot"></div>
              <div class="ann-item-body">
                <div class="ann-content">{{ a.content }}</div>
                <div class="ann-meta">
                  <span class="ann-time">{{ formatTime(a.created_at) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { authFetch } from '../utils/api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const open = ref(false)
const list = ref([])
const loading = ref(false)
const hasNew = ref(false)
const newContent = ref('')
const posting = ref(false)

async function fetchList() {
  loading.value = true
  try {
    const resp = await authFetch('/api/announcements')
    const data = await resp.json()
    list.value = data.announcements || []
    if (list.value.length) {
      hasNew.value = list.value[0].id > parseInt(localStorage.getItem('dt_ann_read') || '0')
    }
  } catch {}
  finally { loading.value = false }
}

function show() {
  open.value = true
  newContent.value = ''
  fetchList().then(() => {
    if (list.value.length) localStorage.setItem('dt_ann_read', String(list.value[0].id))
    hasNew.value = false
  })
}

async function postAnnouncement() {
  if (!newContent.value.trim() || posting.value) return
  posting.value = true
  try {
    const resp = await authFetch('/api/announcements', {
      method: 'POST',
      body: JSON.stringify({ content: newContent.value.trim() })
    })
    if (resp.ok) { newContent.value = ''; await fetchList() }
  } catch {}
  finally { posting.value = false }
}

async function checkNew() {
  try {
    const resp = await authFetch('/api/announcements?limit=1')
    const data = await resp.json()
    const items = data.announcements || []
    if (items.length) hasNew.value = items[0].id > parseInt(localStorage.getItem('dt_ann_read') || '0')
  } catch {}
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const diff = Date.now() - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
  if (diff < 2592000000) return Math.floor(diff / 86400000) + ' 天前'
  return d.toLocaleDateString('zh-CN')
}

defineExpose({ show, checkNew, hasNew })
</script>

<style>
/* ═══ Overlay ═══ */
.ann-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.18); z-index: 199;
  backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
}
html.dark .ann-overlay { background: rgba(0,0,0,.4); }

/* ═══ Panel ═══ */
.ann-panel {
  position: fixed; top: 56px; right: 16px;
  width: 380px; max-width: calc(100vw - 32px); max-height: 70vh;
  background: var(--bg); border-radius: var(--radius-xl);
  box-shadow: 0 12px 40px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.06);
  z-index: 200; display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid var(--border-light);
}
html.dark .ann-panel {
  box-shadow: 0 12px 40px rgba(0,0,0,.4), 0 2px 8px rgba(0,0,0,.2);
}

/* ═══ Transitions ═══ */
.ann-fade-enter-active, .ann-fade-leave-active { transition: opacity .2s ease; }
.ann-fade-enter-from, .ann-fade-leave-to { opacity: 0; }

.ann-slide-enter-active { transition: all .25s cubic-bezier(.4,0,.2,1); }
.ann-slide-leave-active { transition: all .15s ease-in; }
.ann-slide-enter-from { opacity: 0; transform: translateY(-12px) scale(.96); }
.ann-slide-leave-to { opacity: 0; transform: translateY(-8px) scale(.98); }

/* ═══ Header ═══ */
.ann-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--border-light); flex-shrink: 0;
}
.ann-header-left { display: flex; align-items: center; gap: 8px; }
.ann-header-icon { font-size: 16px; }
.ann-header-title { font-size: 15px; font-weight: 600; color: var(--text); }
.ann-count {
  font-size: 11px; font-weight: 600; color: var(--blue);
  background: var(--blue-bg); padding: 1px 7px; border-radius: 10px;
  font-variant-numeric: tabular-nums;
}
.ann-close {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; cursor: pointer;
  color: var(--text-light); border-radius: var(--radius); transition: var(--transition);
}
.ann-close:hover { background: var(--bg-hover); color: var(--text-secondary); }

/* ═══ Body ═══ */
.ann-body { flex: 1; overflow-y: auto; padding: 16px 20px; }

/* ═══ Compose (Admin) ═══ */
.ann-compose { margin-bottom: 16px; }
.ann-compose-inner {
  border: 1px solid var(--border-light); border-radius: var(--radius-lg);
  overflow: hidden; transition: var(--transition);
  background: var(--bg);
}
.ann-compose-inner:focus-within {
  border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-bg);
}
.ann-input {
  width: 100%; border: none; padding: 12px 14px 8px; font-size: 13px;
  font-family: var(--font); color: var(--text); background: transparent;
  outline: none; resize: none; min-height: 60px; line-height: 1.6;
  box-sizing: border-box;
}
.ann-input::placeholder { color: var(--text-light); }
.ann-compose-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px 8px; border-top: 1px solid var(--border-light);
  background: var(--bg-hover);
}
.ann-compose-hint { font-size: 11px; color: var(--text-light); }
.ann-post-btn {
  padding: 5px 16px; border: none; border-radius: var(--radius);
  background: var(--blue); color: #fff; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: var(--transition); font-family: var(--font);
  display: flex; align-items: center; gap: 4px;
}
.ann-post-btn:hover { opacity: .9; }
.ann-post-btn:disabled { opacity: .4; cursor: not-allowed; }

/* ═══ Spinner ═══ */
.ann-spinner {
  display: inline-block; width: 12px; height: 12px;
  border: 2px solid rgba(255,255,255,.3); border-top-color: #fff;
  border-radius: 50%; animation: annSpin .6s linear infinite;
}
.ann-spinner.lg {
  width: 20px; height: 20px; margin-bottom: 8px;
  border-color: var(--border-light); border-top-color: var(--blue);
}
@keyframes annSpin { to { transform: rotate(360deg); } }

/* ═══ Empty ═══ */
.ann-empty {
  text-align: center; color: var(--text-light); font-size: 13px;
  padding: 40px 0; display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.ann-empty-icon { font-size: 32px; margin-bottom: 4px; }

/* ═══ List ═══ */
.ann-list { display: flex; flex-direction: column; gap: 2px; }

.ann-item {
  display: flex; gap: 12px; padding: 14px 0;
  border-bottom: 1px solid var(--border-light);
  position: relative;
}
.ann-item:last-child { border-bottom: none; }

.ann-item-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  margin-top: 5px; background: var(--border);
  transition: var(--transition);
}
.ann-latest .ann-item-dot { background: var(--blue); box-shadow: 0 0 0 3px var(--blue-bg); }

.ann-item-body { flex: 1; min-width: 0; }

.ann-content {
  font-size: 13px; color: var(--text); line-height: 1.7;
  white-space: pre-wrap; word-break: break-word;
}

.ann-meta { display: flex; align-items: center; gap: 8px; margin-top: 6px; }

.ann-time { font-size: 11px; color: var(--text-light); }

/* ═══ Mobile ═══ */
@media (max-width: 768px) {
  .ann-panel {
    top: auto; bottom: 0; right: 0; left: 0;
    width: 100%; max-width: 100%; max-height: 80vh;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    border: none; border-top: 1px solid var(--border-light);
  }
  .ann-slide-enter-from { opacity: .8; transform: translateY(100%) scale(1); }
  .ann-slide-leave-to { opacity: .8; transform: translateY(100%) scale(1); }
}
</style>
