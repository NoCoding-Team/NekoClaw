import { apiJson } from './base'

export interface LLMConfig {
  id: string
  name: string
  provider: string
  model: string
  api_key?: string
  base_url?: string
  is_default: boolean
  context_limit: number
  temperature: number
  created_at: string
}

export interface CreateLLMConfigBody {
  name: string
  provider: string
  model: string
  api_key?: string
  base_url?: string
  is_default?: boolean
  context_limit?: number
  temperature?: number
}

export interface UpdateLLMConfigBody {
  name?: string
  provider?: string
  model?: string
  api_key?: string
  base_url?: string
  is_default?: boolean
  context_limit?: number
  temperature?: number
}

export async function listLLMConfigs(): Promise<LLMConfig[]> {
  return apiJson('/api/admin/llm-configs')
}

export async function createLLMConfig(body: CreateLLMConfigBody): Promise<LLMConfig> {
  return apiJson('/api/admin/llm-configs', { method: 'POST', body: JSON.stringify(body) })
}

export async function updateLLMConfig(id: string, body: UpdateLLMConfigBody): Promise<LLMConfig> {
  return apiJson(`/api/admin/llm-configs/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export async function getLLMConfigApiKey(id: string): Promise<string> {
  const data = await apiJson(`/api/admin/llm-configs/${id}/api-key`) as { api_key?: string }
  return data.api_key ?? ''
}

export async function deleteLLMConfig(id: string): Promise<void> {
  return apiJson(`/api/admin/llm-configs/${id}`, { method: 'DELETE' })
}

export interface TestLLMResult {
  ok: boolean
  latency_ms: number | null
  error?: string
}

export async function testLLMConfig(body: { provider: string; model: string; api_key?: string; base_url?: string; temperature?: number }): Promise<TestLLMResult> {
  return apiJson('/api/llm-configs/test', { method: 'POST', body: JSON.stringify(body) })
}
