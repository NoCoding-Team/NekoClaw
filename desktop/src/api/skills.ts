import { useAppStore } from '../store/app'
import { apiFetch } from './apiFetch'

export interface SkillInfo {
  key: string           // directory name — stable API identifier
  name: string          // display name from frontmatter
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
  const list: SkillInfo[] = await res.json()
  // Back-compat: if backend hasn't been rebuilt yet, key field may be absent;
  // fall back to name so UI doesn't send /api/skills/undefined requests.
  return list.map(s => ({ ...s, key: s.key || s.name }))
}

export async function toggleSkill(key: string, enabled: boolean): Promise<void> {
  const res = await apiFetch(`${getBase()}/api/skills/${encodeURIComponent(key)}/toggle`, {
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

export async function deleteSkill(key: string): Promise<void> {
  const res = await apiFetch(`${getBase()}/api/skills/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(await res.text())
}
