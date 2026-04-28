import { apiJson, apiFetch, setToken, clearToken, getToken } from './base'

export interface LoginResult {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface MeResult {
  id: string
  username: string
  is_admin: boolean
  nickname: string | null
}

export async function login(username: string, password: string): Promise<LoginResult> {
  return apiJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function getMe(): Promise<MeResult> {
  return apiJson('/api/auth/me')
}

export function logout(): void {
  clearToken()
}

export function isLoggedIn(): boolean {
  return !!getToken()
}
