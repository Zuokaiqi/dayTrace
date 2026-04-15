import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { authFetch, logout as doLogout, uniRequest } from '../utils/api'
import { resetChat } from '../composables/useAiChat'

export const useAuthStore = defineStore('auth', () => {
  const username = ref<string>(uni.getStorageSync('dt_username') || '')
  const nickname = ref<string>(uni.getStorageSync('dt_nickname') || '')
  const avatar = ref<string>(uni.getStorageSync('dt_avatar') || '')
  const token = ref<string>(uni.getStorageSync('dt_token') || '')
  const isAdmin = ref<boolean>(uni.getStorageSync('dt_is_admin') === '1')

  const isLoggedIn = computed(() => !!token.value)
  const displayName = computed(() => nickname.value || username.value || '')
  const avatarUrl = computed(() => avatar.value || '')

  async function login(user: string, pass: string) {
    const resp = await uniRequest('/api/login', {
      method: 'POST',
      data: { username: user, password: pass }
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || '登录失败')
    token.value = data.token
    username.value = data.username
    uni.setStorageSync('dt_token', data.token)
    uni.setStorageSync('dt_username', data.username)
    return data
  }

  async function register(user: string, pass: string) {
    const resp = await uniRequest('/api/register', {
      method: 'POST',
      data: { username: user, password: pass }
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || '注册失败')
    token.value = data.token
    username.value = data.username
    uni.setStorageSync('dt_token', data.token)
    uni.setStorageSync('dt_username', data.username)
    return data
  }

  async function fetchProfile() {
    try {
      const resp = await authFetch('/api/me')
      const data = await resp.json()
      if (data.nickname) {
        nickname.value = data.nickname
        uni.setStorageSync('dt_nickname', data.nickname)
      }
      if (data.avatar) {
        avatar.value = data.avatar
        uni.setStorageSync('dt_avatar', data.avatar)
      }
      isAdmin.value = !!data.is_admin
      uni.setStorageSync('dt_is_admin', data.is_admin ? '1' : '0')
    } catch {}
  }

  function logout() { resetChat(); doLogout() }

  return {
    username, nickname, avatar, avatarUrl, token, isLoggedIn, isAdmin, displayName,
    login, register, fetchProfile, logout
  }
})
