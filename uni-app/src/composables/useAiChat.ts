import { ref } from 'vue'
import { useEventStore } from '../stores/events'
import { useTaskStore } from '../stores/tasks'
import { useUiStore } from '../stores/ui'
import { dateKey } from '../utils/time'

const messages = ref<any[]>([])
const loading = ref(false)
const chatId = ref<number | null>(null)
const chatList = ref<any[]>([])

export function resetChat(): void {
  messages.value = []
  loading.value = false
  chatId.value = null
  chatList.value = []
}

function detectDetailRange(text: string): number {
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
  const uiStore = useUiStore()

  function gatherContext(userMessage = '') {
    const now = new Date()
    const today = dateKey(now)
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const viewDate = dateKey(uiStore.curDate)

    const DETAIL_RANGE = detectDetailRange(userMessage)
    const SUMMARY_RANGE = Math.max(14, DETAIL_RANGE)

    const eventsByDate: Record<string, any[]> = {}
    const eventsSummary: Record<string, number> = {}

    for (let offset = -SUMMARY_RANGE; offset <= SUMMARY_RANGE; offset++) {
      const d = new Date(now)
      d.setDate(d.getDate() + offset)
      const dk = dateKey(d)
      const isDetail = Math.abs(offset) <= DETAIL_RANGE || dk === viewDate
      const dayEvents = eventStore.eventsForDate(d)
      if (isDetail) {
        const mapped = dayEvents.map((e: any) => ({
          id: e.id, title: e.title, tag: e.tag, date: e.date,
          plan: e.plan, actual: e.actual, repeat: e.repeat || null
        }))
        if (mapped.length) eventsByDate[dk] = mapped
      } else if (dayEvents.length) {
        eventsSummary[dk] = dayEvents.length
      }
    }

    return { today, currentTime, viewDate, eventsByDate, eventsSummary }
  }

  function getHistory() {
    return messages.value
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))
  }

  function executeActions(actions: any[]): string {
    if (!actions || !actions.length) return ''
    const summaries: string[] = []
    for (const action of actions) {
      const p = action.params
      switch (action.type) {
        case 'addEvent': {
          const newEv = eventStore.addEvent({
            title: p.title, tag: p.tag || 'work', date: p.date,
            repeat: p.repeat || null,
            plan: { start: p.start, end: p.end },
            actual: null
          })
          action._resultId = newEv.id
          action._status = 'done'
          summaries.push(`已添加「${p.title}」`)
          break
        }
        case 'updateEvent': {
          const ev = eventStore.events.find((e: any) => e.id === p.eventId)
          if (!ev) { action._status = 'error'; break }
          const updates: any = {}
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
          const ev = eventStore.events.find((e: any) => e.id === p.eventId)
          if (!ev) { action._status = 'error'; break }
          eventStore.removeEvent(p.eventId)
          action._status = 'done'
          summaries.push(`已删除「${ev.title}」`)
          break
        }
        case 'batchAddEvents': {
          if (p.events) {
            for (const e of p.events) {
              eventStore.addEvent({
                title: e.title, tag: e.tag || 'work', date: e.date,
                repeat: null, plan: { start: e.start, end: e.end }, actual: null
              })
            }
            action._status = 'done'
            summaries.push(`已添加 ${p.events.length} 个日程`)
          }
          break
        }
        case 'addTask': {
          const frozenId = taskStore.taskNextId++
          taskStore.tasks.push({
            id: frozenId, title: p.title, tag: p.tag || 'work',
            completed: false, subtasks: [], deadline: p.deadline || null
          })
          taskStore.saveTasks()
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
          const task = taskStore.tasks.find((t: any) => t.id === p.taskId)
          if (!task) { action._status = 'error'; break }
          if (p.title) task.title = p.title
          if (p.tag) task.tag = p.tag
          if (p.deadline !== undefined) task.deadline = p.deadline
          if (p.done !== undefined) {
            task.completed = p.done
            if (task.subtasks) task.subtasks.forEach((s: any) => { s.done = p.done })
          }
          taskStore.saveTasks()
          action._status = 'done'
          summaries.push(`已修改任务「${task.title}」`)
          break
        }
        case 'deleteTask': {
          const task = taskStore.tasks.find((t: any) => t.id === p.taskId)
          if (!task) { action._status = 'error'; break }
          const name = task.title
          const wt = taskStore.weeklyTasks.find((w: any) => w.frozenTaskId === p.taskId)
          if (wt) {
            taskStore.weeklyTasks = taskStore.weeklyTasks.filter((w: any) => w.id !== wt.id)
            taskStore.saveGoals()
          }
          taskStore.tasks = taskStore.tasks.filter((t: any) => t.id !== p.taskId)
          taskStore.saveTasks()
          action._status = 'done'
          summaries.push(`已删除任务「${name}」`)
          break
        }
      }
    }
    return summaries.join('，')
  }

  async function send(text: string): Promise<void> {
    if (!text.trim() || loading.value) return

    messages.value.push({ role: 'user', content: text })
    loading.value = true

    const assistantMsg: any = { role: 'assistant', content: '', actions: null, _applied: false }
    messages.value.push(assistantMsg)

    try {
      const token = uni.getStorageSync('dt_token')
      const apiBase = uni.getStorageSync('dt_api_base') || ''

      // uni-app native: 使用普通 POST 替代 SSE 流式请求
      // 后端需支持 /api/ai/chat 非流式端点，返回 { text, actions }
      await new Promise<void>((resolve, reject) => {
        uni.request({
          url: apiBase + '/api/ai/chat',
          method: 'POST',
          header: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token
          },
          data: {
            message: text,
            context: gatherContext(text),
            history: getHistory().slice(0, -1)
          },
          timeout: 60000,
          success(res: any) {
            const data = res.data
            if (res.statusCode >= 200 && res.statusCode < 300) {
              assistantMsg.content = data.text || data.content || ''
              if (data.actions && data.actions.length) {
                assistantMsg.actions = data.actions
                executeActions(data.actions)
                assistantMsg._applied = true
              }
            } else {
              assistantMsg.content = data?.error || '请求失败，请重试。'
              assistantMsg._networkError = true
            }
            resolve()
          },
          fail(err: any) {
            assistantMsg.content = '网络连接失败，请检查服务器地址设置。'
            assistantMsg._networkError = true
            reject(new Error(err.errMsg))
          }
        })
      })
    } catch (err) {
      console.error('[useAiChat] send failed:', err)
      // error already set in assistantMsg
    }

    loading.value = false
    _saveChat()
  }

  async function _saveChat(): Promise<void> {
    const token = uni.getStorageSync('dt_token')
    if (!token || !messages.value.length) return
    const firstUser = messages.value.find(m => m.role === 'user')
    const title = firstUser ? firstUser.content.slice(0, 30) : '新对话'
    const toSave = messages.value.map(m => ({
      role: m.role, content: m.content,
      ...(m.actions ? { actions: m.actions } : {}),
      ...(m._applied ? { _applied: true } : {})
    }))
    try {
      await new Promise<void>((resolve, reject) => {
        const apiBase = uni.getStorageSync('dt_api_base') || ''
        uni.request({
          url: apiBase + '/api/ai/chats',
          method: 'POST',
          header: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          data: { id: chatId.value, title, messages: toSave },
          success(res: any) {
            if (res.data?.id) chatId.value = res.data.id
            resolve()
          },
          fail: reject
        })
      })
    } catch (err: any) {
      console.error('[useAiChat] _saveChat failed:', err?.errMsg || err)
    }
  }

  async function loadChatList(): Promise<void> {
    const token = uni.getStorageSync('dt_token')
    if (!token) return
    try {
      await new Promise<void>((resolve) => {
        const apiBase = uni.getStorageSync('dt_api_base') || ''
        uni.request({
          url: apiBase + '/api/ai/chats',
          header: { Authorization: 'Bearer ' + token },
          success(res: any) { chatList.value = res.data?.chats || []; resolve() },
          fail: (err) => { console.error('[useAiChat] loadChatList failed:', err?.errMsg); resolve() }
        })
      })
    } catch (err) {
      console.error('[useAiChat] loadChatList threw:', err)
    }
  }

  async function loadChat(id: number): Promise<void> {
    const token = uni.getStorageSync('dt_token')
    if (!token) return
    try {
      await new Promise<void>((resolve) => {
        const apiBase = uni.getStorageSync('dt_api_base') || ''
        uni.request({
          url: apiBase + `/api/ai/chats/${id}`,
          header: { Authorization: 'Bearer ' + token },
          success(res: any) {
            if (res.data?.messages) {
              messages.value = res.data.messages
              chatId.value = res.data.id
            }
            resolve()
          },
          fail: (err) => { console.error('[useAiChat] loadChat failed:', err?.errMsg); resolve() }
        })
      })
    } catch (err) {
      console.error('[useAiChat] loadChat threw:', err)
    }
  }

  async function deleteChat(id: number): Promise<void> {
    const token = uni.getStorageSync('dt_token')
    if (!token) return
    try {
      await new Promise<void>((resolve) => {
        const apiBase = uni.getStorageSync('dt_api_base') || ''
        uni.request({
          url: apiBase + `/api/ai/chats/${id}`,
          method: 'DELETE',
          header: { Authorization: 'Bearer ' + token },
          success() {
            chatList.value = chatList.value.filter(c => c.id !== id)
            if (chatId.value === id) newChat()
            resolve()
          },
          fail: (err) => { console.error('[useAiChat] deleteChat failed:', err?.errMsg); resolve() }
        })
      })
    } catch (err) {
      console.error('[useAiChat] deleteChat threw:', err)
    }
  }

  function newChat(): void {
    messages.value = []
    chatId.value = null
  }

  return {
    messages, loading, chatId, chatList,
    send, executeActions, newChat,
    loadChatList, loadChat, deleteChat
  }
}
