const API_BASE = import.meta.env.VITE_API_BASE || ''  // same origin, proxied by Vite in dev
const APP_BASE = import.meta.env.BASE_URL || '/'

function joinBase(base, path) {
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
  return cleanBase + path
}

export function apiUrl(path) {
  return joinBase(API_BASE, path)
}

export function appUrl(path) {
  return joinBase(APP_BASE, path)
}

export function resourceUrl(url) {
  if (!url || /^(https?:|data:|blob:)/.test(url)) return url
  if (API_BASE && url.startsWith('/api/')) return apiUrl(url)
  return url
}

function getAuthHeaders() {
  const token = localStorage.getItem('dt_token')
  return token
    ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
    : { 'Content-Type': 'application/json' }
}

export async function authFetch(url, opts = {}) {
  opts.headers = { ...getAuthHeaders(), ...(opts.headers || {}) }
  const resp = await fetch(apiUrl(url), opts)
  if (resp.status === 401) {
    localStorage.removeItem('dt_token')
    localStorage.removeItem('dt_username')
    window.location.href = appUrl('/login')
    throw new Error('auth')
  }
  return resp
}

export function logout() {
  const keys = [
    'dt_token', 'dt_username', 'dt_nickname', 'dt_avatar',
    'dt_events', 'dt_nid', 'dt_tasks', 'dt_tnid',
    'dt_links', 'dt_ai_prompts', 'dt_goals'
  ]
  keys.forEach(k => localStorage.removeItem(k))
  // Clear reflections
  const reflKeys = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k.startsWith('dt_refl_')) reflKeys.push(k)
  }
  reflKeys.forEach(k => localStorage.removeItem(k))
  window.location.href = appUrl('/login')
}
