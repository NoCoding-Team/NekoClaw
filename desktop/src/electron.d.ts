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
  readLegacyLocalMemories(): Promise<{ entries: Array<{ id: string; category: string; content: string; created_at: string }> }>
  deleteLegacyLocalMemories(): Promise<{ success: boolean }>
}

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

interface NekoBridge {
  file: NekoBridgeFile
  shell: NekoBridgeShell
  storage: NekoBridgeStorage
  window: NekoBridgeWindow
  app: NekoBridgeApp
  log: NekoBridgeLog
  browser: NekoBridgeBrowser
  memory: NekoBridgeMemory
  db?: NekoBridgeDb
}

declare interface Window {
  nekoBridge: NekoBridge
}
