<template>
  <view class="page">
    <view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="header-inner">
        <text class="header-title">我的</text>
      </view>
    </view>

    <scroll-view class="content-scroll" scroll-y :style="{ top: headerHeight + 'px' }">
      <view class="profile-card">
        <view class="avatar-wrap">
          <image v-if="auth.avatarUrl" :src="auth.avatarUrl" class="avatar" mode="aspectFill" />
          <view v-else class="avatar-placeholder">
            <text class="avatar-letter">{{ displayLetter }}</text>
          </view>
        </view>
        <view class="user-info">
          <text class="user-name">{{ auth.displayName }}</text>
          <text class="user-sub">@{{ auth.username }}</text>
        </view>
        <view class="sync-badge" :class="currentSyncStatus">
          <text class="sync-text">{{ syncLabel }}</text>
        </view>
      </view>

      <view class="section-label">连接设置</view>
      <view class="settings-card">
        <view class="setting-item" style="flex-direction: column; align-items: flex-start;">
          <text class="setting-label">服务器地址</text>
          <input
            class="server-input"
            v-model="apiBase"
            placeholder="如 http://192.168.1.100:5000"
            placeholder-class="ph"
            @blur="saveApiBase"
          />
        </view>
        <view class="setting-divider" />
        <view class="setting-item" @tap="syncNow">
          <text class="setting-label">立即同步</text>
          <text class="setting-arrow">{{ syncing ? '同步中...' : '↻' }}</text>
        </view>
      </view>

      <view class="section-label">外观</view>
      <view class="settings-card">
        <view class="setting-item" @tap="toggleTheme">
          <text class="setting-label">深色模式</text>
          <view class="toggle" :class="{ on: isDark }">
            <view class="toggle-thumb" />
          </view>
        </view>
      </view>

      <view class="section-label">数据概览</view>
      <view class="stats-grid">
        <view class="stats-item">
          <text class="stats-num">{{ totalEvents }}</text>
          <text class="stats-desc">日程总数</text>
        </view>
        <view class="stats-item">
          <text class="stats-num">{{ totalTasks }}</text>
          <text class="stats-desc">任务总数</text>
        </view>
        <view class="stats-item">
          <text class="stats-num">{{ completedTasks }}</text>
          <text class="stats-desc">已完成任务</text>
        </view>
        <view class="stats-item">
          <text class="stats-num">{{ streakDays }}</text>
          <text class="stats-desc">连续记录天</text>
        </view>
      </view>

      <view class="section-label">账号</view>
      <view class="settings-card">
        <view class="setting-item danger" @tap="doLogout">
          <text class="setting-label danger">退出登录</text>
          <text class="setting-arrow">›</text>
        </view>
      </view>

      <view class="version-info">
        <text class="version-text">dayTrace v1.0.0</text>
      </view>

      <view style="height: 120rpx;" />
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useEventStore } from '../../stores/events'
import { useTaskStore } from '../../stores/tasks'
import { useUiStore } from '../../stores/ui'
import { useSync } from '../../composables/useSync'
import { setApiBase, getApiBase } from '../../utils/api'

const auth = useAuthStore()
const eventStore = useEventStore()
const taskStore = useTaskStore()
const uiStore = useUiStore()
const { syncStatus, pullFromServer } = useSync()

const statusBarHeight = ref(20)
const headerHeight = ref(88)
const apiBase = ref('')
const syncing = ref(false)

onMounted(() => {
  try {
    const sysInfo = uni.getSystemInfoSync()
    statusBarHeight.value = sysInfo.statusBarHeight || 20
    headerHeight.value = statusBarHeight.value + 56
  } catch {}
  apiBase.value = getApiBase()
  auth.fetchProfile()
})

const displayLetter = computed(() => {
  const name = auth.displayName || auth.username || '?'
  return name[0].toUpperCase()
})

const isDark = computed(() => uiStore.theme === 'dark')

function toggleTheme() {
  uiStore.toggleTheme()
}

function saveApiBase() {
  setApiBase(apiBase.value)
  uni.showToast({ title: '服务器地址已保存', icon: 'none', duration: 1500 })
}

async function syncNow() {
  if (syncing.value) return
  syncing.value = true
  await pullFromServer()
  syncing.value = false
  uni.showToast({ title: '同步完成', icon: 'success', duration: 1500 })
}

// syncStatus is a readonly ref, read its value for reactive use in template
const currentSyncStatus = computed(() => syncStatus.value)

const syncLabel = computed(() => {
  const s = syncStatus.value
  if (s === 'syncing') return '同步中'
  if (s === 'success') return '已同步'
  if (s === 'error') return '同步失败'
  return '已连接'
})

const totalEvents = computed(() => eventStore.events.length)
const totalTasks = computed(() => taskStore.tasks.length)
const completedTasks = computed(() => taskStore.tasks.filter((t: any) => t.completed).length)

const streakDays = computed(() => {
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 60; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    if (eventStore.eventsForDate(d).length > 0) {
      streak++
    } else if (i > 0) {
      break
    }
  }
  return streak
})

function doLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出登录吗？',
    success(res) {
      if (res.confirm) {
        auth.logout()
      }
    }
  })
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
  padding: 0 32rpx;
}

.header-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #1a1a1a;
}

.content-scroll {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
}

.profile-card {
  margin: 24rpx;
  background: linear-gradient(135deg, #1a73e8, #0d47a1);
  border-radius: 20rpx;
  padding: 40rpx;
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.avatar-wrap {
  flex-shrink: 0;
}

.avatar {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
}

.avatar-placeholder {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-letter {
  font-size: 48rpx;
  color: #fff;
  font-weight: 700;
}

.user-info {
  flex: 1;
}

.user-name {
  font-size: 36rpx;
  font-weight: 700;
  color: #fff;
  display: block;
}

.user-sub {
  font-size: 26rpx;
  color: rgba(255,255,255,0.7);
  display: block;
  margin-top: 6rpx;
}

.sync-badge {
  padding: 8rpx 20rpx;
  border-radius: 24rpx;
  background: rgba(255,255,255,0.2);
}

.sync-badge.success .sync-text { color: #a8f0c4; }
.sync-badge.error .sync-text { color: #ffb3b3; }
.sync-badge.syncing .sync-text { color: #ffe082; }

.sync-text {
  font-size: 22rpx;
  color: rgba(255,255,255,0.8);
}

.section-label {
  font-size: 24rpx;
  font-weight: 600;
  color: #888;
  padding: 24rpx 32rpx 8rpx;
  letter-spacing: 1rpx;
}

.settings-card {
  background: #fff;
  border-radius: 16rpx;
  margin: 0 24rpx;
  overflow: hidden;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx;
  min-height: 96rpx;
}

.setting-item:active {
  background: #f5f7fa;
}

.setting-label {
  font-size: 30rpx;
  color: #1a1a1a;
}

.setting-label.danger {
  color: #e53935;
}

.setting-arrow {
  font-size: 32rpx;
  color: #aaa;
}

.setting-divider {
  height: 1rpx;
  background: #f0f0f0;
  margin: 0 32rpx;
}

.server-input {
  width: 100%;
  height: 72rpx;
  background: #f5f7fa;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 26rpx;
  color: #333;
  margin-top: 12rpx;
}

.toggle {
  width: 100rpx;
  height: 56rpx;
  border-radius: 28rpx;
  background: #ddd;
  position: relative;
  transition: background 0.2s;
}

.toggle.on {
  background: #1a73e8;
}

.toggle-thumb {
  position: absolute;
  top: 6rpx;
  left: 6rpx;
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2rpx 6rpx rgba(0,0,0,0.2);
  transition: left 0.2s;
}

.toggle.on .toggle-thumb {
  left: 50rpx;
}

.stats-grid {
  display: flex;
  flex-wrap: wrap;
  margin: 0 24rpx;
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
}

.stats-item {
  width: 50%;
  padding: 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-right: 1rpx solid #f0f0f0;
  border-bottom: 1rpx solid #f0f0f0;
}

.stats-item:nth-child(even) {
  border-right: none;
}

.stats-item:nth-child(3),
.stats-item:nth-child(4) {
  border-bottom: none;
}

.stats-num {
  font-size: 56rpx;
  font-weight: 700;
  color: #1a73e8;
}

.stats-desc {
  font-size: 24rpx;
  color: #888;
  margin-top: 8rpx;
  text-align: center;
}

.version-info {
  padding: 32rpx;
  text-align: center;
}

.version-text {
  font-size: 24rpx;
  color: #ccc;
}

.ph {
  color: #bbb;
}

.setting-item.danger:active {
  background: #fff5f5;
}
</style>
