import { create } from 'zustand'

const STORAGE_SERVER = 'neko_server_url'
const STORAGE_RECENT = 'neko_recent_servers'
const STORAGE_LOCAL_LLM = 'neko_local_llm_config'
const STORAGE_AUTH = 'neko_auth'

function loadServerUrl(): string {
  return localStorage.getItem(STORAGE_SERVER) ?? 'http://localhost:8000'
}

function loadRecentServers(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_RECENT) ?? '[]')
  } catch {
    return []
  }
}

export interface LocalLLMConfig {
  provider: string   // 'openai' | 'anthropic' | 'custom'
  baseUrl: string
  model: string
  apiKeyB64: string  // base64 or safeStorage-encrypted bytes encoded as base64
  maxTokens: number
  temperature: number
}

function loadLocalLLMConfig(): LocalLLMConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_LOCAL_LLM)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function loadAuth(): { token: string | null; userId: string | null; username: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_AUTH)
    return raw ? JSON.parse(raw) : { token: null, userId: null, username: null }
  } catch {
    return { token: null, userId: null, username: null }
  }
}

export type CatState = 'idle' | 'thinking' | 'working' | 'success' | 'error'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  streaming?: boolean
}

export interface ToolCall {
  callId: string
  tool: string
  args: Record<string, unknown>
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'DENY'
  reason?: string
  status: 'pending' | 'confirmed' | 'denied' | 'executing' | 'done' | 'error'
  result?: string
}

export interface Session {
  id: string
  title: string
  skillId?: string
}

export interface AppState {
  // Auth
  token: string | null
  userId: string | null
  username: string | null
  setAuth: (token: string, userId: string, username?: string) => void
  clearAuth: () => void

  // Server URL
  serverUrl: string
  setServerUrl: (url: string) => void

  // Server connection
  serverConnected: boolean
  setServerConnected: (v: boolean) => void
  recentServers: string[]
  addRecentServer: (url: string) => void

  // Sessions
  sessions: Session[]
  activeSessionId: string | null
  setSessions: (sessions: Session[]) => void
  setActiveSession: (id: string | null) => void
  addSession: (session: Session) => void
  removeSession: (id: string) => void

  // Messages per session
  messagesBySession: Record<string, ChatMessage[]>
  appendMessage: (sessionId: string, msg: ChatMessage) => void
  updateLastAssistantToken: (sessionId: string, token: string) => void
  updateToolCallStatus: (sessionId: string, callId: string, patch: Partial<ToolCall>) => void
  setMessages: (sessionId: string, msgs: ChatMessage[]) => void

  // Cat state
  catState: CatState
  setCatState: (s: CatState) => void

  // WebSocket connection status
  wsStatus: 'disconnected' | 'connecting' | 'connected'
  setWsStatus: (s: 'disconnected' | 'connecting' | 'connected') => void

  // Sidebar
  sidebarTab: 'sessions' | 'tasks' | 'skills' | 'memory' | 'personalization' | 'settings'
  setSidebarTab: (tab: AppState['sidebarTab']) => void

  // Settings modal
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void

  // Selected skill
  activeSkillId: string | null
  setActiveSkillId: (id: string | null) => void

  // Local LLM config (bypass backend, direct API calls from desktop)
  localLLMConfig: LocalLLMConfig | null
  setLocalLLMConfig: (cfg: LocalLLMConfig | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  ...loadAuth(),
  setAuth: (token, userId, username) => {
    const auth = { token, userId, username: username ?? null }
    localStorage.setItem(STORAGE_AUTH, JSON.stringify(auth))
    set(auth)
  },
  clearAuth: () => {
    localStorage.removeItem(STORAGE_AUTH)
    set({ token: null, userId: null, username: null })
  },

  serverUrl: loadServerUrl(),
  setServerUrl: (url) => {
    localStorage.setItem(STORAGE_SERVER, url)
    set({ serverUrl: url })
  },

  // Restore serverConnected from persisted token — if we have a token, server was reachable
  serverConnected: !!loadAuth().token,
  setServerConnected: (serverConnected) => set({ serverConnected }),
  recentServers: loadRecentServers(),
  addRecentServer: (url) =>
    set((s) => {
      const list = [url, ...s.recentServers.filter((u) => u !== url)].slice(0, 5)
      localStorage.setItem(STORAGE_RECENT, JSON.stringify(list))
      return { recentServers: list }
    }),

  sessions: [],
  activeSessionId: null,
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
  removeSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((sess) => sess.id !== id),
      activeSessionId: s.activeSessionId === id
        ? (s.sessions.find((sess) => sess.id !== id)?.id ?? null)
        : s.activeSessionId,
    })),

  messagesBySession: {},
  appendMessage: (sessionId, msg) =>
    set((s) => ({
      messagesBySession: {
        ...s.messagesBySession,
        [sessionId]: [...(s.messagesBySession[sessionId] ?? []), msg],
      },
    })),
  updateLastAssistantToken: (sessionId, token) =>
    set((s) => {
      const msgs = [...(s.messagesBySession[sessionId] ?? [])]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'assistant' && last.streaming) {
        msgs[msgs.length - 1] = { ...last, content: last.content + token }
      }
      return { messagesBySession: { ...s.messagesBySession, [sessionId]: msgs } }
    }),
  updateToolCallStatus: (sessionId, callId, patch) =>
    set((s) => {
      const msgs = (s.messagesBySession[sessionId] ?? []).map((m) => {
        if (!m.toolCalls) return m
        return {
          ...m,
          toolCalls: m.toolCalls.map((tc) =>
            tc.callId === callId ? { ...tc, ...patch } : tc
          ),
        }
      })
      return { messagesBySession: { ...s.messagesBySession, [sessionId]: msgs } }
    }),
  setMessages: (sessionId, msgs) =>
    set((s) => ({ messagesBySession: { ...s.messagesBySession, [sessionId]: msgs } })),

  catState: 'idle',
  setCatState: (catState) => set({ catState }),

  wsStatus: 'disconnected',
  setWsStatus: (wsStatus) => set({ wsStatus }),

  sidebarTab: 'sessions',
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),

  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  activeSkillId: null,
  setActiveSkillId: (activeSkillId) => set({ activeSkillId }),

  localLLMConfig: loadLocalLLMConfig(),
  setLocalLLMConfig: (cfg) => {
    if (cfg) {
      localStorage.setItem(STORAGE_LOCAL_LLM, JSON.stringify(cfg))
    } else {
      localStorage.removeItem(STORAGE_LOCAL_LLM)
    }
    set({ localLLMConfig: cfg })
  },
}))
