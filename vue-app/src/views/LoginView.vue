<template>
  <div class="login-page">
    <div class="login-card">
      <div class="logo">Day<span>Trace</span></div>
      <div class="tabs">
        <div :class="['tab', { active: mode === 'login' }]" @click="mode = 'login'">登录</div>
        <div :class="['tab', { active: mode === 'register' }]" @click="mode = 'register'">注册</div>
      </div>
      <form @submit.prevent="handleSubmit">
        <div class="field">
          <label>用户名</label>
          <input v-model="username" type="text" placeholder="请输入用户名" autocomplete="username" required>
        </div>
        <div class="field">
          <label>密码</label>
          <input v-model="password" type="password" placeholder="请输入密码" autocomplete="current-password" required>
        </div>
        <button class="btn btn-primary" type="submit" :disabled="loading">
          {{ loading ? '请稍候...' : (mode === 'login' ? '登录' : '注册') }}
        </button>
      </form>
      <div class="error">{{ error }}</div>
      <div class="info">数据云端同步，随时随地访问</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const mode = ref('login')
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleSubmit() {
  error.value = ''
  if (!username.value.trim() || !password.value) {
    error.value = '请填写完整'
    return
  }
  loading.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(username.value.trim(), password.value)
    } else {
      await auth.register(username.value.trim(), password.value)
    }
    router.push('/')
  } catch (e) {
    error.value = e.message || '操作失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  display: flex; align-items: center; justify-content: center;
  min-height: 100vh; background: var(--bg-hover);
}
.login-card {
  background: var(--bg); border-radius: 12px; padding: 40px 36px;
  width: 360px; max-width: 90vw; box-shadow: var(--shadow-lg);
}
.logo {
  text-align: center; margin-bottom: 28px;
  font-size: 22px; font-weight: 600; letter-spacing: -0.02em;
}
.logo span { color: var(--blue); }
.tabs {
  display: flex; margin-bottom: 24px;
  background: var(--bg-hover); border-radius: 8px; padding: 3px;
}
.tab {
  flex: 1; text-align: center; padding: 8px;
  font-size: 14px; font-weight: 500; border-radius: 6px;
  cursor: pointer; color: var(--text-secondary); transition: .2s;
}
.tab.active {
  background: var(--bg); color: var(--text);
  box-shadow: var(--shadow-sm);
}
.field { margin-bottom: 16px; }
.field label { display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
.field input {
  width: 100%; padding: 10px 12px;
  border: 1px solid var(--border); border-radius: 8px;
  font-size: 14px; outline: none; transition: .2s;
  background: var(--bg); color: var(--text);
}
.field input:focus { border-color: var(--blue); box-shadow: 0 0 0 2px rgba(51,112,255,.15); }
.btn {
  width: 100%; padding: 11px; border: none; border-radius: 8px;
  font-size: 14px; font-weight: 500; cursor: pointer; transition: .2s;
}
.btn-primary { background: var(--blue); color: #fff; margin-top: 8px; }
.btn-primary:hover { background: #245bdb; }
.btn-primary:active { transform: scale(.98); }
.btn-primary:disabled { opacity: .6; cursor: default; }
.error { color: var(--red); font-size: 13px; margin-top: 12px; text-align: center; min-height: 20px; }
.info { color: var(--text-secondary); font-size: 12px; text-align: center; margin-top: 16px; }
</style>
