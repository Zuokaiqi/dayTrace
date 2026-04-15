// utils/api.ts

// 获取 API 基地址（native app 需配置，H5 使用代理）
export function getApiBase(): string {
  return uni.getStorageSync('dt_api_base') || ''
}

export function setApiBase(url: string): void {
  uni.setStorageSync('dt_api_base', url.replace(/\/$/, ''))
}

function getToken(): string {
  return uni.getStorageSync('dt_token') || ''
}

function getAuthHeaders(): Record<string, string> {
  const token = getToken()
  return token
    ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
    : { 'Content-Type': 'application/json' }
}

// uni.request 封装，返回类似 fetch Response 的对象
export function uniRequest(url: string, opts: {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  data?: any
} = {}): Promise<{ ok: boolean; status: number; json: () => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const base = getApiBase()
    uni.request({
      url: base + url,
      method: opts.method || 'GET',
      header: { ...getAuthHeaders(), ...(opts.headers || {}) },
      data: opts.data,
      success(res) {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: async () => res.data
        })
      },
      fail(err) {
        reject(new Error(err.errMsg))
      }
    })
  })
}

// 带鉴权的请求，401 时跳转登录
export async function authFetch(url: string, opts: Parameters<typeof uniRequest>[1] = {}) {
  const resp = await uniRequest(url, opts)
  if (resp.status === 401) {
    uni.removeStorageSync('dt_token')
    uni.removeStorageSync('dt_username')
    uni.reLaunch({ url: '/pages/login/login' })
    throw new Error('auth')
  }
  return resp
}

export function logout(): void {
  const keys = [
    'dt_token', 'dt_username', 'dt_nickname', 'dt_avatar',
    'dt_events', 'dt_nid', 'dt_tasks', 'dt_tnid',
    'dt_links', 'dt_ai_prompts', 'dt_goals'
  ]
  keys.forEach(k => uni.removeStorageSync(k))

  // 清除 reflections
  try {
    const info = uni.getStorageInfoSync()
    const reflKeys = info.keys.filter((k: string) => k.startsWith('dt_refl_'))
    reflKeys.forEach((k: string) => uni.removeStorageSync(k))
  } catch {}

  uni.reLaunch({ url: '/pages/login/login' })
}
