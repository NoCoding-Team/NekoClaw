/**
 * Authenticated fetch wrapper.
 *
 * - Automatically injects `Authorization: Bearer <token>` from the Zustand store.
 * - On 401, attempts to refresh the access token using the stored refresh_token.
 * - If refresh succeeds, retries the original request with the new token.
 * - If refresh fails, clears auth state (forces re-login).
 */
import { useAppStore } from '../store/app'

let _refreshPromise: Promise<boolean> | null = null

async function doRefresh(): Promise<boolean> {
  // Deduplicate concurrent refresh calls
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = (async () => {
    const { refreshToken, serverUrl, setAuth, clearAuth, userId, username } = useAppStore.getState()
    if (!refreshToken) { clearAuth(); return false }
    try {
      const res = await fetch(`${serverUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!res.ok) { clearAuth(); return false }
      const data = await res.json()
      setAuth(data.access_token, userId ?? '', username ?? undefined, data.refresh_token)
      return true
    } catch {
      clearAuth()
      return false
    }
  })()
  try {
    return await _refreshPromise
  } finally {
    _refreshPromise = null
  }
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { token } = useAppStore.getState()
  const headers = new Headers(options.headers as HeadersInit | undefined)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(url, { ...options, headers })

  if (res.status === 401) {
    const refreshed = await doRefresh()
    if (refreshed) {
      const { token: newToken } = useAppStore.getState()
      const retryHeaders = new Headers(options.headers as HeadersInit | undefined)
      if (newToken) retryHeaders.set('Authorization', `Bearer ${newToken}`)
      return fetch(url, { ...options, headers: retryHeaders })
    }
  }

  return res
}
