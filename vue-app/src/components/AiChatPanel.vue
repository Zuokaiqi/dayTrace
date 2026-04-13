<template>
  <div :class="['ai-panel-backdrop', { open }]" @click.self="$emit('close')">
    <div :class="['ai-panel', { open }]" :style="panelStyle" ref="panelEl">

      <!-- Resize handle -->
      <div class="ai-resize-handle" @mousedown="onResizeStart"></div>

      <!-- Header -->
      <div class="ai-panel-header">
        <button class="ai-hdr-btn" @click="showHistory = !showHistory" :title="showHistory ? '返回对话' : '历史记录'">
          <svg v-if="!showHistory" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div class="ai-hdr-title-group">
          <span class="ai-hdr-title">{{ showHistory ? '历史对话' : 'AI 助手' }}</span>
          <span v-if="!showHistory && chatId" class="ai-hdr-sub">对话已保存</span>
        </div>
        <button v-if="!showHistory" class="ai-hdr-btn ai-hdr-new" @click="onNewChat" title="新建对话">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="ai-hdr-btn" @click="$emit('close')" title="关闭">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- History list -->
      <div v-if="showHistory" class="ai-history">
        <div v-if="!chatList.length" class="ai-history-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" stroke-width="1.5" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <span>还没有历史对话</span>
        </div>
        <div v-for="chat in chatList" :key="chat.id"
          :class="['ai-hist-item', { active: chat.id === chatId }]"
          @click="onSelectChat(chat.id)">
          <div class="ai-hist-icon">💬</div>
          <div class="ai-hist-body">
            <div class="ai-hist-title">{{ chat.title }}</div>
            <div class="ai-hist-time">{{ formatTime(chat.updated_at) }}</div>
          </div>
          <button class="ai-hist-del" @click.stop="onDeleteChat(chat.id)" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>

      <!-- Chat view -->
      <template v-else>
        <div class="ai-messages" ref="msgContainer">
          <!-- Empty state -->
          <div v-if="!messages.length" class="ai-empty">
            <div class="ai-empty-hero">
              <div class="ai-empty-glow"></div>
              <span class="ai-empty-icon">✨</span>
            </div>
            <div class="ai-empty-title">DayTrace AI</div>
            <div class="ai-empty-desc">用自然语言管理你的日程</div>
            <div class="ai-suggestions">
              <button v-for="s in suggestions" :key="s" class="ai-suggestion" @click="useSuggestion(s)">
                <span class="ai-sug-arrow">→</span>
                <span>{{ s }}</span>
              </button>
            </div>
          </div>

          <!-- Messages -->
          <template v-for="(msg, i) in messages" :key="i">
            <div :class="['ai-msg', msg.role]">
              <div v-if="msg.role === 'assistant'" class="ai-avatar ai-avatar-bot">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M16 14h.01"/><path d="M8 14h.01"/><path d="M12 18v2"/><path d="M7 22h10"/><rect x="3" y="10" width="18" height="10" rx="3"/></svg>
              </div>
              <div class="ai-bubble-wrap">
                <div v-if="msg.role === 'user'" class="ai-bubble ai-bubble-user">{{ msg.content }}</div>
                <div v-else class="ai-bubble ai-bubble-bot ai-md" v-html="renderMd(msg.content, loading && i === messages.length - 1)"></div>

                <!-- Action cards -->
                <div v-if="msg.actions && msg.actions.length" class="ai-actions">
                  <div v-for="(act, j) in msg.actions" :key="j"
                    :class="['ai-action-card', { 'ai-act-pending': act._status === 'pending', 'ai-act-error': act._status === 'error', 'ai-act-rejected': act._status === 'rejected', 'ai-act-undone': act._status === 'undone' }]">
                    <span class="ai-act-badge" :class="{ 'ai-act-badge-warn': act._status === 'pending', 'ai-act-badge-err': act._status === 'error' }">{{ actionIcon(act.type) }}</span>
                    <span class="ai-act-text">{{ act._status === 'error' ? act._error : (act._status === 'rejected' ? '已跳过' : actionDesc(act)) }}</span>
                    <!-- Pending: confirm / reject buttons -->
                    <template v-if="act._status === 'pending'">
                      <button class="ai-act-confirm" @click="confirmAction(act)" title="确认删除">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                      </button>
                      <button class="ai-act-reject" @click="rejectAction(act)" title="取消">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </template>
                    <!-- Done: checkmark -->
                    <svg v-else-if="act._status !== 'error' && act._status !== 'rejected'" class="ai-act-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                  </div>
                  <div class="ai-actions-hint" v-if="msg.actions.some(a => a._status === 'pending')">请确认删除操作</div>
                  <div class="ai-actions-hint" v-else-if="msg._undone">已撤回</div>
                  <div class="ai-actions-hint" v-else>
                    已应用
                    <button v-if="msg._applied" class="ai-undo-btn" @click="undoActions(msg)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 105.64-12.36L1 10"/></svg>
                      一键撤回
                    </button>
                  </div>
                </div>

                <!-- Retry button on network error -->
                <button v-if="msg.role === 'assistant' && i === messages.length - 1 && !loading && msg._networkError"
                  class="ai-regenerate ai-retry-btn" @click="retry" title="重试">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 105.64-12.36L1 10"/></svg>
                  <span>重试</span>
                </button>
                <!-- Regenerate button on last assistant message (not on errors) -->
                <button v-else-if="msg.role === 'assistant' && i === messages.length - 1 && !loading && msg.content"
                  class="ai-regenerate" @click="regenerate" title="重新生成">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 105.64-12.36L1 10"/></svg>
                  <span>重新生成</span>
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- Input area -->
        <div class="ai-input-area">
          <div class="ai-input-wrap" :class="{ focused: inputFocused }">
            <textarea
              ref="inputEl"
              v-model="input"
              class="ai-input"
              placeholder="输入日程操作，如：帮我安排明天下午开会..."
              @keydown.enter.exact.prevent="onSend"
              @focus="inputFocused = true"
              @blur="inputFocused = false"
              :disabled="loading"
              rows="1"
              @input="autoResize"
            ></textarea>
            <button v-if="loading" class="ai-send-btn ai-stop-btn" @click="abort" title="停止生成">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>
            <button v-else class="ai-send-btn" @click="onSend" :disabled="!input.trim()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
          <div class="ai-input-hint">Enter 发送 · Shift+Enter 换行</div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useAiChat } from '../composables/useAiChat'

marked.setOptions({ breaks: true, gfm: true })

const props = defineProps({ open: Boolean })
defineEmits(['close'])

const { messages, loading, send, abort, retry, regenerate, confirmAction, rejectAction, undoActions, buildSuggestions, chatId, chatList, newChat, loadChatList, loadChat, deleteChat } = useAiChat()

const input = ref('')
const msgContainer = ref(null)
const inputEl = ref(null)
const panelEl = ref(null)
const showHistory = ref(false)
const inputFocused = ref(false)

// ─── Resizable panel ───
const MIN_W = 320
const MAX_W = 800
const STORAGE_KEY = 'dt_ai_panel_width'
const panelWidth = ref(parseInt(localStorage.getItem(STORAGE_KEY)) || 420)
const panelStyle = computed(() => ({ width: panelWidth.value + 'px' }))
let _resizing = false

function onResizeStart(e) {
  e.preventDefault()
  _resizing = true
  const startX = e.clientX
  const startW = panelWidth.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  function onMove(ev) {
    if (!_resizing) return
    const dx = startX - ev.clientX // panel is on the right, so drag left = wider
    panelWidth.value = Math.min(MAX_W, Math.max(MIN_W, startW + dx))
  }
  function onUp() {
    _resizing = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    localStorage.setItem(STORAGE_KEY, panelWidth.value)
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

onBeforeUnmount(() => {
  _resizing = false
  if (_scrollRaf) { cancelAnimationFrame(_scrollRaf); _scrollRaf = null }
  abort()  // flush typewriter buffer & cancel in-flight request
})

const sugTick = ref(0) // bump to refresh suggestions
const suggestions = computed(() => { sugTick.value; return buildSuggestions() })

watch(() => props.open, (open) => {
  if (open) { loadChatList(); sugTick.value++ }
})

const thinkingDots = '<span class="ai-dots"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span></span>'

function renderMd(text, showCursor) {
  if (!text) return showCursor ? thinkingDots : ''
  let html = DOMPurify.sanitize(marked.parse(text))
  if (showCursor) html += thinkingDots
  return html
}

function useSuggestion(s) {
  input.value = s
  onSend()
}

async function onSend() {
  const text = input.value.trim()
  if (!text || loading.value) return
  input.value = ''
  if (inputEl.value) inputEl.value.style.height = 'auto'
  await send(text)
  scrollToBottom()
}

function autoResize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function onNewChat() {
  newChat()
  showHistory.value = false
}

async function onSelectChat(id) {
  await loadChat(id)
  showHistory.value = false
  scrollToBottom()
}

async function onDeleteChat(id) {
  await deleteChat(id)
  await loadChatList()
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前'
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function actionIcon(type) {
  if (type === 'addEvent' || type === 'batchAddEvents' || type === 'addTask') return '+'
  if (type === 'updateEvent' || type === 'updateTask') return '~'
  if (type === 'deleteEvent' || type === 'deleteTask') return '-'
  if (type === 'toggleTask') return '✓'
  return '·'
}

function actionDesc(act) {
  const p = act.params
  if (act.type === 'addEvent') return `添加「${p.title}」${p.start}—${p.end}`
  if (act.type === 'updateEvent') {
    const parts = []
    if (p.title) parts.push(`标题→${p.title}`)
    if (p.start || p.end) parts.push(`时间→${p.start || '?'}—${p.end || '?'}`)
    if (p.date) parts.push(`日期→${p.date}`)
    return `修改事件 #${p.eventId} ${parts.join('，')}`
  }
  if (act.type === 'deleteEvent') return `删除事件 #${p.eventId}`
  if (act.type === 'batchAddEvents') return `批量添加 ${p.events?.length || 0} 个事件`
  if (act.type === 'addTask') return `创建任务「${p.title}」${p.deadline ? ' DDL:' + p.deadline : ''}`
  if (act.type === 'updateTask') {
    const parts = []
    if (p.title) parts.push(`标题→${p.title}`)
    if (p.deadline !== undefined) parts.push(`DDL→${p.deadline || '无'}`)
    if (p.done !== undefined) parts.push(p.done ? '标记完成' : '取消完成')
    return `修改任务 #${p.taskId} ${parts.join('，')}`
  }
  if (act.type === 'deleteTask') return `删除任务 #${p.taskId}`
  if (act.type === 'toggleTask') return `${p.done ? '完成' : '取消完成'}任务 #${p.taskId}`
  return JSON.stringify(p)
}

function scrollToBottom() {
  nextTick(() => {
    if (msgContainer.value) msgContainer.value.scrollTop = msgContainer.value.scrollHeight
  })
}

let _scrollRaf = null
function scheduleScroll() {
  if (_scrollRaf) return
  _scrollRaf = requestAnimationFrame(() => {
    _scrollRaf = null
    if (msgContainer.value) msgContainer.value.scrollTop = msgContainer.value.scrollHeight
  })
}

watch(() => messages.value.length, scrollToBottom)
watch(() => messages.value[messages.value.length - 1]?.content, scheduleScroll)
watch(() => inputEl.value, (el) => { if (el) el.focus() })
</script>
