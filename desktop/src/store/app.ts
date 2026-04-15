import { create } from 'zustand'

const STORAGE_SERVER = 'neko_server_url'
const STORAGE_RECENT = 'neko_recent_servers'
const STORAGE_LOCAL_LLM = 'neko_local_llm_config'
const STORAGE_AUTH = 'neko_auth'
const STORAGE_ACTIVE_SESSION = 'neko_active_session'
const STORAGE_PERSONAL = 'neko_personal'
const STORAGE_SECURITY = 'neko_security'
const STORAGE_SYNC_ENABLED = 'neko_sync_enabled'

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

export interface AuxModelConfig {
  enabled: boolean
  baseUrl: string    // empty = same as main model
  model: string
  apiKeyB64: string  // empty = same as main model
}

export interface LocalLLMConfig {
  provider: string   // 'openai' | 'anthropic' | 'custom'
  baseUrl: string
  model: string
  apiKeyB64: string  // base64 or safeStorage-encrypted bytes encoded as base64
  maxTokens: number
  temperature: number
  embeddingModel?: AuxModelConfig
  rerankModel?: AuxModelConfig
}

function loadLocalLLMConfig(): LocalLLMConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_LOCAL_LLM)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export interface PersonalizationConfig {
  userName: string
  timezone: string
  notes: string
  catName: string
  bioType: string
  vibe: string
  catEmoji: string
  traits: string[]
  replyStyle: string
  customPrompt: string
  systemPrompt: string   // 由"生成配置"按钮编译生成
}

export interface SecurityConfig {
  botControlPermission: boolean
  fullAccessMode: boolean
  loopGuard: boolean
  loopGuardSensitivity: 'strict' | 'default' | 'loose'
  maxToolCallsPerRound: number
  commandWhitelist: string[]
  toolWhitelist: string[]
  execEnvironment: 'transparent' | 'container'
  containerNetwork: 'none' | 'host' | 'custom'       // 容器网络模式
  sandboxThreshold: 'off' | 'HIGH' | 'MEDIUM' | 'LOW' // 确认弹窗触发阀値
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  botControlPermission: true,
  fullAccessMode: false,
  loopGuard: true,
  loopGuardSensitivity: 'default',
  maxToolCallsPerRound: 40,
  commandWhitelist: [],
  toolWhitelist: [],
  execEnvironment: 'transparent',
  containerNetwork: 'none',
  sandboxThreshold: 'MEDIUM',
}

function loadSecurityConfig(): SecurityConfig {
  try {
    const raw = localStorage.getItem(STORAGE_SECURITY)
    return raw ? { ...DEFAULT_SECURITY_CONFIG, ...JSON.parse(raw) } : DEFAULT_SECURITY_CONFIG
  } catch {
    return DEFAULT_SECURITY_CONFIG
  }
}

function loadPersonalizationConfig(): PersonalizationConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_PERSONAL)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function loadAuth(): { token: string | null; userId: string | null; username: string | null; nickname: string | null; avatarData: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_AUTH)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      token: parsed.token ?? null,
      userId: parsed.userId ?? null,
      username: parsed.username ?? null,
      nickname: parsed.nickname ?? null,
      avatarData: parsed.avatarData ?? null,
    }
  } catch {
    return { token: null, userId: null, username: null, nickname: null, avatarData: null }
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
  nickname: string | null
  avatarData: string | null
  setAuth: (token: string, userId: string, username?: string) => void
  setProfile: (userId: string, username: string, nickname: string | null, avatarData: string | null) => void
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
  updateSessionTitle: (id: string, title: string) => void
  /** 将 local- 临时会话替换为服务端真实会话，并迁移消息记录 */
  replaceSession: (oldId: string, newSession: Session) => void

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
  sidebarTab: 'sessions' | 'tasks' | 'skills' | 'memory' | 'personalization' | 'settings' | 'abilities'
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

  // Personalization config
  personalizationConfig: PersonalizationConfig | null
  setPersonalizationConfig: (cfg: PersonalizationConfig) => void

  // Security config
  securityConfig: SecurityConfig
  setSecurityConfig: (cfg: Partial<SecurityConfig>) => void

  // Tool call counts (session-level, not persisted)
  toolCallCounts: Record<string, number>
  incrementToolCallCount: (tool: string) => void
  resetToolCallCounts: () => void

  // Sync: local-first chat history sync to server
  syncEnabled: boolean
  setSyncEnabled: (v: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  ...loadAuth(),
  setAuth: (token, userId, username) => {
    const prev = loadAuth()
    const auth = { token, userId, username: username ?? null, nickname: prev.nickname, avatarData: prev.avatarData }
    localStorage.setItem(STORAGE_AUTH, JSON.stringify(auth))
    set(auth)
  },
  setProfile: (userId, username, nickname, avatarData) => {
    set((s) => {
      const next = { ...s, userId, username, nickname, avatarData }
      localStorage.setItem(STORAGE_AUTH, JSON.stringify({ token: s.token, userId, username, nickname, avatarData }))
      return next
    })
  },
  clearAuth: () => {
    localStorage.removeItem(STORAGE_AUTH)
    set({ token: null, userId: null, username: null, nickname: null, avatarData: null })
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
  setActiveSession: (id) => {
    if (id) localStorage.setItem(STORAGE_ACTIVE_SESSION, id)
    else localStorage.removeItem(STORAGE_ACTIVE_SESSION)
    set({ activeSessionId: id })
  },
  addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
  updateSessionTitle: (id, title) =>
    set((s) => ({ sessions: s.sessions.map((sess) => sess.id === id ? { ...sess, title } : sess) })),
  replaceSession: (oldId, newSession) =>
    set((s) => {
      const msgs = s.messagesBySession[oldId]
      const newMsgsBySession = { ...s.messagesBySession, [newSession.id]: msgs ?? [] }
      delete newMsgsBySession[oldId]
      const newActiveId = s.activeSessionId === oldId ? newSession.id : s.activeSessionId
      if (newActiveId) localStorage.setItem(STORAGE_ACTIVE_SESSION, newActiveId)
      return {
        sessions: s.sessions.map((sess) => sess.id === oldId ? newSession : sess),
        activeSessionId: newActiveId,
        messagesBySession: newMsgsBySession,
      }
    }),
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

  personalizationConfig: loadPersonalizationConfig(),
  setPersonalizationConfig: (cfg) => {
    localStorage.setItem(STORAGE_PERSONAL, JSON.stringify(cfg))
    set({ personalizationConfig: cfg })
  },

  securityConfig: loadSecurityConfig(),
  setSecurityConfig: (patch) =>
    set((s) => {
      const next = { ...s.securityConfig, ...patch }
      localStorage.setItem(STORAGE_SECURITY, JSON.stringify(next))
      return { securityConfig: next }
    }),

  toolCallCounts: {},
  incrementToolCallCount: (tool) =>
    set((s) => ({
      toolCallCounts: { ...s.toolCallCounts, [tool]: (s.toolCallCounts[tool] ?? 0) + 1 },
    })),
  resetToolCallCounts: () => set({ toolCallCounts: {} }),

  syncEnabled: localStorage.getItem(STORAGE_SYNC_ENABLED) === 'true',
  setSyncEnabled: (v) => {
    localStorage.setItem(STORAGE_SYNC_ENABLED, String(v))
    set({ syncEnabled: v })
  },
}))
