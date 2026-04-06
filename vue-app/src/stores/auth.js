import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { authFetch, logout as doLogout } from '../utils/api'

export const useAuthStore = defineStore('auth', () => {
  const username = ref(localStorage.getItem('dt_username') || '')
  const nickname = ref(localStorage.getItem('dt_nickname') || '')
  const avatar = ref(localStorage.getItem('dt_avatar') || '')
  const token = ref(localStorage.getItem('dt_token') || '')
  const isAdmin = ref(localStorage.getItem('dt_is_admin') === '1')

  const isLoggedIn = computed(() => !!token.value)
  const displayName = computed(() => {
    const name = nickname.value || username.value || ''
    return name
  })
  const avatarUrl = computed(() => avatar.value || '')

  async function login(user, pass) {
    const resp = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || '登录失败')
    token.value = data.token
    username.value = data.username
    localStorage.setItem('dt_token', data.token)
    localStorage.setItem('dt_username', data.username)
    return data
  }

  async function register(user, pass) {
    const resp = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || '注册失败')
    token.value = data.token
    username.value = data.username
    localStorage.setItem('dt_token', data.token)
    localStorage.setItem('dt_username', data.username)
    return data
  }

  async function fetchProfile() {
    try {
      const resp = await authFetch('/api/me')
      const data = await resp.json()
      if (data.nickname) { nickname.value = data.nickname; localStorage.setItem('dt_nickname', data.nickname) }
      if (data.avatar) { avatar.value = data.avatar; localStorage.setItem('dt_avatar', data.avatar) }
      isAdmin.value = !!data.is_admin; localStorage.setItem('dt_is_admin', data.is_admin ? '1' : '0')
    } catch {}
  }

  function logout() { doLogout() }

  return { username, nickname, avatar, avatarUrl, token, isLoggedIn, isAdmin, displayName, login, register, fetchProfile, logout }
})
