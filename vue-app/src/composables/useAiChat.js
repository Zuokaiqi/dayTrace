import { ref } from 'vue'
import { useEventStore } from '../stores/events'
import { useTaskStore } from '../stores/tasks'
import { useUndoStore } from '../stores/undo'
import { useUiStore } from '../stores/ui'
import { dateKey } from '../utils/time'
import { getTasksForDate } from './useDdlTodo'
import { showToast } from './useToast'

const messages = ref([])   // [{role: 'user'|'assistant', content, actions?}]
const loading = ref(false)
const chatId = ref(null)   // current chat ID (null = unsaved new chat)
const chatList = ref([])   // [{id, title, updated_at}]

// ─── Abort controller ───
let _abortController = null

// ─── Typewriter buffer ───
let _buffer = ''
let _targetIdx = -1  // index into messages.value
let _timerId = null
const BASE_DELAY = 25  // ms per character

function _startTypewriter(idx) {
  _targetIdx = idx
  if (!_timerId) _scheduleNext()
}

function _scheduleNext() {
  if (!_buffer || _targetIdx < 0) { _timerId = null; return }
  const delay = _buffer.length > 40 ? 8 : BASE_DELAY
  _timerId = setTimeout(_tick, delay)
}

function _tick() {
  _timerId = null
  if (!_buffer || _targetIdx < 0) return
  // Access through reactive proxy so Vue detects the change
  messages.value[_targetIdx].content += _buffer[0]
  _buffer = _buffer.slice(1)
  _scheduleNext()
}

function _flushBuffer() {
  if (_targetIdx >= 0 && _buffer) {
    messages.value[_targetIdx].content += _buffer
    _buffer = ''
  }
  if (_timerId) { clearTimeout(_timerId); _timerId = null }
  _targetIdx = -1
}

function _waitBufferDrain() {
  return new Promise(resolve => {
    function check() {
      if (!_buffer) { _targetIdx = -1; resolve(); return }
      setTimeout(check, 50)
    }
    check()
  })
}

// Detect how much calendar context the user's message needs
function detectDetailRange(text) {
  if (!text) return 1
  if (/这个?月|本月|月底|月初|下个?月|上个?月/.test(text)) return 30
  if (/这周|这个?星期|本周|下周|下个?星期|上周|上个?星期|周[一二三四五六日天]|星期[一二三四五六日天]/.test(text)) return 7
  if (/最近|近期|这几天|这段时间/.test(text)) return 7
  if (/大后天/.test(text)) return 4
  if (/后天|前天/.test(text)) return 3
  return 1
}

export function useAiChat() {
  const eventStore = useEventStore()
  const taskStore = useTaskStore()
  const undoStore = useUndoStore()
  const uiStore = useUiStore()

  function buildSuggestions() {
    const now = new Date()
    const hour = now.getHours()
    const today = dateKey(now)
    const tomorrow = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
    const todayEvents = eventStore.eventsForDate(now)
    const tomorrowEvents = eventStore.eventsForDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
    const todayTasks = getTasksForDate(today).filter(t => !t.done)
    const tomorrowTasks = getTasksForDate(tomorrow).filter(t => !t.done)

    const suggestions = []

    // 1. Time-aware planning suggestion
    if (hour < 10) {
      suggestions.push(todayEvents.length ? '帮我梳理一下今天的日程安排' : '帮我规划今天的日程')
    } else if (hour < 14) {
      suggestions.push(todayEvents.length > 3 ? '今天日程有点满，帮我调整一下' : '帮我安排一下下午的时间')
    } else if (hour < 20) {
      suggestions.push(tomorrowEvents.length ? '帮我看看明天的安排是否合理' : '帮我规划明天的日程')
    } else {
      suggestions.push('帮我规划明天的日程')
    }

    // 2. Event-based suggestion — reference a real event
    const upcoming = todayEvents
      .filter(e => e.plan?.start && e.plan.start > `${String(hour).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`)
      .sort((a, b) => (a.plan.start || '').localeCompare(b.plan.start || ''))
    if (upcoming.length) {
      const ev = upcoming[0]
      suggestions.push(`把「${ev.title}」推迟半小时`)
    } else if (todayEvents.length) {
      const ev = todayEvents[todayEvents.length - 1]
      suggestions.push(`把「${ev.title}」改到明天`)
    } else {
      const nextHour = Math.max(hour + 1, 9)
      const start = `${String(nextHour).padStart(2, '0')}:00`
      const end = `${String(nextHour + 1).padStart(2, '0')}:00`
      suggestions.push(`帮我在今天${start}到${end}安排写报告`)
    }

    // 3. Task-based suggestion
    if (todayTasks.length) {
      suggestions.push(`帮我安排时间完成「${todayTasks[0].label}」`)
    } else if (tomorrowTasks.length) {
      suggestions.push(`明天要做「${tomorrowTasks[0].label}」，帮我安排时间`)
    } else {
      suggestions.push('帮我创建一个新任务')
    }

    // 4. General utility
    if (todayEvents.length >= 5) {
      suggestions.push('今天还有哪些空闲时间段？')
    } else if (todayEvents.length === 0) {
      suggestions.push('帮我看看这周有哪些安排')
    } else {
      suggestions.push('帮我看看这周有哪些空闲')
    }

    return suggestions
  }

  function gatherContext(userMessage = '') {
    const now = new Date()
    const today = dateKey(now)
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const viewDate = dateKey(uiStore.curDate)

    const DETAIL_RANGE = detectDetailRange(userMessage)
    const SUMMARY_RANGE = Math.max(14, DETAIL_RANGE)

    const eventsByDate = {}
    const eventsSummary = {}  // dates outside detail range → count
    const tasksByDate = {}

    for (let offset = -SUMMARY_RANGE; offset <= SUMMARY_RANGE; offset++) {
      const d = new Date(now)
      d.setDate(d.getDate() + offset)
      const dk = dateKey(d)
      const isDetail = Math.abs(offset) <= DETAIL_RANGE || dk === viewDate

      // Events
      const dayEvents = eventStore.eventsForDate(d)
      if (isDetail) {
        const mapped = dayEvents.map(e => ({
          id: e.id, title: e.title, tag: e.tag, date: e.date,
          plan: e.plan, actual: e.actual, repeat: e.repeat || null
        }))
        if (mapped.length) eventsByDate[dk] = mapped
      } else if (dayEvents.length) {
        eventsSummary[dk] = dayEvents.length
      }

      // Tasks (only for detail range)
      if (isDetail) {
        const dayTasks = getTasksForDate(dk).map(t => ({
          taskId: t.taskId, label: t.label, done: t.done,
          tag: taskStore.tasks.find(x => x.id === t.taskId)?.tag || 'work'
        }))
        if (dayTasks.length) tasksByDate[dk] = dayTasks
      }
    }

    // Also include tasks without deadlines so AI can set deadlines for them
    const unscheduledTasks = taskStore.tasks
      .filter(t => !t.deadline)
      .map(t => ({ taskId: t.id, title: t.title, tag: t.tag, done: t.completed }))

    return { today, currentTime, viewDate, eventsByDate, eventsSummary, tasksByDate, unscheduledTasks }
  }

  function getHistory() {
    return messages.value
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => {
        let content = m.content
        // Append action results so AI knows what it did (event IDs, etc.)
        if (m.actions && m.actions.length) {
          const actionSummary = m.actions.map(a => {
            const p = a.params
            if (a.type === 'addEvent') return `[已执行: 添加事件 id=${a._resultId || '?'} "${p.title}" ${p.start}-${p.end}]`
            if (a.type === 'updateEvent') return `[已执行: 修改事件 id=${p.eventId}]`
            if (a.type === 'deleteEvent') return `[已执行: 删除事件 id=${p.eventId}]`
            if (a.type === 'batchAddEvents') {
              const idList = a._resultIds ? ` ids=[${a._resultIds.join(',')}]` : ''
              return `[已执行: 批量添加 ${p.events?.length || 0} 个事件${idList}]`
            }
            if (a.type === 'addTask') return `[已执行: 创建任务 id=${a._resultId || '?'} "${p.title}" deadline=${p.deadline || '无'}]`
            if (a.type === 'updateTask') return `[已执行: 修改任务 id=${p.taskId}]`
            if (a.type === 'deleteTask') return `[已执行: 删除任务 id=${p.taskId}]`
            if (a.type === 'toggleTask') return `[已执行: ${p.done ? '完成' : '取消完成'}任务 id=${p.taskId}]`
            return ''
          }).filter(Boolean).join('\n')
          content += '\n' + actionSummary
        }
        return { role: m.role, content }
      })
  }

  // Execute actions and return a human-readable summary for toast
  // If skipTypes is provided, actions of those types are skipped (left pending)
  function executeActions(actions, { skipTypes } = {}) {
    if (!actions || !actions.length) return ''
    const toExecute = skipTypes
      ? actions.filter(a => !skipTypes.includes(a.type))
      : actions
    if (!toExecute.length) return ''
    undoStore.pushUndo()

    const summaries = []
    for (const action of toExecute) {
      const p = action.params
      switch (action.type) {
        case 'addEvent': {
          const newEv = eventStore.addEvent({
            title: p.title, tag: p.tag || 'work', date: p.date,
            repeat: p.repeat || null,
            plan: { start: p.start, end: p.end },
            actual: null
          })
          action._resultId = newEv.id  // record ID for history context
          action._status = 'done'
          summaries.push(`已添加「${p.title}」`)
          break
        }
        case 'updateEvent': {
          const ev = eventStore.events.find(e => e.id === p.eventId)
          if (!ev) {
            action._status = 'error'
            action._error = `事件 #${p.eventId} 不存在`
            summaries.push(`修改失败：事件 #${p.eventId} 不存在`)
            break
          }
          const updates = {}
          if (p.title) updates.title = p.title
          if (p.tag) updates.tag = p.tag
          if (p.date) updates.date = p.date
          if (p.start || p.end) {
            const oldPlan = ev.plan || {}
            updates.plan = { start: p.start || oldPlan.start, end: p.end || oldPlan.end }
          }
          eventStore.updateEvent(p.eventId, updates)
          action._status = 'done'
          summaries.push(`已修改「${ev.title}」`)
          break
        }
        case 'deleteEvent': {
          const ev = eventStore.events.find(e => e.id === p.eventId)
          if (!ev) {
            action._status = 'error'
            action._error = `事件 #${p.eventId} 不存在`
            summaries.push(`删除失败：事件 #${p.eventId} 不存在`)
            break
          }
          const name = ev.title
          eventStore.removeEvent(p.eventId)
          action._status = 'done'
          summaries.push(`已删除「${name}」`)
          break
        }
        case 'batchAddEvents': {
          if (p.events) {
            const ids = []
            for (const e of p.events) {
              const newEv = eventStore.addEvent({
                title: e.title, tag: e.tag || 'work', date: e.date,
                repeat: null,
                plan: { start: e.start, end: e.end },
                actual: null
              })
              ids.push(newEv.id)
            }
            action._resultIds = ids  // record IDs for history context
            action._status = 'done'
            summaries.push(`已添加 ${p.events.length} 个日程`)
          }
          break
        }
        // ─── Task operations ───
        case 'addTask': {
          const frozenId = taskStore.taskNextId++
          taskStore.tasks.push({
            id: frozenId, title: p.title, tag: p.tag || 'work',
            completed: false, subtasks: [], deadline: p.deadline || null
          })
          taskStore.saveTasks()
          // Also create weeklyTask linkage
          taskStore.weeklyTasks.push({
            id: taskStore.wNextId++, title: p.title, tag: p.tag || 'work',
            monthGoalId: null, month: null, weekStart: null,
            startDate: null, deadline: p.deadline || null,
            done: false, frozenTaskId: frozenId
          })
          taskStore.saveGoals()
          action._resultId = frozenId
          action._status = 'done'
          summaries.push(`已创建任务「${p.title}」`)
          break
        }
        case 'updateTask': {
          const task = taskStore.tasks.find(t => t.id === p.taskId)
          if (!task) {
            action._status = 'error'
            action._error = `任务 #${p.taskId} 不存在`
            summaries.push(`修改失败：任务 #${p.taskId} 不存在`)
            break
          }
          if (p.title) task.title = p.title
          if (p.tag) task.tag = p.tag
          if (p.deadline !== undefined) task.deadline = p.deadline
          if (p.done !== undefined) {
            task.completed = p.done
            if (task.subtasks) task.subtasks.forEach(s => { s.done = p.done })
          }
          taskStore.saveTasks()
          // Sync to weeklyTask
          const wt = taskStore.weeklyTasks.find(w => w.frozenTaskId === p.taskId)
          if (wt) {
            if (p.title) wt.title = p.title
            if (p.tag) wt.tag = p.tag
            if (p.deadline !== undefined) wt.deadline = p.deadline
            if (p.done !== undefined) wt.done = p.done
            taskStore.saveGoals()
          }
          action._status = 'done'
          summaries.push(`已修改任务「${task.title}」`)
          break
        }
        case 'deleteTask': {
          const task = taskStore.tasks.find(t => t.id === p.taskId)
          if (!task) {
            action._status = 'error'
            action._error = `任务 #${p.taskId} 不存在`
            summaries.push(`删除失败：任务 #${p.taskId} 不存在`)
            break
          }
          const name = task.title
          // Remove linked weeklyTask
          const wt = taskStore.weeklyTasks.find(w => w.frozenTaskId === p.taskId)
          if (wt) {
            taskStore.weeklyTasks = taskStore.weeklyTasks.filter(w => w.id !== wt.id)
            taskStore.saveGoals()
          }
          taskStore.tasks = taskStore.tasks.filter(t => t.id !== p.taskId)
          taskStore.saveTasks()
          action._status = 'done'
          summaries.push(`已删除任务「${name}」`)
          break
        }
        case 'toggleTask': {
          const task = taskStore.tasks.find(t => t.id === p.taskId)
          if (!task) {
            action._status = 'error'
            action._error = `任务 #${p.taskId} 不存在`
            summaries.push(`操作失败：任务 #${p.taskId} 不存在`)
            break
          }
          const newDone = p.done !== undefined ? p.done : !task.completed
          task.completed = newDone
          if (task.subtasks) task.subtasks.forEach(s => { s.done = newDone })
          taskStore.saveTasks()
          const wt = taskStore.weeklyTasks.find(w => w.frozenTaskId === p.taskId)
          if (wt) { wt.done = newDone; taskStore.saveGoals() }
          action._status = 'done'
          summaries.push(`${newDone ? '已完成' : '取消完成'}任务「${task.title}」`)
          break
        }
      }
    }
    return summaries.join('，')
  }

  // Execute a single pending delete action (called from UI confirm)
  function confirmAction(action) {
    undoStore.pushUndo()
    const p = action.params
    if (action.type === 'deleteTask') {
      const task = taskStore.tasks.find(t => t.id === p.taskId)
      if (!task) {
        action._status = 'error'
        action._error = `任务 #${p.taskId} 不存在`
        showToast(`删除失败：任务 #${p.taskId} 不存在`, 2500)
        return
      }
      const name = task.title
      const wt = taskStore.weeklyTasks.find(w => w.frozenTaskId === p.taskId)
      if (wt) {
        taskStore.weeklyTasks = taskStore.weeklyTasks.filter(w => w.id !== wt.id)
        taskStore.saveGoals()
      }
      taskStore.tasks = taskStore.tasks.filter(t => t.id !== p.taskId)
      taskStore.saveTasks()
      action._status = 'done'
      showToast(`已删除任务「${name}」`, 2500)
    } else {
      const ev = eventStore.events.find(e => e.id === p.eventId)
      if (!ev) {
        action._status = 'error'
        action._error = `事件 #${p.eventId} 不存在`
        showToast(`删除失败：事件 #${p.eventId} 不存在`, 2500)
        return
      }
      eventStore.removeEvent(p.eventId)
      action._status = 'done'
      showToast(`已删除「${ev.title}」`, 2500)
    }
    _saveChat()
  }

  function rejectAction(action) {
    action._status = 'rejected'
    _saveChat()
  }

  function undoActions(msg) {
    if (!msg || !msg._applied) return
    undoStore.undo()
    // Mark all done actions as undone
    if (msg.actions) {
      for (const a of msg.actions) {
        if (a._status === 'done') a._status = 'undone'
      }
    }
    msg._applied = false
    msg._undone = true
    showToast('已撤回全部操作', 2500)
    _saveChat()
  }

  async function send(text) {
    if (!text.trim() || loading.value) return

    messages.value.push({ role: 'user', content: text })
    loading.value = true

    const assistantMsg = { role: 'assistant', content: '', actions: null, _applied: false }
    messages.value.push(assistantMsg)

    _abortController = new AbortController()

    try {
      const token = localStorage.getItem('dt_token')
      const resp = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        signal: _abortController.signal,
        body: JSON.stringify({
          message: text,
          context: gatherContext(text),
          history: getHistory().slice(0, -1)
        })
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        assistantMsg.content = err.error || '请求失败，请点击下方「重试」按钮重新发送。'
        assistantMsg._networkError = true
        loading.value = false
        return
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let sseBuf = ''
      _buffer = ''
      const msgIdx = messages.value.length - 1
      _startTypewriter(msgIdx)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        sseBuf += decoder.decode(value, { stream: true })

        const lines = sseBuf.split('\n')
        sseBuf = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6)
          if (!jsonStr) continue
          try {
            const evt = JSON.parse(jsonStr)
            if (evt.type === 'text') {
              _buffer += evt.content
              if (!_timerId) _scheduleNext()
            } else if (evt.type === 'actions') {
              // Flush text buffer before applying actions
              _flushBuffer()
              const msg = messages.value[msgIdx]
              // Mark delete actions as pending for user confirmation
              for (const a of evt.actions) {
                if (a.type === 'deleteEvent' || a.type === 'deleteTask') a._status = 'pending'
              }
              msg.actions = evt.actions
              const summary = executeActions(evt.actions, { skipTypes: ['deleteEvent', 'deleteTask'] })
              msg._applied = true
              if (summary) showToast(summary, 2500)
              // Re-attach typewriter for follow-up text
              _startTypewriter(msgIdx)
            } else if (evt.type === 'error') {
              _flushBuffer()
              assistantMsg.content += '\n\n' + evt.error
            }
          } catch (parseErr) {
            console.warn('[AI] SSE parse error:', parseErr, jsonStr)
          }
        }
      }
      // Wait for typewriter to finish naturally instead of flushing
      await _waitBufferDrain()
    } catch (e) {
      _flushBuffer()
      if (e.name === 'AbortError') {
        // User clicked stop — keep whatever text was already streamed
      } else {
        assistantMsg.content = '网络连接中断，请点击下方「重试」按钮重新发送。'
        assistantMsg._networkError = true
        showToast('网络错误，请重试', 3000)
      }
    }

    _abortController = null
    loading.value = false
    _saveChat()
  }

  // ─── Chat persistence ───
  async function _saveChat() {
    const token = localStorage.getItem('dt_token')
    if (!token || !messages.value.length) return
    // Derive title from first user message
    const firstUser = messages.value.find(m => m.role === 'user')
    const title = firstUser ? firstUser.content.slice(0, 30) : '新对话'
    // Strip transient fields before saving
    const toSave = messages.value.map(m => ({
      role: m.role, content: m.content,
      ...(m.actions ? { actions: m.actions } : {}),
      ...(m._applied ? { _applied: true } : {})
    }))
    try {
      const resp = await fetch('/api/ai/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ id: chatId.value, title, messages: toSave })
      })
      const data = await resp.json()
      if (data.id) chatId.value = data.id
    } catch (e) {
      console.warn('[AI] 保存对话失败:', e.message)
    }
  }

  async function loadChatList() {
    const token = localStorage.getItem('dt_token')
    if (!token) return
    try {
      const resp = await fetch('/api/ai/chats', {
        headers: { Authorization: 'Bearer ' + token }
      })
      const data = await resp.json()
      chatList.value = data.chats || []
    } catch (e) {
      console.warn('[AI] 加载对话列表失败:', e.message)
    }
  }

  async function loadChat(id) {
    const token = localStorage.getItem('dt_token')
    if (!token) return
    try {
      const resp = await fetch(`/api/ai/chats/${id}`, {
        headers: { Authorization: 'Bearer ' + token }
      })
      const data = await resp.json()
      if (data.messages) {
        // Normalize action _status for loaded history (C: fix missing _status)
        for (const m of data.messages) {
          if (m.actions) {
            for (const a of m.actions) {
              if (!a._status) a._status = m._applied ? 'done' : 'pending'
            }
          }
        }
        messages.value = data.messages
        chatId.value = data.id
      }
    } catch (e) {
      console.warn('[AI] 加载对话失败:', e.message)
    }
  }

  async function deleteChat(id) {
    const token = localStorage.getItem('dt_token')
    if (!token) return
    try {
      await fetch(`/api/ai/chats/${id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token }
      })
      chatList.value = chatList.value.filter(c => c.id !== id)
      if (chatId.value === id) newChat()
    } catch {}
  }

  function abort() {
    if (_abortController) {
      _abortController.abort()
      _flushBuffer()
    }
  }

  async function retry() {
    if (loading.value) return
    // Find the last user message whose assistant reply was a network error
    let lastUserIdx = -1
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i].role === 'user') { lastUserIdx = i; break }
    }
    if (lastUserIdx < 0) return
    const text = messages.value[lastUserIdx].content
    // Remove the failed user + assistant messages
    messages.value.splice(lastUserIdx)
    await send(text)
  }

  async function regenerate() {
    if (loading.value) return
    // Find the last user message and its assistant reply
    let lastUserIdx = -1
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i].role === 'user') { lastUserIdx = i; break }
    }
    if (lastUserIdx < 0) return
    const text = messages.value[lastUserIdx].content
    // Check if the assistant reply had applied actions — undo them
    const assistantMsg = messages.value[lastUserIdx + 1]
    if (assistantMsg?.actions?.some(a => a._status === 'done')) {
      undoStore.undo()
    }
    // Remove the user message and everything after it
    messages.value.splice(lastUserIdx)
    await send(text)
  }

  function newChat() {
    messages.value = []
    chatId.value = null
  }

  return {
    messages, loading, chatId, chatList,
    send, abort, retry, regenerate, confirmAction, rejectAction, undoActions,
    executeActions, buildSuggestions, newChat,
    loadChatList, loadChat, deleteChat
  }
}
