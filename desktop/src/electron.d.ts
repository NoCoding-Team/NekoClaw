interface NekoBridgeFile {
  read(path: string): Promise<{ content?: string; error?: string }>
  write(path: string, content: string): Promise<{ success?: boolean; error?: string }>
  list(dir: string): Promise<{ entries?: Array<{ name: string; isDirectory: boolean; path: string }>; error?: string }>
  delete(path: string): Promise<{ success?: boolean; error?: string }>
}

interface NekoBridgeShell {
  exec(command: string): Promise<{ stdout?: string; stderr?: string; error?: string }>
  openExternal(url: string): Promise<void>
}

interface NekoBridgeStorage {
  encrypt(plaintext: string): Promise<{ encrypted: string }>
  decrypt(b64: string): Promise<{ decrypted: string }>
}

interface NekoBridgeWindow {
  minimize(): void
  maximize(): void
  close(): void
}

interface NekoBridgeApp {
  getDataPath(): Promise<string>
}

interface NekoBridgeLog {
  getPath(): Promise<string>
}

interface LocalDBSession {
  id: string
  title: string
  createdAt: number
  synced: number
}

interface LocalDBMessage {
  id: string
  sessionId: string
  role: string
  content: string
  toolCalls: string | null
  tokenCount: number
  createdAt: number
  synced: number
}

interface NekoBridgeDb {
  getSessions(opts?: { onlyUnsynced?: boolean }): Promise<{ sessions?: LocalDBSession[]; error?: string }>
  upsertSession(id: string, title: string, createdAt: number): Promise<{ success?: boolean; error?: string }>
  getMessages(sessionId: string): Promise<LocalDBMessage[]>
  insertMessage(msg: Omit<LocalDBMessage, 'synced'>): Promise<{ success?: boolean; error?: string }>
  markSynced(sessionId: string): Promise<{ success?: boolean; error?: string }>
  deleteSession(sessionId: string): Promise<{ success?: boolean; error?: string }>
  updateMessageToolCalls(id: string, toolCalls: string): Promise<{ success?: boolean; error?: string }>
  readLegacyLocalMemories(): Promise<{ entries: Array<{ id: string; category: string; content: string; created_at: string }> }>
  deleteLegacyLocalMemories(): Promise<{ success: boolean }>
}

/** @deprecated Memory operations now use server REST API. IPC bridge retained for backward compat. */
interface NekoBridgeMemory {
  read(path: string): Promise<{ content?: string; error?: string }>
  write(path: string, content: string): Promise<{ success?: boolean; error?: string }>
  delete(path: string): Promise<{ success?: boolean; error?: string }>
  list(): Promise<{ files?: Array<{ name: string; path: string; mtime: number }>; error?: string }>
  search(query: string): Promise<{ results?: Array<{ path: string; snippet: string }>; error?: string }>
  setEmbeddingConfig(config: { enabled: boolean; baseUrl: string; model: string; apiKey: string }): Promise<{ success?: boolean }>
}

interface NekoBridgeBrowser {
  navigate(url: string): Promise<{ url?: string; title?: string; error?: string }>
  screenshot(): Promise<{ base64?: string; error?: string }>
  click(opts: { selector?: string; x?: number; y?: number }): Promise<{ success?: boolean; error?: string }>
  type(selector: string, text: string): Promise<{ success?: boolean; error?: string }>
}

interface NekoBridgeNet {
  webSearch(query: string, maxResults: number, apiKey: string): Promise<{ results?: Array<{ title: string; url: string; content: string }>; error?: string }>
  httpRequest(opts: { method: string; url: string; headers?: Record<string, string>; body?: string }): Promise<{ status_code?: number; headers?: Record<string, string>; body?: string; error?: string }>
}

interface NekoBridgeSchedulerTask {
  id: string
  title: string
  description: string
  schedule_type?: 'once' | 'cron'
  cron_expr: string | null
  run_at: string | null
  next_run_at?: string | null
  timezone?: string
  skill_id: string | null
  allowed_tools?: string[]
  is_enabled: boolean
}

interface NekoBridgeSchedulerFiredTask {
  id: string
  title: string
  description: string
  skill_id: string | null
  allowed_tools: string[]
  scheduled_for: string
}

interface NekoBridgePet {
  onFlip(callback: (flipped: boolean) => void): () => void
  dragStart(): void
  dragEnd(): void
}

interface NekoBridgeScheduler {
  sync(tasks: NekoBridgeSchedulerTask[]): Promise<{ scheduled: number }>
  validateCron(expr: string): Promise<{ valid: boolean }>
  onFired(callback: (task: NekoBridgeSchedulerFiredTask) => void): () => void
}

interface NekoBridge {
  file: NekoBridgeFile
  shell: NekoBridgeShell
  storage: NekoBridgeStorage
  window: NekoBridgeWindow
  app: NekoBridgeApp
  log: NekoBridgeLog
  browser: NekoBridgeBrowser
  net: NekoBridgeNet
  memory: NekoBridgeMemory
  scheduler: NekoBridgeScheduler
  pet: NekoBridgePet
  db?: NekoBridgeDb
}

declare interface Window {
  nekoBridge: NekoBridge
}
