import { create } from 'zustand'

const STORAGE_SERVER = 'neko_server_url'
const STORAGE_RECENT = 'neko_recent_servers'

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

  // Selected skill
  activeSkillId: string | null
  setActiveSkillId: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  token: null,
  userId: null,
  username: null,
  setAuth: (token, userId, username) => set({ token, userId, username: username ?? null }),
  clearAuth: () => set({ token: null, userId: null, username: null }),

  serverUrl: loadServerUrl(),
  setServerUrl: (url) => {
    localStorage.setItem(STORAGE_SERVER, url)
    set({ serverUrl: url })
  },

  serverConnected: false,
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

  activeSkillId: null,
  setActiveSkillId: (activeSkillId) => set({ activeSkillId }),
}))
