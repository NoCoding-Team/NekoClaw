import { create } from 'zustand'

const STORAGE_SERVER = 'neko_server_url'
const STORAGE_RECENT = 'neko_recent_servers'
const STORAGE_AUTH = 'neko_auth'
const STORAGE_ACTIVE_SESSION = 'neko_active_session'
const STORAGE_PERSONAL = 'neko_personal'
const STORAGE_SECURITY = 'neko_security'
const STORAGE_SYNC_ENABLED = 'neko_sync_enabled'
const STORAGE_CUSTOM_LLM = 'neko_custom_llm'
const STORAGE_TOOLS_CONFIG = 'neko_tools_config'

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

export interface FallbackLLMConfig {
  provider: string
  model: string
  api_key: string
  base_url: string
}

export interface CustomLLMConfig {
  enabled: boolean      // 是否使用自定义配置替代服务端默认配置
  provider: string      // openai | anthropic | gemini | custom
  model: string
  api_key: string
  base_url: string
  context_limit: number
  temperature: number
  fallbacks: FallbackLLMConfig[]
}

export const DEFAULT_CUSTOM_LLM_CONFIG: CustomLLMConfig = {
  enabled: false,
  provider: 'openai',
  model: '',
  api_key: '',
  base_url: '',
  context_limit: 128000,
  temperature: 0.7,
  fallbacks: [],
}

function loadCustomLLMConfig(): CustomLLMConfig {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_LLM)
    return raw ? { ...DEFAULT_CUSTOM_LLM_CONFIG, ...JSON.parse(raw) } : DEFAULT_CUSTOM_LLM_CONFIG
  } catch {
    return DEFAULT_CUSTOM_LLM_CONFIG
  }
}

export interface ToolsConfig {
  tavilyApiKey: string
}

export const DEFAULT_TOOLS_CONFIG: ToolsConfig = { tavilyApiKey: '' }

function loadToolsConfig(): ToolsConfig {
  try {
    const raw = localStorage.getItem(STORAGE_TOOLS_CONFIG)
    return raw ? { ...DEFAULT_TOOLS_CONFIG, ...JSON.parse(raw) } : DEFAULT_TOOLS_CONFIG
  } catch {
    return DEFAULT_TOOLS_CONFIG
  }
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

/** All known tool names — used as default toolWhitelist so every tool is enabled out-of-the-box. */
export const ALL_TOOL_NAMES: string[] = [
  'file_read', 'file_write', 'file_list', 'file_delete',
  'shell_exec',
  'web_search',
  'browser_navigate', 'browser_screenshot', 'browser_click', 'browser_type',
  'http_request',
  'search_memory',
]

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  botControlPermission: true,
  fullAccessMode: false,
  loopGuard: true,
  loopGuardSensitivity: 'default',
  maxToolCallsPerRound: 40,
  commandWhitelist: [],
  toolWhitelist: [...ALL_TOOL_NAMES],
  execEnvironment: 'transparent',
  containerNetwork: 'none',
  sandboxThreshold: 'MEDIUM',
}

function loadSecurityConfig(): SecurityConfig {
  try {
    const raw = localStorage.getItem(STORAGE_SECURITY)
    if (!raw) return DEFAULT_SECURITY_CONFIG
    const saved = { ...DEFAULT_SECURITY_CONFIG, ...JSON.parse(raw) }
    // Migration: old configs had toolWhitelist defaulting to []. If it's
    // still empty and was never explicitly configured, populate with all tools.
    if (Array.isArray(saved.toolWhitelist) && saved.toolWhitelist.length === 0) {
      saved.toolWhitelist = [...ALL_TOOL_NAMES]
    }
    return saved
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

function loadAuth(): { token: string | null; refreshToken: string | null; userId: string | null; username: string | null; nickname: string | null; avatarData: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_AUTH)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      token: parsed.token ?? null,
      refreshToken: parsed.refreshToken ?? null,
      userId: parsed.userId ?? null,
      username: parsed.username ?? null,
      nickname: parsed.nickname ?? null,
      avatarData: parsed.avatarData ?? null,
    }
  } catch {
    return { token: null, refreshToken: null, userId: null, username: null, nickname: null, avatarData: null }
  }
}

export type CatState = 'idle' | 'thinking' | 'working' | 'success' | 'error'

export type TurnSegment =
  | { type: 'text'; content: string }
  | { type: 'tools'; toolCalls: ToolCall[] }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  streaming?: boolean
  /** 合并后的混合轮次段落，按时间顺序排列：文本 → 工具 → 文本 → … */
  segments?: TurnSegment[]
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
}

export interface AppState {
  // Auth
  token: string | null
  refreshToken: string | null
  userId: string | null
  username: string | null
  nickname: string | null
  avatarData: string | null
  setAuth: (token: string, userId: string, username?: string, refreshToken?: string) => void
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
  catStateBySession: Record<string, CatState>
  setCatState: (s: CatState) => void

  // WebSocket connection status
  wsStatus: 'disconnected' | 'connecting' | 'connected'
  setWsStatus: (s: 'disconnected' | 'connecting' | 'connected') => void

  // Sidebar
  sidebarTab: 'sessions' | 'tasks' | 'memory' | 'personalization' | 'settings' | 'abilities' | 'skills'
  setSidebarTab: (tab: AppState['sidebarTab']) => void

  // Settings modal
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void

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

  // Custom LLM config (stored locally, passed to backend per-message when enabled)
  customLLMConfig: CustomLLMConfig
  setCustomLLMConfig: (cfg: Partial<CustomLLMConfig>) => void

  // Tools config (API keys for local tool execution)
  toolsConfig: ToolsConfig
  setToolsConfig: (cfg: Partial<ToolsConfig>) => void

  // Skills version — increments whenever skills list changes so MemoryPanel can refresh
  skillsVersion: number
  bumpSkillsVersion: () => void
}

export const useAppStore = create<AppState>((set) => ({
  ...loadAuth(),
  setAuth: (token, userId, username, refreshToken) => {
    const prev = loadAuth()
    const auth = { token, userId, username: username ?? null, nickname: prev.nickname, avatarData: prev.avatarData, refreshToken: refreshToken ?? prev.refreshToken }
    localStorage.setItem(STORAGE_AUTH, JSON.stringify(auth))
    set(auth)
  },
  setProfile: (userId, username, nickname, avatarData) => {
    set((s) => {
      const next = { ...s, userId, username, nickname, avatarData }
      localStorage.setItem(STORAGE_AUTH, JSON.stringify({ token: s.token, refreshToken: s.refreshToken, userId, username, nickname, avatarData }))
      return next
    })
  },
  clearAuth: () => {
    localStorage.removeItem(STORAGE_AUTH)
    set({ token: null, refreshToken: null, userId: null, username: null, nickname: null, avatarData: null })
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
    set((state) => ({
      activeSessionId: id,
      // 切换会话时恢复目标会话的 catState（默认 idle），
      // 这样来回切换不会丢失加载气泡状态
      catState: id ? (state.catStateBySession[id] ?? 'idle') : 'idle',
    }))
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
  catStateBySession: {} as Record<string, CatState>,
  setCatState: (catState) => set((s) => ({
    catState,
    catStateBySession: s.activeSessionId
      ? { ...s.catStateBySession, [s.activeSessionId]: catState }
      : s.catStateBySession,
  })),

  wsStatus: 'disconnected',
  setWsStatus: (wsStatus) => set({ wsStatus }),

  sidebarTab: 'sessions',
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),

  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

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

  customLLMConfig: loadCustomLLMConfig(),
  setCustomLLMConfig: (patch) =>
    set((s) => {
      const next = { ...s.customLLMConfig, ...patch }
      localStorage.setItem(STORAGE_CUSTOM_LLM, JSON.stringify(next))
      return { customLLMConfig: next }
    }),

  toolsConfig: loadToolsConfig(),
  setToolsConfig: (patch) =>
    set((s) => {
      const next = { ...s.toolsConfig, ...patch }
      localStorage.setItem(STORAGE_TOOLS_CONFIG, JSON.stringify(next))
      return { toolsConfig: next }
    }),

  skillsVersion: 0,
  bumpSkillsVersion: () => set((s) => ({ skillsVersion: s.skillsVersion + 1 })),
}))
