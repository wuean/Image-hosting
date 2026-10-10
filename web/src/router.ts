import { createRouter, createWebHistory } from 'vue-router'
import { currentUser } from './user'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('./views/Login.vue') },
    { path: '/register', component: () => import('./views/Register.vue') },
    { path: '/activate', component: () => import('./views/Activate.vue') },
    { path: '/', redirect: '/images' },
    { path: '/images', component: () => import('./views/Dashboard.vue') },
    { path: '/images/upload', component: () => import('./views/Images.vue') },
    { path: '/images/manage', component: () => import('./views/Images.vue') },
    { path: '/buckets', component: () => import('./views/Buckets.vue') },
    { path: '/profile', component: () => import('./views/Profile.vue') },
    { path: '/admin/users', component: () => import('./views/AdminUsers.vue') },
    { path: '/admin/settings', component: () => import('./views/SystemSettings.vue') }
  ]
})

const PUBLIC_PATHS = ['/login', '/register', '/activate']
const ADMIN_PATHS = ['/admin/users', '/admin/settings']
router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  if (!token && !PUBLIC_PATHS.includes(to.path)) return '/login'
  if (token && to.path === '/login') return '/images'
  // 管理页仅管理员可进（后端已强制鉴权，这里只是别让普通用户进到空壳页）
  if (ADMIN_PATHS.includes(to.path) && currentUser.value?.role !== 'admin') return '/images'
})
