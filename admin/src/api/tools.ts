import { apiJson } from './base'

export interface ToolRequiresCredential {
  key: string
  label: string
  hint: string
}

export interface ToolRequires {
  credentials: ToolRequiresCredential[]
  services: string[]
}

export interface ToolStatus {
  credentials_configured: boolean
  services_available: boolean
  ready: boolean
}

export interface ToolConfig {
  name: string
  category: string
  description: string
  executor: 'server' | 'client'
  enabled: boolean
  requires: ToolRequires | null
  status: ToolStatus
}

export async function listTools(): Promise<ToolConfig[]> {
  return apiJson('/api/admin/tools')
}

export async function updateTool(
  name: string,
  body: { enabled?: boolean; credentials?: Record<string, string> },
): Promise<ToolConfig> {
  return apiJson(`/api/admin/tools/${name}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function checkTool(name: string): Promise<ToolStatus> {
  return apiJson(`/api/admin/tools/${name}/check`)
}
