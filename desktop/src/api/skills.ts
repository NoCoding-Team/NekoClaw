import { useAppStore } from '../store/app'
import { apiFetch } from './apiFetch'

export interface SkillInfo {
  name: string
  description: string
  version: string
  author: string
  source: 'builtin' | 'user'
  enabled: boolean
  triggers: string[]
}

function getBase() {
  return useAppStore.getState().serverUrl
}

export async function fetchSkills(): Promise<SkillInfo[]> {
  const res = await apiFetch(`${getBase()}/api/skills`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function toggleSkill(name: string, enabled: boolean): Promise<void> {
  const res = await apiFetch(`${getBase()}/api/skills/${encodeURIComponent(name)}/toggle`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function installSkill(file: File): Promise<SkillInfo> {
  const form = new FormData()
  form.append('file', file)
  const res = await apiFetch(`${getBase()}/api/skills/install`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteSkill(name: string): Promise<void> {
  const res = await apiFetch(`${getBase()}/api/skills/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(await res.text())
}
