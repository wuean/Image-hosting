async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = { ...(options.headers as any) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (options.body && typeof options.body === 'string') headers['Content-Type'] = 'application/json'
  const res = await fetch(path, { ...options, headers })
  if (res.status === 401) {
    localStorage.removeItem('token')
    location.href = '/login'
    throw new Error('未登录')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as any).error || `请求失败 (${res.status})`)
  return data
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: any) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: (path: string, body?: any) => request(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: (path: string) => request(path, { method: 'DELETE' }),
  upload: (path: string, formData: FormData) => request(path, { method: 'POST', body: formData })
}
