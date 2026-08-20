async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = { ...(options.headers as any) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (options.body && typeof options.body === 'string') headers['Content-Type'] = 'application/json'
  const res = await fetch(path, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // 401 不一定代表会话失效：登录/注册/激活接口自身就会返回 401（密码错、未激活等）。
    // 仅当【已携带 token 且不是鉴权接口】时才视为会话过期，清理并跳登录，
    // 否则会触发整页刷新把错误提示冲掉（登录失败时页面无提示的根因）。
    if (res.status === 401 && token && !path.startsWith('/api/auth/')) {
      localStorage.removeItem('token')
      if (location.pathname !== '/login') location.href = '/login'
    }
    throw new Error((data as any).error || `请求失败 (${res.status})`)
  }
  return data
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: any) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: (path: string, body?: any) => request(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: (path: string) => request(path, { method: 'DELETE' }),
  upload: (path: string, formData: FormData) => request(path, { method: 'POST', body: formData })
}
