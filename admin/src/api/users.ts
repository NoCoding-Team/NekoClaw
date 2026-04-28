import { apiJson } from './base'

export interface AdminStats {
  total_users: number
  active_users_today: number
  total_messages_today: number
  total_creation_today: number
}

export interface AdminUser {
  id: string
  username: string
  nickname: string | null
  is_admin: boolean
  daily_message_limit: number
  daily_creation_limit: number
  messages_used_today: number
  creation_used_today: number
  created_at: string
}

export interface CreateUserBody {
  username: string
  password: string
  nickname?: string
  is_admin?: boolean
}

export interface UpdateUserBody {
  nickname?: string
  password?: string
  is_admin?: boolean
}

export interface QuotaBody {
  daily_message_limit?: number
  daily_creation_limit?: number
}

export async function getStats(): Promise<AdminStats> {
  return apiJson('/api/admin/stats')
}

export async function listUsers(): Promise<AdminUser[]> {
  return apiJson('/api/admin/users')
}

export async function createUser(body: CreateUserBody): Promise<AdminUser> {
  return apiJson('/api/admin/users', { method: 'POST', body: JSON.stringify(body) })
}

export async function updateUser(id: string, body: UpdateUserBody): Promise<AdminUser> {
  return apiJson(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export async function deleteUser(id: string): Promise<void> {
  return apiJson(`/api/admin/users/${id}`, { method: 'DELETE' })
}

export async function updateQuota(id: string, body: QuotaBody): Promise<AdminUser> {
  return apiJson(`/api/admin/users/${id}/quota`, { method: 'PATCH', body: JSON.stringify(body) })
}

export async function resetQuota(id: string): Promise<void> {
  return apiJson(`/api/admin/users/${id}/quota/reset`, { method: 'POST' })
}
