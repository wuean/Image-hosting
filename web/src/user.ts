import { ref } from 'vue'

function loadFromStorage(): any {
  try {
    const raw = localStorage.getItem('user')
    if (!raw || raw === 'undefined' || raw === 'null') return null
    const p = JSON.parse(raw)
    return p && typeof p === 'object' ? p : null
  } catch {
    localStorage.removeItem('user')
    return null
  }
}

// 全局共享的当前登录用户（登录时写入，个人资料页修改后同步更新）
export const currentUser = ref(loadFromStorage())

export function setCurrentUser(u: any) {
  if (u == null) {
    localStorage.removeItem('user')
    currentUser.value = null
    return
  }
  localStorage.setItem('user', JSON.stringify(u))
  currentUser.value = u
}

// 显示名：昵称优先，未设置则回退用户名
export function displayName(u?: any): string {
  const x = u ?? currentUser.value
  const n = x?.nickname?.toString().trim()
  return n ? n : x?.username || '用户'
}

export function isAdmin(): boolean {
  return currentUser.value?.role === 'admin'
}
