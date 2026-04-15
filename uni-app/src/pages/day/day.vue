<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-row">
        <view class="nav-btn" @tap="prevDay">
          <text class="nav-arrow">‹</text>
        </view>
        <view class="date-center" @tap="goToday">
          <text class="date-main">{{ dateDisplay }}</text>
          <text class="date-week">{{ weekDisplay }}</text>
        </view>
        <view class="nav-btn" @tap="nextDay">
          <text class="nav-arrow">›</text>
        </view>
        <view class="ai-btn" @tap="openAi">
          <text class="ai-icon">✦</text>
        </view>
      </view>
    </view>

    <!-- 时间轴 -->
    <scroll-view
      class="timeline-scroll"
      scroll-y
      :scroll-top="scrollTop"
      :style="{ top: headerHeight + 'px' }"
    >
      <view class="timeline-inner">
        <view
          v-for="hour in 24"
          :key="hour"
          class="hour-row"
          @tap="onHourTap(hour - 1)"
        >
          <text class="hour-label">{{ String(hour - 1).padStart(2, '0') }}:00</text>
          <view class="hour-line" />
          <view class="half-line" />
        </view>

        <view
          v-if="isToday"
          class="now-line"
          :style="{ top: nowLineTop + 'rpx' }"
        >
          <view class="now-dot" />
          <view class="now-bar" />
        </view>

        <view
          v-for="ev in dayEvents"
          :key="ev.id + (ev._viewDate || '')"
          class="event-block"
          :style="eventBlockStyle(ev)"
          @tap="onEventTap(ev)"
          @longpress="onEventLongPress(ev)"
        >
          <view class="event-tag" :style="{ background: tagColor(ev.tag) }" />
          <view class="event-content">
            <text class="event-title">{{ ev.title }}</text>
            <text v-if="ev.plan" class="event-time">{{ ev.plan.start }}–{{ ev.plan.end }}</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 新建按钮 -->
    <view class="fab" @tap="openCreateModal">
      <text class="fab-icon">＋</text>
    </view>

    <!-- 新建日程弹窗 -->
    <view v-if="showCreate" class="modal-mask" @tap.self="showCreate = false">
      <view class="modal-sheet">
        <text class="modal-title">新建日程</text>
        <view class="modal-field">
          <text class="modal-label">标题</text>
          <input class="modal-input" v-model="form.title" placeholder="日程标题" placeholder-class="ph" />
        </view>
        <view class="modal-row">
          <view class="modal-field half">
            <text class="modal-label">开始</text>
            <input class="modal-input" v-model="form.start" placeholder="09:00" placeholder-class="ph" />
          </view>
          <view class="modal-field half">
            <text class="modal-label">结束</text>
            <input class="modal-input" v-model="form.end" placeholder="10:00" placeholder-class="ph" />
          </view>
        </view>
        <view class="tag-row">
          <view
            v-for="tag in tags"
            :key="tag.key"
            class="tag-chip"
            :class="{ selected: form.tag === tag.key }"
            :style="{ borderColor: tag.color, background: form.tag === tag.key ? tag.color : 'transparent' }"
            @tap="form.tag = tag.key"
          >
            <text :style="{ color: form.tag === tag.key ? '#fff' : tag.color }">{{ tag.label }}</text>
          </view>
        </view>
        <view class="modal-actions">
          <view class="modal-btn cancel" @tap="showCreate = false"><text>取消</text></view>
          <view class="modal-btn confirm" @tap="createEvent"><text>创建</text></view>
        </view>
      </view>
    </view>

    <!-- 事件操作菜单 -->
    <view v-if="selectedEvent" class="modal-mask" @tap.self="selectedEvent = null">
      <view class="action-sheet">
        <view class="action-ev-info">
          <view class="action-tag-dot" :style="{ background: tagColor(selectedEvent.tag) }" />
          <view>
            <text class="action-ev-title">{{ selectedEvent.title }}</text>
            <text v-if="selectedEvent.plan" class="action-ev-time">{{ selectedEvent.plan.start }}–{{ selectedEvent.plan.end }}</text>
          </view>
        </view>
        <view class="action-items">
          <view class="action-item" @tap="handleEdit">
            <text class="action-icon">✏️</text><text>编辑</text>
          </view>
          <view class="action-item danger" @tap="deleteSelected">
            <text class="action-icon">🗑️</text><text>删除</text>
          </view>
          <view class="action-item" @tap="selectedEvent = null">
            <text class="action-icon">✕</text><text>关闭</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 编辑弹窗 -->
    <view v-if="showEdit" class="modal-mask" @tap.self="showEdit = false">
      <view class="modal-sheet">
        <text class="modal-title">编辑日程</text>
        <view class="modal-field">
          <text class="modal-label">标题</text>
          <input class="modal-input" v-model="form.title" placeholder="日程标题" placeholder-class="ph" />
        </view>
        <view class="modal-row">
          <view class="modal-field half">
            <text class="modal-label">开始</text>
            <input class="modal-input" v-model="form.start" placeholder="09:00" placeholder-class="ph" />
          </view>
          <view class="modal-field half">
            <text class="modal-label">结束</text>
            <input class="modal-input" v-model="form.end" placeholder="10:00" placeholder-class="ph" />
          </view>
        </view>
        <view class="tag-row">
          <view
            v-for="tag in tags"
            :key="tag.key"
            class="tag-chip"
            :class="{ selected: form.tag === tag.key }"
            :style="{ borderColor: tag.color, background: form.tag === tag.key ? tag.color : 'transparent' }"
            @tap="form.tag = tag.key"
          >
            <text :style="{ color: form.tag === tag.key ? '#fff' : tag.color }">{{ tag.label }}</text>
          </view>
        </view>
        <view class="modal-actions">
          <view class="modal-btn cancel" @tap="showEdit = false"><text>取消</text></view>
          <view class="modal-btn confirm" @tap="saveEdit"><text>保存</text></view>
        </view>
      </view>
    </view>

    <!-- AI 对话抽屉 -->
    <view v-if="showAi" class="ai-drawer-mask" @tap.self="showAi = false">
      <view class="ai-drawer">
        <view class="ai-drawer-header">
          <text class="ai-drawer-title">AI 助手</text>
          <view class="ai-drawer-close" @tap="showAi = false"><text>✕</text></view>
        </view>
        <scroll-view class="ai-messages" scroll-y :scroll-top="aiScrollTop">
          <view v-if="!aiChat.messages.length" class="ai-empty">
            <text class="ai-empty-text">有什么可以帮到你？</text>
            <view v-for="s in suggestions" :key="s" class="ai-suggestion" @tap="sendAi(s)">
              <text>{{ s }}</text>
            </view>
          </view>
          <view v-for="(msg, i) in aiChat.messages" :key="i" class="ai-msg-row" :class="msg.role">
            <view class="ai-bubble">
              <text class="ai-bubble-text">{{ msg.content }}</text>
            </view>
          </view>
          <view v-if="aiChat.loading" class="ai-msg-row assistant">
            <view class="ai-bubble loading-bubble">
              <text>···</text>
            </view>
          </view>
        </scroll-view>
        <view class="ai-input-row">
          <input
            class="ai-input"
            v-model="aiInput"
            placeholder="发消息给 AI..."
            placeholder-class="ph"
            @confirm="sendAiInput"
          />
          <view class="ai-send-btn" @tap="sendAiInput">
            <text class="ai-send-icon">↑</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useEventStore } from '../../stores/events'
import { useUiStore } from '../../stores/ui'
import { useSync } from '../../composables/useSync'
import { useAiChat } from '../../composables/useAiChat'
import { dateKey, WD, TAG_COLORS } from '../../utils/time'

const eventStore = useEventStore()
const uiStore = useUiStore()
const { pullFromServer, startAutoSync } = useSync()
const aiChat = useAiChat()

// Layout
const statusBarHeight = ref(20)
const headerHeight = ref(88)
const scrollTop = ref(0)

const stopAutoSync = ref<(() => void) | null>(null)

onShow(() => {
  pullFromServer({ silent: true })
  const pending = uni.getStorageSync('dt_pending_schedule')
  if (pending) {
    uni.removeStorageSync('dt_pending_schedule')
    try {
      const info = JSON.parse(pending)
      form.value = { title: info.title || '', start: '09:00', end: '10:00', tag: info.tag || 'work' }
      showCreate.value = true
    } catch {}
  }
})

// Date navigation
const curDate = computed(() => uiStore.curDate)
const isToday = computed(() => {
  const d = curDate.value
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
})

const dateDisplay = computed(() => {
  const d = curDate.value
  return `${d.getMonth() + 1}月${d.getDate()}日`
})

const weekDisplay = computed(() => {
  const d = curDate.value
  const dow = d.getDay()
  return (isToday.value ? '今天 · ' : '') + '周' + WD[dow]
})

function prevDay() { uiStore.prev() }
function nextDay() { uiStore.next() }
function goToday() { uiStore.goToday() }

// Events for current date
const dayEvents = computed(() => eventStore.eventsForDate(curDate.value))

// Now line
const nowLineTop = ref(0)
let nowLineTimer: ReturnType<typeof setInterval> | null = null

function updateNowLine() {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  // 每30分钟对应160rpx（hour-row高度160rpx，half在80rpx处）
  nowLineTop.value = (minutes / 30) * 160
}

onMounted(() => {
  // 1. 系统信息 + 滚动位置
  try {
    const sysInfo = uni.getSystemInfoSync()
    statusBarHeight.value = sysInfo.statusBarHeight || 20
    headerHeight.value = statusBarHeight.value + 56
  } catch {}
  const now = new Date()
  const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes()
  const pxPerHour = 80
  scrollTop.value = Math.max(0, (minutesSinceMidnight / 60) * pxPerHour - 200)

  // 2. 自动同步
  const stop = startAutoSync()
  stopAutoSync.value = stop

  // 3. 当前时间线
  updateNowLine()
  nowLineTimer = setInterval(updateNowLine, 60000)
})
onUnmounted(() => {
  if (stopAutoSync.value) stopAutoSync.value()
  if (nowLineTimer) clearInterval(nowLineTimer)
})

// Event block positioning
function tagColor(tag: string): string {
  return TAG_COLORS[tag] || '#1a73e8'
}

function eventBlockStyle(ev: any) {
  if (!ev.plan?.start || !ev.plan?.end) {
    return { display: 'none' }
  }
  const [sh, sm] = ev.plan.start.split(':').map(Number)
  const [eh, em] = ev.plan.end.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  // hour-row高度160rpx，对应60分钟；所以1分钟=160/60rpx
  const top = (startMin / 60) * 160
  const height = Math.max(((endMin - startMin) / 60) * 160, 80)
  return {
    top: top + 'rpx',
    height: height + 'rpx',
    borderLeftColor: tagColor(ev.tag)
  }
}

function onHourTap(hour: number) {
  form.value.start = `${String(hour).padStart(2, '0')}:00`
  form.value.end = hour === 23 ? '23:59' : `${String(hour + 1).padStart(2, '0')}:00`
  showCreate.value = true
}

// Event actions
const selectedEvent = ref<any>(null)
const showEdit = ref(false)
const editingEventId = ref<number | null>(null)

function onEventTap(ev: any) {
  selectedEvent.value = ev
}

function onEventLongPress(ev: any) {
  selectedEvent.value = ev
}

// Create
const showCreate = ref(false)
const form = ref({ title: '', start: '09:00', end: '10:00', tag: 'work' })
const tags = [
  { key: 'work', label: '工作', color: '#1a73e8' },
  { key: 'personal', label: '生活', color: '#34a853' },
  { key: 'admin', label: '事务', color: '#fb8c00' }
]

function openCreateModal() {
  form.value = { title: '', start: '09:00', end: '10:00', tag: 'work' }
  showCreate.value = true
}

function createEvent() {
  if (!form.value.title.trim()) {
    uni.showToast({ title: '请输入标题', icon: 'none' })
    return
  }
  eventStore.addEvent({
    title: form.value.title.trim(),
    tag: form.value.tag,
    date: dateKey(curDate.value),
    plan: { start: form.value.start, end: form.value.end },
    actual: null,
    repeat: null
  })
  showCreate.value = false
  uni.showToast({ title: '已创建', icon: 'success', duration: 1500 })
}

function handleEdit() {
  if (!selectedEvent.value) return
  const ev = selectedEvent.value
  editingEventId.value = ev._repeatSrc ?? ev.id
  form.value = {
    title: ev.title,
    start: ev.plan?.start || '09:00',
    end: ev.plan?.end || '10:00',
    tag: ev.tag || 'work'
  }
  selectedEvent.value = null
  showEdit.value = true
}

function saveEdit() {
  if (!form.value.title.trim()) {
    uni.showToast({ title: '请输入标题', icon: 'none' })
    return
  }
  if (editingEventId.value !== null) {
    eventStore.updateEvent(editingEventId.value, {
      title: form.value.title.trim(),
      tag: form.value.tag,
      plan: { start: form.value.start, end: form.value.end }
    })
  }
  showEdit.value = false
  editingEventId.value = null
  uni.showToast({ title: '已保存', icon: 'success', duration: 1500 })
}

function deleteSelected() {
  if (!selectedEvent.value) return
  const ev = selectedEvent.value

  if (ev._repeatSrc) {
    uni.showActionSheet({
      itemList: ['仅删本次', '删除所有'],
      success(res) {
        if (res.tapIndex === 0) {
          eventStore.addExclude(ev._repeatSrc, ev._viewDate || dateKey(curDate.value))
          selectedEvent.value = null
          uni.showToast({ title: '已删除本次', icon: 'success', duration: 1500 })
        } else if (res.tapIndex === 1) {
          uni.showModal({
            title: '确认删除',
            content: `删除「${ev.title}」的所有重复？`,
            success(res2) {
              if (res2.confirm) {
                eventStore.removeEvent(ev._repeatSrc)
                selectedEvent.value = null
                uni.showToast({ title: '已删除全部', icon: 'success', duration: 1500 })
              }
            }
          })
        }
      }
    })
    return
  }

  uni.showModal({
    title: '确认删除',
    content: `删除「${ev.title}」？`,
    success(res) {
      if (res.confirm) {
        eventStore.removeEvent(ev.id)
        selectedEvent.value = null
        uni.showToast({ title: '已删除', icon: 'success', duration: 1500 })
      }
    }
  })
}

// AI drawer
const showAi = ref(false)
const aiInput = ref('')
const aiScrollTop = ref(9999)
const suggestions = ref<string[]>([])

function openAi() {
  showAi.value = true
  const now = new Date()
  const h = now.getHours()
  const evs = dayEvents.value
  if (evs.length) {
    suggestions.value = [
      '帮我梳理今天的日程安排',
      '今天还有哪些空闲时间？',
      '帮我规划明天的日程'
    ]
  } else {
    suggestions.value = [
      '帮我规划今天的日程',
      `帮我安排 ${String(Math.max(h + 1, 9)).padStart(2, '0')}:00 到 ${String(Math.max(h + 2, 10)).padStart(2, '0')}:00 的工作`,
      '帮我看看这周有哪些安排'
    ]
  }
}

async function sendAi(text: string) {
  await aiChat.send(text)
  aiScrollTop.value = 9999
}

async function sendAiInput() {
  const text = aiInput.value.trim()
  if (!text) return
  aiInput.value = ''
  await aiChat.send(text)
  aiScrollTop.value = 9999
}
</script>

<style scoped>
.page {
  height: 100vh;
  background: #f5f7fa;
  overflow: hidden;
}

.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: #fff;
  z-index: 100;
  box-shadow: 0 1rpx 0 #eee;
}

.nav-row {
  display: flex;
  align-items: center;
  height: 112rpx;
  padding: 0 24rpx;
}

.nav-btn {
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f5f7fa;
}

.nav-arrow {
  font-size: 44rpx;
  color: #333;
  line-height: 1;
}

.date-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.date-main {
  font-size: 36rpx;
  font-weight: 700;
  color: #1a1a1a;
}

.date-week {
  font-size: 24rpx;
  color: #888;
  margin-top: 2rpx;
}

.ai-btn {
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e8f0fe;
  border-radius: 50%;
}

.ai-icon {
  font-size: 32rpx;
  color: #1a73e8;
}

.timeline-scroll {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
}

.timeline-inner {
  position: relative;
  padding-bottom: 160rpx;
}

.hour-row {
  position: relative;
  height: 160rpx;
  display: flex;
  align-items: flex-start;
}

.hour-label {
  width: 100rpx;
  font-size: 22rpx;
  color: #aaa;
  text-align: center;
  flex-shrink: 0;
  padding-top: 0;
}

.hour-line {
  position: absolute;
  top: 0;
  left: 100rpx;
  right: 0;
  height: 1rpx;
  background: #eee;
}

.half-line {
  position: absolute;
  top: 80rpx;
  left: 100rpx;
  right: 0;
  height: 1rpx;
  background: #f5f5f5;
}

.now-line {
  position: absolute;
  left: 100rpx;
  right: 0;
  display: flex;
  align-items: center;
  z-index: 10;
}

.now-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #e53935;
  margin-left: -8rpx;
  flex-shrink: 0;
}

.now-bar {
  flex: 1;
  height: 2rpx;
  background: #e53935;
}

.event-block {
  position: absolute;
  left: 108rpx;
  right: 16rpx;
  border-radius: 8rpx;
  background: #e8f0fe;
  border-left: 6rpx solid #1a73e8;
  display: flex;
  align-items: center;
  overflow: hidden;
  z-index: 5;
}

.event-tag {
  width: 0;
}

.event-content {
  flex: 1;
  padding: 8rpx 16rpx;
}

.event-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #1a1a1a;
  display: block;
}

.event-time {
  font-size: 22rpx;
  color: #666;
  display: block;
  margin-top: 4rpx;
}

.fab {
  position: fixed;
  right: 48rpx;
  bottom: 160rpx;
  width: 112rpx;
  height: 112rpx;
  background: #1a73e8;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(26,115,232,0.4);
  z-index: 50;
}

.fab-icon {
  font-size: 56rpx;
  color: #fff;
  line-height: 1;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 200;
  display: flex;
  align-items: flex-end;
}

.modal-sheet {
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  padding: 40rpx 40rpx 80rpx;
  width: 100%;
}

.modal-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #1a1a1a;
  display: block;
  margin-bottom: 32rpx;
}

.modal-field {
  margin-bottom: 28rpx;
}

.modal-field.half {
  flex: 1;
  margin-bottom: 0;
}

.modal-row {
  display: flex;
  gap: 24rpx;
  margin-bottom: 28rpx;
}

.modal-label {
  font-size: 26rpx;
  color: #666;
  display: block;
  margin-bottom: 12rpx;
}

.modal-input {
  height: 88rpx;
  background: #f5f7fa;
  border-radius: 12rpx;
  padding: 0 24rpx;
  font-size: 30rpx;
  color: #333;
  width: 100%;
}

.tag-row {
  display: flex;
  gap: 16rpx;
  margin-bottom: 36rpx;
}

.tag-chip {
  padding: 12rpx 32rpx;
  border-radius: 48rpx;
  border: 2rpx solid;
  font-size: 26rpx;
}

.modal-actions {
  display: flex;
  gap: 24rpx;
}

.modal-btn {
  flex: 1;
  height: 96rpx;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
}

.modal-btn.cancel {
  background: #f5f7fa;
  color: #666;
}

.modal-btn.confirm {
  background: #1a73e8;
  color: #fff;
  font-weight: 600;
}

.action-sheet {
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  padding: 32rpx 32rpx 80rpx;
  width: 100%;
}

.action-ev-info {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 0 32rpx;
  border-bottom: 1rpx solid #eee;
  margin-bottom: 16rpx;
}

.action-tag-dot {
  width: 24rpx;
  height: 24rpx;
  border-radius: 50%;
  flex-shrink: 0;
}

.action-ev-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1a1a1a;
  display: block;
}

.action-ev-time {
  font-size: 24rpx;
  color: #888;
  display: block;
  margin-top: 4rpx;
}

.action-items {
  display: flex;
}

.action-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 24rpx 0;
  font-size: 26rpx;
  color: #333;
  border-radius: 12rpx;
}

.action-item.danger {
  color: #e53935;
}

.action-icon {
  font-size: 40rpx;
}

.ai-drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  z-index: 300;
  display: flex;
  align-items: flex-end;
}

.ai-drawer {
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  width: 100%;
  height: 80vh;
  display: flex;
  flex-direction: column;
}

.ai-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx 32rpx 24rpx;
  border-bottom: 1rpx solid #eee;
}

.ai-drawer-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1a1a1a;
}

.ai-drawer-close {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  border-radius: 50%;
  font-size: 28rpx;
  color: #666;
}

.ai-messages {
  flex: 1;
  padding: 24rpx;
}

.ai-empty {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.ai-empty-text {
  font-size: 30rpx;
  color: #888;
  text-align: center;
  margin-bottom: 8rpx;
}

.ai-suggestion {
  background: #f5f7fa;
  border-radius: 48rpx;
  padding: 20rpx 28rpx;
  font-size: 28rpx;
  color: #1a73e8;
}

.ai-msg-row {
  display: flex;
  margin-bottom: 16rpx;
}

.ai-msg-row.user {
  justify-content: flex-end;
}

.ai-msg-row.assistant {
  justify-content: flex-start;
}

.ai-bubble {
  max-width: 80%;
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  font-size: 28rpx;
  line-height: 1.6;
}

.ai-msg-row.user .ai-bubble {
  background: #1a73e8;
  color: #fff;
  border-bottom-right-radius: 4rpx;
}

.ai-msg-row.assistant .ai-bubble {
  background: #f5f7fa;
  color: #333;
  border-bottom-left-radius: 4rpx;
}

.loading-bubble {
  letter-spacing: 4rpx;
  font-size: 32rpx;
}

.ai-bubble-text {
  white-space: pre-wrap;
}

.ai-input-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 24rpx;
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #eee;
  background: #fff;
}

.ai-input {
  flex: 1;
  height: 80rpx;
  background: #f5f7fa;
  border-radius: 40rpx;
  padding: 0 28rpx;
  font-size: 28rpx;
  color: #333;
}

.ai-send-btn {
  width: 80rpx;
  height: 80rpx;
  background: #1a73e8;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ai-send-icon {
  font-size: 36rpx;
  color: #fff;
  font-weight: 700;
}

.ph {
  color: #bbb;
}
</style>
