import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { eePortalRoutes } from '@/router/ee-stub'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { hideNav: true },
  },
  {
    path: '/login/callback/:provider',
    name: 'OAuthCallback',
    component: () => import('@/views/OAuthCallback.vue'),
    meta: { hideNav: true },
  },
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/instances',
    name: 'InstanceList',
    component: () => import('@/views/InstanceList.vue'),
  },
  {
    path: '/instances/create',
    name: 'CreateInstance',
    component: () => import('@/views/CreateInstance.vue'),
  },
  {
    path: '/instances/:id',
    name: 'InstanceDetail',
    component: () => import('@/views/InstanceDetail.vue'),
  },
  {
    path: '/deploy/:deployId/progress',
    name: 'DeployProgress',
    component: () => import('@/views/DeployProgress.vue'),
  },
  {
    path: '/workspaces',
    name: 'WorkspaceList',
    component: () => import('@/views/WorkspaceList.vue'),
  },
  {
    path: '/workspaces/:id',
    name: 'WorkspaceView',
    component: () => import('@/views/WorkspaceView.vue'),
  },
  {
    path: '/genes',
    name: 'GeneMarket',
    component: () => import('@/views/GeneMarket.vue'),
  },
  ...eePortalRoutes,
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
