import { apiJson, apiFetch } from './base'

export interface AdminSkill {
  name: string
  description: string
  author: string
  version: string
  default_enabled: boolean
  triggers: string[]
  requires_tools: string[]
}

export async function listSkills(): Promise<AdminSkill[]> {
  return apiJson('/api/admin/skills')
}

export async function updateSkill(name: string, default_enabled: boolean): Promise<AdminSkill> {
  return apiJson(`/api/admin/skills/${name}`, {
    method: 'PATCH',
    body: JSON.stringify({ default_enabled }),
  })
}

export async function deleteSkill(name: string): Promise<void> {
  return apiJson(`/api/admin/skills/${name}`, { method: 'DELETE' })
}

export async function uploadSkill(file: File): Promise<AdminSkill> {
  const form = new FormData()
  form.append('file', file)
  const res = await apiFetch('/api/admin/skills', { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}
