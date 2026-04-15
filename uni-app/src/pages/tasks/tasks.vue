<template>
  <view class="page">
    <view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="header-inner">
        <text class="header-title">任务</text>
        <view class="header-add" @tap="openCreate">
          <text class="header-add-icon">＋</text>
        </view>
      </view>
    </view>

    <view class="filter-row" :style="{ top: filterTop + 'px' }">
      <view
        v-for="f in filters"
        :key="f.key"
        class="filter-chip"
        :class="{ active: activeFilter === f.key }"
        @tap="activeFilter = f.key"
      >
        <text>{{ f.label }}</text>
      </view>
    </view>

    <scroll-view class="list-scroll" scroll-y :style="{ top: listTop + 'px' }">
      <view v-if="filteredGroups.length === 0" class="empty-state">
        <text class="empty-icon">✓</text>
        <text class="empty-text">暂无任务</text>
      </view>

      <view v-for="group in filteredGroups" :key="group.label">
        <view class="group-header">
          <text class="group-label">{{ group.label }}</text>
          <text class="group-count">{{ group.tasks.length }}</text>
        </view>

        <view
          v-for="task in group.tasks"
          :key="task.id"
          class="task-card"
          :class="{ completed: task.completed }"
        >
          <view
            class="task-check"
            :style="{ borderColor: tagColor(task.tag), background: task.completed ? tagColor(task.tag) : 'transparent' }"
            @tap="toggleTask(task)"
          >
            <text v-if="task.completed" class="check-icon">✓</text>
          </view>

          <view class="task-body" @longpress="onTaskLongPress(task)">
            <text class="task-title" :class="{ done: task.completed }">{{ task.title }}</text>
            <view class="task-meta">
              <view class="task-tag-chip" :style="{ background: tagColor(task.tag) + '22', color: tagColor(task.tag) }">
                <text>{{ tagName(task.tag) }}</text>
              </view>
              <text v-if="task.deadline" class="task-deadline" :class="{ overdue: isOverdue(task.deadline) }">
                {{ formatDeadline(task.deadline) }}
              </text>
            </view>
          </view>

          <view class="task-schedule-btn" @tap="scheduleTask(task)">
            <text class="task-schedule-icon">📅</text>
          </view>
        </view>
      </view>

      <view style="height: 160rpx;" />
    </scroll-view>

    <view v-if="showCreate" class="modal-mask" @tap.self="showCreate = false">
      <view class="modal-sheet">
        <text class="modal-title">新建任务</text>
        <view class="modal-field">
          <text class="modal-label">任务标题</text>
          <input
            class="modal-input"
            v-model="form.title"
            placeholder="输入任务标题"
            placeholder-class="ph"
          />
        </view>
        <view class="modal-field">
          <text class="modal-label">截止日期（可选）</text>
          <input
            class="modal-input"
            v-model="form.deadline"
            placeholder="YYYY-MM-DD"
            placeholder-class="ph"
          />
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
          <view class="modal-btn confirm" @tap="createTask"><text>创建</text></view>
        </view>
      </view>
    </view>

    <view v-if="selectedTask" class="modal-mask" @tap.self="selectedTask = null">
      <view class="action-sheet">
        <view class="action-task-info">
          <view class="action-dot" :style="{ background: tagColor(selectedTask.tag) }" />
          <text class="action-task-title">{{ selectedTask.title }}</text>
        </view>
        <view class="action-items">
          <view class="action-item" @tap="scheduleTask(selectedTask); selectedTask = null">
            <text class="action-icon">📅</text>
            <text>安排到日程</text>
          </view>
          <view class="action-item danger" @tap="deleteTask(selectedTask)">
            <text class="action-icon">🗑️</text>
            <text>删除</text>
          </view>
          <view class="action-item" @tap="selectedTask = null">
            <text class="action-icon">✕</text>
            <text>关闭</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTaskStore } from '../../stores/tasks'
import { dateKey, TAG_COLORS, TAG_NAMES } from '../../utils/time'

const taskStore = useTaskStore()

const statusBarHeight = ref(20)
const filterTop = ref(76)
const listTop = ref(140)

onMounted(() => {
  try {
    const sysInfo = uni.getSystemInfoSync()
    statusBarHeight.value = sysInfo.statusBarHeight || 20
    filterTop.value = statusBarHeight.value + 56
    listTop.value = statusBarHeight.value + 56 + 80
  } catch {}
})

const activeFilter = ref('all')
const filters = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '未完成' },
  { key: 'done', label: '已完成' }
]

function tagColor(tag: string): string {
  return TAG_COLORS[tag] || '#1a73e8'
}
function tagName(tag: string): string {
  return TAG_NAMES[tag] || tag
}

const today = ref(dateKey(new Date()))

onShow(() => {
  today.value = dateKey(new Date())
})

function getWeekEnd(): string {
  const d = new Date()
  d.setDate(d.getDate() + (7 - d.getDay()))
  return dateKey(d)
}

function isOverdue(deadline: string): boolean {
  return deadline < today.value
}

function formatDeadline(deadline: string): string {
  if (deadline === today.value) return '今天'
  if (deadline < today.value) return `已过期 ${deadline}`
  const d = new Date(deadline + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const filteredGroups = computed(() => {
  let list = taskStore.tasks
  if (activeFilter.value === 'active') list = list.filter((t: any) => !t.completed)
  if (activeFilter.value === 'done') list = list.filter((t: any) => t.completed)

  const groups: { label: string; tasks: any[] }[] = []
  const weekEnd = getWeekEnd()

  const todayTasks = list.filter((t: any) => t.deadline === today.value)
  const weekTasks = list.filter((t: any) => t.deadline && t.deadline > today.value && t.deadline <= weekEnd)
  const futureTasks = list.filter((t: any) => t.deadline && t.deadline > weekEnd)
  const overdueTasks = list.filter((t: any) => t.deadline && t.deadline < today.value && !t.completed)
  const noDateTasks = list.filter((t: any) => !t.deadline)

  if (overdueTasks.length) groups.push({ label: '已过期', tasks: overdueTasks })
  if (todayTasks.length) groups.push({ label: '今天', tasks: todayTasks })
  if (weekTasks.length) groups.push({ label: '本周', tasks: weekTasks })
  if (futureTasks.length) groups.push({ label: '未来', tasks: futureTasks })
  if (noDateTasks.length) groups.push({ label: '无截止日', tasks: noDateTasks })

  return groups
})

function toggleTask(task: any) {
  const newDone = !task.completed
  task.completed = newDone
  if (task.subtasks) task.subtasks.forEach((s: any) => { s.done = newDone })
  taskStore.saveTasks()
  const wt = taskStore.weeklyTasks.find((w: any) => w.frozenTaskId === task.id)
  if (wt) { wt.done = newDone; taskStore.saveGoals() }
}

const selectedTask = ref<any>(null)
function onTaskLongPress(task: any) {
  selectedTask.value = task
}

function scheduleTask(task: any) {
  uni.setStorageSync('dt_pending_schedule', JSON.stringify({ title: task.title, tag: task.tag }))
  uni.switchTab({ url: '/pages/day/day' })
}

function deleteTask(task: any) {
  uni.showModal({
    title: '确认删除',
    content: `删除任务「${task.title}」？`,
    success(res) {
      if (res.confirm) {
        taskStore.tasks = taskStore.tasks.filter((t: any) => t.id !== task.id)
        const wt = taskStore.weeklyTasks.find((w: any) => w.frozenTaskId === task.id)
        if (wt) {
          taskStore.weeklyTasks = taskStore.weeklyTasks.filter((w: any) => w.id !== wt.id)
          taskStore.saveGoals()
        }
        taskStore.saveTasks()
        selectedTask.value = null
        uni.showToast({ title: '已删除', icon: 'success', duration: 1500 })
      }
    }
  })
}

const showCreate = ref(false)
const form = ref({ title: '', deadline: '', tag: 'work' })
const tags = [
  { key: 'work', label: '工作', color: '#1a73e8' },
  { key: 'personal', label: '生活', color: '#34a853' },
  { key: 'admin', label: '事务', color: '#fb8c00' }
]

function openCreate() {
  form.value = { title: '', deadline: '', tag: 'work' }
  showCreate.value = true
}

function createTask() {
  if (!form.value.title.trim()) {
    uni.showToast({ title: '请输入任务标题', icon: 'none' })
    return
  }
  const frozenId = taskStore.taskNextId++
  taskStore.tasks.push({
    id: frozenId,
    title: form.value.title.trim(),
    tag: form.value.tag,
    completed: false,
    subtasks: [],
    deadline: form.value.deadline || null,
    createdAt: new Date().toISOString()
  })
  taskStore.weeklyTasks.push({
    id: taskStore.wNextId++,
    title: form.value.title.trim(),
    tag: form.value.tag,
    monthGoalId: null, month: null, weekStart: null,
    startDate: null, deadline: form.value.deadline || null,
    done: false, frozenTaskId: frozenId
  })
  taskStore.saveTasks()
  taskStore.saveGoals()
  showCreate.value = false
  uni.showToast({ title: '已创建', icon: 'success', duration: 1500 })
}
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

.header-inner {
  height: 112rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32rpx;
}

.header-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #1a1a1a;
}

.header-add {
  width: 72rpx;
  height: 72rpx;
  background: #1a73e8;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-add-icon {
  font-size: 40rpx;
  color: #fff;
  line-height: 1;
}

.filter-row {
  position: fixed;
  left: 0;
  right: 0;
  background: #fff;
  display: flex;
  gap: 16rpx;
  padding: 16rpx 32rpx;
  border-bottom: 1rpx solid #eee;
  z-index: 99;
}

.filter-chip {
  padding: 12rpx 28rpx;
  border-radius: 40rpx;
  font-size: 26rpx;
  color: #666;
  background: #f5f7fa;
}

.filter-chip.active {
  background: #e8f0fe;
  color: #1a73e8;
  font-weight: 600;
}

.list-scroll {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;
}

.empty-icon {
  font-size: 96rpx;
  color: #ddd;
  margin-bottom: 24rpx;
}

.empty-text {
  font-size: 30rpx;
  color: #bbb;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 24rpx 32rpx 12rpx;
}

.group-label {
  font-size: 24rpx;
  font-weight: 600;
  color: #888;
  letter-spacing: 1rpx;
}

.group-count {
  font-size: 22rpx;
  color: #bbb;
  background: #f0f0f0;
  border-radius: 20rpx;
  padding: 2rpx 14rpx;
}

.task-card {
  margin: 0 24rpx 16rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  display: flex;
  align-items: center;
  gap: 20rpx;
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.04);
}

.task-card.completed {
  opacity: 0.6;
}

.task-check {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  border: 3rpx solid;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.check-icon {
  font-size: 28rpx;
  color: #fff;
}

.task-body {
  flex: 1;
  min-width: 0;
}

.task-title {
  font-size: 30rpx;
  color: #1a1a1a;
  display: block;
  margin-bottom: 8rpx;
}

.task-title.done {
  text-decoration: line-through;
  color: #aaa;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.task-tag-chip {
  font-size: 22rpx;
  padding: 4rpx 16rpx;
  border-radius: 20rpx;
}

.task-deadline {
  font-size: 24rpx;
  color: #888;
}

.task-deadline.overdue {
  color: #e53935;
}

.task-schedule-btn {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  border-radius: 50%;
  flex-shrink: 0;
}

.task-schedule-icon {
  font-size: 32rpx;
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

.action-task-info {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid #eee;
  margin-bottom: 16rpx;
}

.action-dot {
  width: 20rpx;
  height: 20rpx;
  border-radius: 50%;
  flex-shrink: 0;
}

.action-task-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1a1a1a;
}

.action-items {
  display: flex;
  gap: 0;
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

.ph {
  color: #bbb;
}
</style>
