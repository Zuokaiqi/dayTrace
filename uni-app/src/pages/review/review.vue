<template>
  <view class="page">
    <view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-row">
        <view class="nav-btn" @tap="prevDay">
          <text class="nav-arrow">‹</text>
        </view>
        <view class="date-center" @tap="goToday">
          <text class="date-main">{{ dateDisplay }}</text>
          <text class="date-sub">{{ isToday ? '今天' : '' }}</text>
        </view>
        <view class="nav-btn" @tap="nextDay">
          <text class="nav-arrow">›</text>
        </view>
      </view>
    </view>

    <scroll-view class="content-scroll" scroll-y :style="{ top: headerHeight + 'px' }">
      <view class="section-card">
        <text class="section-title">日程完成</text>
        <view class="stat-row">
          <view class="stat-item">
            <text class="stat-num">{{ totalEvents }}</text>
            <text class="stat-label">总计划</text>
          </view>
          <view class="stat-divider" />
          <view class="stat-item">
            <text class="stat-num" style="color: #34a853;">{{ completedEvents }}</text>
            <text class="stat-label">已完成</text>
          </view>
          <view class="stat-divider" />
          <view class="stat-item">
            <text class="stat-num" style="color: #fb8c00;">{{ pendingEvents }}</text>
            <text class="stat-label">未完成</text>
          </view>
        </view>
        <view class="progress-bar">
          <view
            class="progress-fill"
            :style="{ width: (totalEvents ? completedEvents / totalEvents * 100 : 0) + '%' }"
          />
        </view>
      </view>

      <view class="section-card" v-if="dayEvents.length">
        <text class="section-title">{{ sectionDateLabel }}日程</text>
        <view v-for="ev in dayEvents" :key="ev.id" class="ev-row">
          <view class="ev-tag-line" :style="{ background: tagColor(ev.tag) }" />
          <view class="ev-content">
            <text class="ev-title">{{ ev.title }}</text>
            <text v-if="ev.plan" class="ev-time">计划 {{ ev.plan.start }}–{{ ev.plan.end }}</text>
            <text v-if="ev.actual" class="ev-time actual">实际 {{ ev.actual.start }}–{{ ev.actual.end }}</text>
          </view>
          <view class="ev-status">
            <text v-if="ev.actual" class="ev-done">✓</text>
            <text v-else class="ev-pending">○</text>
          </view>
        </view>
      </view>

      <view class="section-card">
        <text class="section-title">今日评分</text>
        <view class="score-row">
          <view
            v-for="n in 5"
            :key="n"
            class="score-star"
            :class="{ selected: score >= n }"
            @tap="setScore(n)"
          >
            <text class="star-icon">★</text>
          </view>
        </view>
        <text class="score-desc">{{ scoreDesc }}</text>
      </view>

      <view class="section-card">
        <text class="section-title">复盘笔记</text>
        <textarea
          class="review-textarea"
          v-model="reflection"
          placeholder="记录今天的收获、不足或计划..."
          placeholder-class="ph"
          auto-height
          @blur="saveReflection"
        />
        <view class="save-hint" v-if="saved">
          <text class="save-hint-text">已自动保存</text>
        </view>
      </view>

      <view class="section-card" v-if="todayTasks.length">
        <text class="section-title">{{ sectionDateLabel }}任务</text>
        <view v-for="task in todayTasks" :key="task.id" class="task-row">
          <view class="task-check-mini" :style="{ background: task.completed ? tagColor(task.tag) : 'transparent', borderColor: tagColor(task.tag) }">
            <text v-if="task.completed" style="color: #fff; font-size: 20rpx;">✓</text>
          </view>
          <text class="task-title-mini" :class="{ done: task.completed }">{{ task.title }}</text>
        </view>
      </view>

      <view style="height: 120rpx;" />
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useEventStore } from '../../stores/events'
import { useTaskStore } from '../../stores/tasks'
import { useUiStore } from '../../stores/ui'
import { useSync } from '../../composables/useSync'
import { dateKey, TAG_COLORS, WD } from '../../utils/time'

const eventStore = useEventStore()
const taskStore = useTaskStore()
const uiStore = useUiStore()
const { notifyReflectionSaved } = useSync()

const statusBarHeight = ref(20)
const headerHeight = ref(88)

onMounted(() => {
  try {
    const sysInfo = uni.getSystemInfoSync()
    statusBarHeight.value = sysInfo.statusBarHeight || 20
    headerHeight.value = statusBarHeight.value + 56
  } catch {}
  loadReflection()
})

const isToday = computed(() => {
  const now = new Date()
  return dateKey(uiStore.curDate) === dateKey(now)
})

const dateDisplay = computed(() => {
  const d = uiStore.curDate
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${WD[d.getDay()]}`
})

function prevDay() {
  const d = new Date(uiStore.curDate)
  d.setDate(d.getDate() - 1)
  uiStore.goToDate(d)
}
function nextDay() {
  const d = new Date(uiStore.curDate)
  d.setDate(d.getDate() + 1)
  uiStore.goToDate(d)
}
function goToday() { uiStore.goToday() }

const sectionDateLabel = computed(() => {
  if (isToday.value) return '今日'
  const d = uiStore.curDate
  return `${d.getMonth() + 1}月${d.getDate()}日`
})

const dayEvents = computed(() => eventStore.eventsForDate(uiStore.curDate))
const totalEvents = computed(() => dayEvents.value.length)
const completedEvents = computed(() => dayEvents.value.filter((e: any) => e.actual).length)
const pendingEvents = computed(() => totalEvents.value - completedEvents.value)

function tagColor(tag: string): string {
  return TAG_COLORS[tag] || '#1a73e8'
}

const todayTasks = computed(() => {
  const dk = dateKey(uiStore.curDate)
  return taskStore.tasks.filter((t: any) => t.deadline === dk)
})

const score = ref(0)
const scoreDescs = ['', '很糟糕', '一般', '还不错', '很好', '完美']
const scoreDesc = computed(() => score.value ? scoreDescs[score.value] : '点击评分')

function setScore(n: number) {
  score.value = n
  saveReflection()
}

const reflection = ref('')
const saved = ref(false)
let saveTimer: ReturnType<typeof setTimeout> | null = null

function reflectionKey(date: Date): string {
  return 'dt_refl_' + dateKey(date)
}

function loadReflection() {
  const key = reflectionKey(uiStore.curDate)
  try {
    const raw = uni.getStorageSync(key)
    if (raw) {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw
      reflection.value = data.text || ''
      score.value = data.score || 0
    } else {
      reflection.value = ''
      score.value = 0
    }
  } catch {
    reflection.value = ''
    score.value = 0
  }
}

function saveReflection() {
  const key = reflectionKey(uiStore.curDate)
  const dateStr = dateKey(uiStore.curDate)
  const payload = { text: reflection.value, score: score.value, date: dateStr }
  uni.setStorageSync(key, JSON.stringify(payload))
  saved.value = true
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saved.value = false }, 2000)
  notifyReflectionSaved(dateStr, payload)
}

watch(() => uiStore.curDate, () => {
  loadReflection()
})
</script>

<style scoped>
.page {
  height: 100vh;
  background: #f5f7fa;
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
  background: #f5f7fa;
  border-radius: 50%;
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
  font-size: 30rpx;
  font-weight: 700;
  color: #1a1a1a;
}

.date-sub {
  font-size: 22rpx;
  color: #1a73e8;
  margin-top: 2rpx;
  min-height: 28rpx;
}

.content-scroll {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
}

.section-card {
  background: #fff;
  border-radius: 16rpx;
  margin: 24rpx 24rpx 0;
  padding: 32rpx;
}

.section-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #333;
  display: block;
  margin-bottom: 24rpx;
}

.stat-row {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.stat-num {
  font-size: 56rpx;
  font-weight: 700;
  color: #1a1a1a;
}

.stat-label {
  font-size: 24rpx;
  color: #888;
}

.stat-divider {
  width: 1rpx;
  height: 60rpx;
  background: #eee;
}

.progress-bar {
  height: 8rpx;
  background: #eee;
  border-radius: 4rpx;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #1a73e8, #34a853);
  border-radius: 4rpx;
  transition: width 0.4s ease;
}

.ev-row {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.ev-row:last-child {
  border-bottom: none;
}

.ev-tag-line {
  width: 6rpx;
  height: 48rpx;
  border-radius: 3rpx;
  flex-shrink: 0;
  margin-top: 4rpx;
}

.ev-content {
  flex: 1;
}

.ev-title {
  font-size: 28rpx;
  color: #1a1a1a;
  display: block;
}

.ev-time {
  font-size: 24rpx;
  color: #888;
  display: block;
  margin-top: 4rpx;
}

.ev-time.actual {
  color: #34a853;
}

.ev-status {
  flex-shrink: 0;
}

.ev-done {
  font-size: 32rpx;
  color: #34a853;
}

.ev-pending {
  font-size: 32rpx;
  color: #ddd;
}

.score-row {
  display: flex;
  gap: 20rpx;
  margin-bottom: 16rpx;
}

.score-star {
  width: 80rpx;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.star-icon {
  font-size: 60rpx;
  color: #ddd;
}

.score-star.selected .star-icon {
  color: #fbbc04;
}

.score-desc {
  font-size: 26rpx;
  color: #888;
  display: block;
}

.review-textarea {
  width: 100%;
  min-height: 200rpx;
  background: #f5f7fa;
  border-radius: 12rpx;
  padding: 24rpx;
  font-size: 28rpx;
  color: #333;
  line-height: 1.8;
}

.save-hint {
  margin-top: 12rpx;
  text-align: right;
}

.save-hint-text {
  font-size: 22rpx;
  color: #34a853;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.task-row:last-child {
  border-bottom: none;
}

.task-check-mini {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  border: 2rpx solid;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.task-title-mini {
  font-size: 28rpx;
  color: #333;
}

.task-title-mini.done {
  text-decoration: line-through;
  color: #aaa;
}

.ph {
  color: #bbb;
}
</style>
