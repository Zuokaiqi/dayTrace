<template>
  <view class="page">
    <view class="logo-area">
      <text class="logo-text">dayTrace</text>
      <text class="logo-sub">记录每一天</text>
    </view>

    <view class="tab-row">
      <view
        class="tab-item"
        :class="{ active: mode === 'login' }"
        @tap="mode = 'login'"
      >
        <text>登录</text>
      </view>
      <view
        class="tab-item"
        :class="{ active: mode === 'register' }"
        @tap="mode = 'register'"
      >
        <text>注册</text>
      </view>
    </view>

    <view class="form-card">
      <view class="field">
        <text class="field-label">服务器地址</text>
        <input
          class="field-input"
          v-model="apiBase"
          placeholder="如 http://192.168.1.100:5000"
          placeholder-class="ph"
          @blur="saveApiBase"
        />
      </view>

      <view class="field">
        <text class="field-label">用户名</text>
        <input
          class="field-input"
          v-model="username"
          placeholder="输入用户名"
          placeholder-class="ph"
        />
      </view>

      <view class="field">
        <text class="field-label">密码</text>
        <input
          class="field-input"
          v-model="password"
          placeholder="输入密码"
          placeholder-class="ph"
          password
        />
      </view>

      <text v-if="error" class="error-msg">{{ error }}</text>

      <view
        class="submit-btn"
        :class="{ loading: loading }"
        @tap="submit"
      >
        <text class="submit-text">{{ loading ? '请稍候...' : (mode === 'login' ? '登录' : '注册') }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { setApiBase, getApiBase } from '../../utils/api'

const auth = useAuthStore()
const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const apiBase = ref('')
const error = ref('')
const loading = ref(false)

onMounted(() => {
  apiBase.value = getApiBase()
  if (auth.isLoggedIn) {
    uni.reLaunch({ url: '/pages/day/day' })
  }
})

function saveApiBase() {
  setApiBase(apiBase.value)
}

async function submit() {
  if (loading.value) return
  error.value = ''
  if (!username.value.trim() || !password.value.trim()) {
    error.value = '请填写用户名和密码'
    return
  }
  saveApiBase()
  loading.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(username.value.trim(), password.value)
    } else {
      await auth.register(username.value.trim(), password.value)
    }
    uni.reLaunch({ url: '/pages/day/day' })
  } catch (e: any) {
    error.value = e.message || '操作失败，请检查服务器地址'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: linear-gradient(135deg, #e8f0fe 0%, #f5f7fa 60%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 48rpx 60rpx;
}

.logo-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 72rpx;
}

.logo-text {
  font-size: 72rpx;
  font-weight: 700;
  color: #1a73e8;
  letter-spacing: 2rpx;
}

.logo-sub {
  font-size: 28rpx;
  color: #888;
  margin-top: 8rpx;
}

.tab-row {
  display: flex;
  background: #e8eaed;
  border-radius: 50rpx;
  padding: 6rpx;
  margin-bottom: 40rpx;
  width: 100%;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 20rpx 0;
  border-radius: 44rpx;
  font-size: 30rpx;
  color: #666;
}

.tab-item.active {
  background: #fff;
  color: #1a73e8;
  font-weight: 600;
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.08);
}

.form-card {
  background: #fff;
  border-radius: 24rpx;
  padding: 40rpx;
  width: 100%;
  box-shadow: 0 4rpx 24rpx rgba(0,0,0,0.06);
}

.field {
  margin-bottom: 32rpx;
}

.field-label {
  font-size: 26rpx;
  color: #666;
  margin-bottom: 12rpx;
  display: block;
}

.field-input {
  width: 100%;
  height: 96rpx;
  background: #f5f7fa;
  border-radius: 12rpx;
  padding: 0 28rpx;
  font-size: 30rpx;
  color: #333;
  border: 2rpx solid transparent;
}

.ph {
  color: #bbb;
}

.error-msg {
  color: #e53935;
  font-size: 26rpx;
  margin-bottom: 24rpx;
  display: block;
}

.submit-btn {
  height: 96rpx;
  background: #1a73e8;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 8rpx;
}

.submit-btn.loading {
  background: #8ab4f8;
}

.submit-text {
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;
}
</style>
