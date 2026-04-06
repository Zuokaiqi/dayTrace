const API_BASE = ''  // same origin, proxied by Vite in dev

function getAuthHeaders() {
  const token = localStorage.getItem('dt_token')
  return token
    ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
    : { 'Content-Type': 'application/json' }
}

export async function authFetch(url, opts = {}) {
  opts.headers = { ...getAuthHeaders(), ...(opts.headers || {}) }
  const resp = await fetch(API_BASE + url, opts)
  if (resp.status === 401) {
    localStorage.removeItem('dt_token')
    localStorage.removeItem('dt_username')
    window.location.href = '/login'
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
  window.location.href = '/login'
}
