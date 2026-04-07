<template>
  <!-- Desktop layout -->
  <div v-if="!ui.isMobile" :class="['main-layout', { 'goals-open': goalsOpen, 'review-open': reviewOpen }]">
    <TopBar @open-profile="profilePanel?.show()" @open-links="linksPanel?.show()"
            @open-announcements="annPanel?.show()" :hasNewAnn="annPanel?.hasNew?.value" />
    <div class="main-body">
      <GoalsPanel @toggle="goalsOpen = !goalsOpen" @close="goalsOpen = false" />
      <div class="view-area">
        <ExecutionBar v-if="ui.view === 'day'" />
        <DayView v-if="ui.view === 'day'" />
        <WeekView v-else-if="ui.view === 'week'" />
        <MonthView v-else />
      </div>
      <ReviewPanel @toggle="reviewOpen = !reviewOpen" @close="reviewOpen = false" />
    </div>
    <EventPopover ref="popoverComp" />
    <ProfilePanel ref="profilePanel" @open-feedback="feedbackPanel?.show()" />
    <LinksPanel ref="linksPanel" />
  </div>

  <!-- Mobile layout -->
  <div v-else class="m-layout">
    <div class="m-header">
      <div class="m-header-top">
        <div class="m-brand">Day<span>Trace</span></div>
        <div class="m-header-actions">
          <button class="m-icon-btn" @click="ui.toggleTheme()">{{ ui.theme === 'dark' ? '☀️' : '🌙' }}</button>
          <button class="m-icon-btn" @click="linksPanel?.show()">🔗</button>
          <button class="m-icon-btn m-avatar-btn" @click="profilePanel?.show()">
            <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="m-avatar-img" alt="头像">
            <span v-else>👤</span>
          </button>
        </div>
      </div>
      <!-- Calendar sub-header: nav + view tabs -->
      <div v-if="ui.mobileTab === 'calendar'" class="m-cal-nav">
        <button class="m-nav-btn" @click="ui.prev()">‹</button>
        <span class="m-date-title" @click="ui.goToday()">{{ ui.title }}</span>
        <button class="m-nav-btn" @click="ui.next()">›</button>
        <div class="m-view-tabs">
          <button v-for="v in views" :key="v.key"
            :class="['m-view-tab', { active: ui.view === v.key }]"
            @click="ui.setView(v.key)">{{ v.label }}</button>
        </div>
      </div>
      <div v-else-if="ui.mobileTab === 'tasks'" class="m-sub-title">目标管理</div>
      <div v-else class="m-sub-title">晚间复盘</div>
    </div>

    <div class="m-body">
      <template v-if="ui.mobileTab === 'calendar'">
        <DayView v-if="ui.view === 'day'" />
        <WeekView v-else-if="ui.view === 'week'" />
        <MonthView v-else />
      </template>
      <div v-else-if="ui.mobileTab === 'tasks'" class="m-panel-wrap">
        <MobileGoals />
      </div>
      <div v-else class="m-panel-wrap">
        <MobileReview />
      </div>
    </div>

    <!-- Bottom tab bar -->
    <div class="m-tabbar">
      <button :class="['m-tab', { active: ui.mobileTab === 'calendar' }]" @click="ui.mobileTab = 'calendar'">
        <span class="m-tab-icon">📅</span><span class="m-tab-label">日程</span>
      </button>
      <button :class="['m-tab', { active: ui.mobileTab === 'tasks' }]" @click="ui.mobileTab = 'tasks'">
        <span class="m-tab-icon">🎯</span><span class="m-tab-label">任务</span>
      </button>
      <button :class="['m-tab', { active: ui.mobileTab === 'review' }]" @click="ui.mobileTab = 'review'">
        <span class="m-tab-icon">📊</span><span class="m-tab-label">复盘</span>
      </button>
    </div>

    <EventPopover ref="popoverComp" />
    <ProfilePanel ref="profilePanel" @open-feedback="feedbackPanel?.show()" />
    <LinksPanel ref="linksPanel" />
  </div>

  <!-- Global: reminder alert (works on both desktop & mobile) -->
  <ReminderAlert ref="reminderAlert" />
  <AnnouncementPanel ref="annPanel" />
  <FeedbackPanel ref="feedbackPanel" />
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useUiStore } from '../stores/ui'
import { useAuthStore } from '../stores/auth'
import { useSync } from '../composables/useSync'
import { useReminder } from '../composables/useReminder'
import { providePopover } from '../composables/usePopover'
import TopBar from '../components/TopBar.vue'
import DayView from '../components/DayView.vue'
import WeekView from '../components/WeekView.vue'
import MonthView from '../components/MonthView.vue'
import EventPopover from '../components/EventPopover.vue'
import GoalsPanel from '../components/GoalsPanel.vue'
import ProfilePanel from '../components/ProfilePanel.vue'
import ReviewPanel from '../components/ReviewPanel.vue'
import LinksPanel from '../components/LinksPanel.vue'
import MobileGoals from '../components/MobileGoals.vue'
import MobileReview from '../components/MobileReview.vue'
import ReminderAlert from '../components/ReminderAlert.vue'
import AnnouncementPanel from '../components/AnnouncementPanel.vue'
import FeedbackPanel from '../components/FeedbackPanel.vue'
import ExecutionBar from '../components/ExecutionBar.vue'

const ui = useUiStore()
const auth = useAuthStore()
const { pullFromServer, startAutoSync } = useSync()
const { startReminders, setAlertRef } = useReminder()

const popoverComp = ref(null)
const popoverRef = providePopover()
const goalsOpen = ref(false)
const profilePanel = ref(null)
const reviewOpen = ref(false)
const linksPanel = ref(null)
const reminderAlert = ref(null)
const annPanel = ref(null)
const feedbackPanel = ref(null)

const views = [
  { key: 'day', label: '天' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' }
]

let cleanupAutoSync = null
let cleanupReminders = null

onMounted(async () => {
  popoverRef.value = popoverComp.value
  setAlertRef(reminderAlert.value)
  auth.fetchProfile()
  await pullFromServer()
  cleanupAutoSync = startAutoSync()
  cleanupReminders = startReminders()
  annPanel.value?.checkNew()
})

onUnmounted(() => {
  if (cleanupAutoSync) cleanupAutoSync()
  if (cleanupReminders) cleanupReminders()
})
</script>

<style scoped>
/* Desktop */
.main-layout { height: 100%; display: flex; flex-direction: column; }
.main-body { flex: 1; display: flex; overflow: hidden; position: relative; }
.view-area { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

/* Mobile */
.m-layout {
  height: 100%; display: flex; flex-direction: column;
  overflow: hidden;
}
.m-header {
  flex-shrink: 0; background: var(--bg);
  border-bottom: 1px solid var(--border-light);
  padding: 0 12px; padding-top: env(safe-area-inset-top, 0);
}
.m-header-top {
  display: flex; align-items: center; justify-content: space-between;
  height: 44px;
}
.m-brand { font-size: 16px; font-weight: 700; color: var(--text); }
.m-brand span { color: var(--blue); }
.m-header-actions { display: flex; gap: 2px; }
.m-icon-btn {
  width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; border-radius: var(--radius);
  font-size: 16px; cursor: pointer;
}
.m-icon-btn:active { background: var(--bg-hover); }
.m-avatar-btn { overflow: hidden; border-radius: 50%; padding: 0; }
.m-avatar-img { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; }

.m-cal-nav {
  display: flex; align-items: center; gap: 6px;
  padding-bottom: 8px;
}
.m-nav-btn {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border-light); background: var(--bg); border-radius: var(--radius);
  font-size: 16px; color: var(--text-secondary); cursor: pointer;
}
.m-nav-btn:active { background: var(--bg-hover); }
.m-date-title {
  font-size: 14px; font-weight: 600; color: var(--text);
  flex: 1; text-align: center; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.m-view-tabs {
  display: flex; gap: 2px; background: var(--bg-hover); border-radius: 6px; padding: 2px;
  flex-shrink: 0;
}
.m-view-tab {
  padding: 4px 12px; border: none; background: transparent;
  border-radius: 5px; font-size: 12px; font-weight: 500;
  color: var(--text-secondary); cursor: pointer;
}
.m-view-tab.active {
  background: var(--bg); color: var(--text); box-shadow: var(--shadow-sm);
}

.m-sub-title {
  font-size: 15px; font-weight: 600; color: var(--text);
  padding-bottom: 10px;
}

.m-body {
  flex: 1; overflow-y: auto; overflow-x: hidden;
}
.m-panel-wrap {
  height: 100%; overflow-y: auto; padding: 14px;
}

/* Bottom tab bar */
.m-tabbar {
  flex-shrink: 0; display: flex;
  border-top: 1px solid var(--border-light);
  background: var(--bg);
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.m-tab {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  gap: 2px; padding: 6px 0 4px; border: none; background: transparent;
  cursor: pointer; color: var(--text-light); transition: color .15s;
}
.m-tab.active { color: var(--blue); }
.m-tab-icon { font-size: 18px; line-height: 1; }
.m-tab-label { font-size: 10px; font-weight: 500; }
</style>