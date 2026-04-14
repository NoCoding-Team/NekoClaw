import { useAppStore } from '../store/app'

export interface LLMConfig {
  id: string
  provider: string
  name: string
  model: string
  base_url: string | null
  is_default: boolean
  context_limit: number
  temperature: number
}

function getBase() {
  return useAppStore.getState().serverUrl
}
function getToken() {
  return useAppStore.getState().token ?? ''
}
function headers() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }
}

export async function fetchLLMConfigs(): Promise<LLMConfig[]> {
  const res = await fetch(`${getBase()}/api/llm-configs`, { headers: headers() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function createLLMConfig(body: {
  provider: string
  name: string
  model: string
  api_key: string
  base_url?: string
  is_default?: boolean
  context_limit?: number
  temperature?: number
}): Promise<LLMConfig> {
  const res = await fetch(`${getBase()}/api/admin/llm-configs`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateLLMConfig(
  id: string,
  body: { name?: string; model?: string; api_key?: string; base_url?: string; is_default?: boolean; context_limit?: number; temperature?: number }
): Promise<LLMConfig> {
  const res = await fetch(`${getBase()}/api/admin/llm-configs/${id}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteLLMConfig(id: string): Promise<void> {
  const res = await fetch(`${getBase()}/api/admin/llm-configs/${id}`, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!res.ok && res.status !== 204) throw new Error(await res.text())
}
