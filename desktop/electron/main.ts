import { app, BrowserWindow, ipcMain, nativeImage, net, safeStorage, shell } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import cron from 'node-cron'
import {
  hasIndex as knowledgeHasIndex,
  searchKnowledge,
  setKnowledgeDir,
  getKnowledgeDir,
  setEmbeddingConfig as setKnowledgeEmbedding,
  shutdownKnowledge,
  type EmbeddingConfig as KnowledgeEmbeddingConfig,
} from './knowledge'

// ── SQLite DbService ─────────────────────────────────────────────────────
// Lazily required so that the renderer bundle never imports it
let _db: import('better-sqlite3').Database | null = null

function getDb(): import('better-sqlite3').Database {
  if (_db) return _db
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3') as typeof import('better-sqlite3')
  const dbPath = path.join(app.getPath('userData'), 'neko.db')
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.exec(`
    CREATE TABLE IF NOT EXISTS local_sessions (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      synced     INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS local_messages (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES local_sessions(id) ON DELETE CASCADE,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      tool_calls  TEXT,
      token_count INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      synced      INTEGER NOT NULL DEFAULT 0
    );
  `)
  return _db
}

type DBSession = { id: string; title: string; createdAt: number; synced: number }
type DBMessage = { id: string; sessionId: string; role: string; content: string; toolCalls: string | null; tokenCount: number; createdAt: number; synced: number }

function dbGetSessions(onlyUnsynced = false): DBSession[] {
  const db = getDb()
  const sql = onlyUnsynced
    ? 'SELECT id, title, created_at as createdAt, synced FROM local_sessions WHERE synced = 0 ORDER BY created_at DESC'
    : 'SELECT id, title, created_at as createdAt, synced FROM local_sessions ORDER BY created_at DESC'
  return (db.prepare(sql).all() as DBSession[])
}

function dbUpsertSession(id: string, title: string, createdAt: number): void {
  getDb().prepare(
    'INSERT INTO local_sessions (id, title, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title'
  ).run(id, title, createdAt)
}

function dbGetMessages(sessionId: string): DBMessage[] {
  return (getDb().prepare(
    'SELECT id, session_id as sessionId, role, content, tool_calls as toolCalls, token_count as tokenCount, created_at as createdAt, synced FROM local_messages WHERE session_id = ? ORDER BY created_at ASC'
  ).all(sessionId) as DBMessage[])
}

function dbInsertMessage(msg: Omit<DBMessage, 'synced'>): void {
  getDb().prepare(
    'INSERT OR IGNORE INTO local_messages (id, session_id, role, content, tool_calls, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(msg.id, msg.sessionId, msg.role, msg.content, msg.toolCalls ?? null, msg.tokenCount, msg.createdAt)
}

function dbMarkSynced(sessionId: string): void {
  const db = getDb()
  db.prepare('UPDATE local_sessions SET synced = 1 WHERE id = ?').run(sessionId)
  db.prepare('UPDATE local_messages SET synced = 1 WHERE session_id = ?').run(sessionId)
}

function dbDeleteSession(sessionId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM local_messages WHERE session_id = ?').run(sessionId)
  db.prepare('DELETE FROM local_sessions WHERE id = ?').run(sessionId)
}

function dbUpdateMessageToolCalls(id: string, toolCalls: string): void {
  getDb().prepare(
    'UPDATE local_messages SET tool_calls = ? WHERE id = ?'
  ).run(toolCalls, id)
}

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

// Set app name and identity so Windows taskbar shows "NekoClaw" instead of "Electron"
app.setName('NekoClaw')
if (process.platform === 'win32') {
  app.setAppUserModelId('com.nekoclaw.desktop')
}

// Operation log path (resolved after app ready)
let _opLogPath: string | null = null
function getOpLogPath() {
  if (!_opLogPath) _opLogPath = path.join(app.getPath('userData'), 'operation-log.jsonl')
  return _opLogPath
}

async function appendOpLog(entry: Record<string, unknown>) {
  try {
    const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n'
    await fs.appendFile(getOpLogPath(), line, 'utf-8')
  } catch {
    // best-effort, never throw
  }
}

// Resolve icon path: use app.getAppPath() which is reliable in both dev and prod
function getIconPath(format: 'png' | 'ico' = 'png') {
  const appPath = app.isReady() ? app.getAppPath() : path.join(__dirname, '..')
  return path.join(appPath, 'build', format === 'ico' ? 'icon.ico' : 'icon.png')
}

function getWindowIconPath() {
  return process.platform === 'win32' ? getIconPath('ico') : getIconPath('png')
}

function createWindow() {
  const iconPath = getWindowIconPath()
  const appIcon = nativeImage.createFromPath(iconPath)

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f13',
    titleBarStyle: 'hiddenInset',
    frame: false,
    show: false,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload modules
      webSecurity: false, // allow renderer to fetch external APIs (CORS disabled; contextIsolation still guards node access)
    },
  })

  // Set icon and show window only after renderer is ready, ensuring taskbar gets the correct icon
  win.once('ready-to-show', () => {
    win.setIcon(nativeImage.createFromPath(getWindowIconPath()))
    if (process.platform === 'win32') {
      win.setAppDetails({
        appId: 'com.nekoclaw.desktop',
        appIconPath: getIconPath('ico'),
        appIconIndex: 0,
      })
      win.setTitle('NekoClaw')
    }
    win.show()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  app.setName('NekoClaw')
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Scheduled-task scheduler (node-cron) ──────────────────────────────────
interface ScheduledTaskInfo {
  id: number
  title: string
  description: string
  cron_expr: string | null
  run_at: string | null
  skill_id: string | null
  is_enabled: boolean
}

const _cronJobs = new Map<number, cron.ScheduledTask>()
const _onceTimers = new Map<number, ReturnType<typeof setTimeout>>()

function clearScheduledTask(taskId: number) {
  const job = _cronJobs.get(taskId)
  if (job) { job.stop(); _cronJobs.delete(taskId) }
  const timer = _onceTimers.get(taskId)
  if (timer) { clearTimeout(timer); _onceTimers.delete(taskId) }
}

function fireTask(task: ScheduledTaskInfo) {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send('scheduler:fired', {
      id: task.id,
      title: task.title,
      description: task.description,
      skill_id: task.skill_id,
    })
  }
}

function scheduleTask(task: ScheduledTaskInfo) {
  clearScheduledTask(task.id)
  if (!task.is_enabled) return

  if (task.cron_expr) {
    if (!cron.validate(task.cron_expr)) return
    const job = cron.schedule(task.cron_expr, () => fireTask(task))
    _cronJobs.set(task.id, job)
  } else if (task.run_at) {
    const delay = new Date(task.run_at).getTime() - Date.now()
    if (delay > 0) {
      const timer = setTimeout(() => {
        _onceTimers.delete(task.id)
        fireTask(task)
      }, delay)
      _onceTimers.set(task.id, timer)
    }
    // delay <= 0 means missed — renderer handles detection
  }
}

ipcMain.handle('scheduler:sync', (_e, tasks: ScheduledTaskInfo[]) => {
  // Clear all existing jobs
  for (const id of _cronJobs.keys()) clearScheduledTask(id)
  for (const id of _onceTimers.keys()) clearScheduledTask(id)
  // Schedule each active task
  for (const task of tasks) scheduleTask(task)
  return { scheduled: tasks.filter(t => t.is_enabled).length }
})

ipcMain.handle('scheduler:validate-cron', (_e, expr: string) => {
  return { valid: cron.validate(expr) }
})

// ── IPC: File operations ───────────────────────────────────────────────────
ipcMain.handle('file:read', async (_e, filePath: string) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return { content }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('file:write', async (_e, filePath: string, content: string) => {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    appendOpLog({ type: 'file_write', path: filePath })
    return { success: true }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('file:list', async (_e, dirPath: string) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return {
      entries: entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(dirPath, e.name),
      })),
    }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('file:delete', async (_e, filePath: string) => {
  try {
    await fs.unlink(filePath)
    appendOpLog({ type: 'file_delete', path: filePath })
    return { success: true }
  } catch (err) {
    return { error: String(err) }
  }
})

// ── IPC: Shell execution ───────────────────────────────────────────────────
ipcMain.handle('shell:exec', async (_e, command: string) => {
  try {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    const { stdout, stderr } = await execAsync(command, {
      timeout: 300_000,
      cwd: os.homedir(),
    })
    appendOpLog({ type: 'shell_exec', command, exitCode: 0 })
    return { stdout, stderr }
  } catch (err: any) {
    appendOpLog({ type: 'shell_exec', command, exitCode: err.code ?? 1, error: err.message })
    return { error: err.message, stdout: err.stdout || '', stderr: err.stderr || '' }
  }
})

// ── IPC: Encrypted storage (API keys) ────────────────────────────────────
ipcMain.handle('storage:encrypt', (_e, plaintext: string) => {
  if (safeStorage.isEncryptionAvailable()) {
    const buf = safeStorage.encryptString(plaintext)
    return { encrypted: buf.toString('base64') }
  }
  return { encrypted: Buffer.from(plaintext).toString('base64') }
})

ipcMain.handle('storage:decrypt', (_e, b64: string) => {
  if (safeStorage.isEncryptionAvailable()) {
    const buf = Buffer.from(b64, 'base64')
    return { decrypted: safeStorage.decryptString(buf) }
  }
  return { decrypted: Buffer.from(b64, 'base64').toString('utf-8') }
})

// ── IPC: Window controls ──────────────────────────────────────────────────
ipcMain.on('window:minimize', () => BrowserWindow.getFocusedWindow()?.minimize())
ipcMain.on('window:maximize', () => {
  const win = BrowserWindow.getFocusedWindow()
  if (win?.isMaximized()) win.unmaximize()
  else win?.maximize()
})
ipcMain.on('window:close', () => BrowserWindow.getFocusedWindow()?.close())

// ── IPC: Open external links safely ───────────────────────────────────────
ipcMain.handle('shell:openExternal', async (_e, url: string) => {
  if (url.startsWith('https://') || url.startsWith('http://')) {
    await shell.openExternal(url)
  }
})

// ── IPC: Network tools (web search & HTTP request) ────────────────────────
ipcMain.handle('net:webSearch', async (_e, query: string, maxResults: number, apiKey: string) => {
  if (!apiKey) return { error: 'Tavily API Key 未配置，请在能力面板中设置' }
  try {
    const res = await net.fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults || 5 }),
    })
    const data = await res.json()
    if (!res.ok) return { error: (data as any).detail || `API error: ${res.status}` }
    const results = ((data as any).results || []).map((r: any) => ({
      title: r.title, url: r.url, content: r.content,
    }))
    return { results: JSON.stringify(results) }
  } catch (e: any) {
    return { error: e.message }
  }
})

ipcMain.handle('net:httpRequest', async (_e, opts: { method: string; url: string; headers?: Record<string, string>; body?: string }) => {
  // SSRF prevention: block private/loopback addresses
  try {
    const parsed = new URL(opts.url)
    const hostname = parsed.hostname
    if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) {
      return { error: 'SSRF: requests to localhost are blocked' }
    }
    const parts = hostname.split('.')
    if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
      const first = parseInt(parts[0])
      if (first === 10
        || (first === 172 && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31)
        || (first === 192 && parts[1] === '168')) {
        return { error: 'SSRF: requests to private addresses are blocked' }
      }
    }
  } catch {
    return { error: 'Invalid URL' }
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)
    const isBodyMethod = !['GET', 'HEAD'].includes(opts.method.toUpperCase())
    const res = await net.fetch(opts.url, {
      method: opts.method,
      headers: opts.headers,
      body: isBodyMethod && opts.body ? opts.body : undefined,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const body = await res.text()
    const headers: Record<string, string> = {}
    res.headers.forEach((v, k) => { headers[k] = v })
    return { status_code: res.status, headers, body: body.slice(0, 10000) }
  } catch (e: any) {
    return { error: e.message }
  }
})

// ── IPC: App paths ────────────────────────────────────────────────────────
ipcMain.handle('app:getDataPath', () => app.getPath('userData'))
ipcMain.handle('log:getPath', () => getOpLogPath())

// ── IPC: Local SQLite DB operations ──────────────────────────────────────
ipcMain.handle('db:getSessions', (_e, opts: { onlyUnsynced?: boolean } = {}) => {
  try { return { sessions: dbGetSessions(opts.onlyUnsynced ?? false) } }
  catch (err) { return { error: String(err) } }
})

ipcMain.handle('db:upsertSession', (_e, id: string, title: string, createdAt: number) => {
  try { dbUpsertSession(id, title, createdAt); return { success: true } }
  catch (err) { return { error: String(err) } }
})

ipcMain.handle('db:getMessages', (_e, sessionId: string) => {
  try { return { messages: dbGetMessages(sessionId) } }
  catch (err) { return { error: String(err) } }
})

ipcMain.handle('db:insertMessage', (_e, msg: Omit<DBMessage, 'synced'>) => {
  try { dbInsertMessage(msg); return { success: true } }
  catch (err) { return { error: String(err) } }
})

ipcMain.handle('db:markSynced', (_e, sessionId: string) => {
  try { dbMarkSynced(sessionId); return { success: true } }
  catch (err) { return { error: String(err) } }
})

ipcMain.handle('db:deleteSession', (_e, sessionId: string) => {
  try { dbDeleteSession(sessionId); return { success: true } }
  catch (err) { return { error: String(err) } }
})

ipcMain.handle('db:updateMessageToolCalls', (_e, id: string, toolCalls: string) => {
  try { dbUpdateMessageToolCalls(id, toolCalls); return { success: true } }
  catch (err) { return { error: String(err) } }
})

// ── MemoryService — Markdown memory file I/O ──────────────────────────────
const MEMORY_DIR = path.join(app.getPath('userData'), 'memory')

function validateMemoryPath(relPath: string): string {
  // Reject absolute paths, path traversal, and non-.md extensions
  if (path.isAbsolute(relPath)) throw new Error('Absolute paths not allowed')
  const normalized = path.normalize(relPath)
  if (normalized.startsWith('..') || normalized.includes(`..${path.sep}`)) {
    throw new Error('Path traversal not allowed')
  }
  if (path.extname(normalized) !== '.md' && normalized !== '.') {
    throw new Error('Only .md files are allowed')
  }
  return path.join(MEMORY_DIR, normalized)
}

const MemoryService = {
  async read(relPath: string): Promise<string> {
    const fullPath = validateMemoryPath(relPath)
    try {
      return await fs.readFile(fullPath, 'utf-8')
    } catch {
      return ''
    }
  },

  async write(relPath: string, content: string): Promise<void> {
    const fullPath = validateMemoryPath(relPath)
    // Sanitize: strip ASCII control chars except \n \t
    const sanitized = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, sanitized, 'utf-8')
    appendOpLog({ type: 'memory_write', path: relPath })
  },

  async delete(relPath: string): Promise<void> {
    const fullPath = validateMemoryPath(relPath)
    await fs.unlink(fullPath)
    try {
      const db = getDb()
      db.prepare('DELETE FROM memory_embeddings WHERE file_path = ?').run(relPath)
    } catch { /* embedding table may not exist yet */ }
    appendOpLog({ type: 'memory_delete', path: relPath })
  },

  async list(): Promise<Array<{ name: string; path: string; mtime: number }>> {
    const results: Array<{ name: string; path: string; mtime: number }> = []
    async function walk(dir: string, prefix: string) {
      let entries: import('fs').Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name
        if (e.isDirectory()) {
          await walk(path.join(dir, e.name), rel)
        } else if (e.name.endsWith('.md')) {
          const stat = await fs.stat(path.join(dir, e.name))
          results.push({ name: e.name, path: rel, mtime: stat.mtimeMs })
        }
      }
    }
    await walk(MEMORY_DIR, '')
    // Sort: MEMORY.md first, then by mtime descending
    results.sort((a, b) => {
      if (a.path === 'MEMORY.md') return -1
      if (b.path === 'MEMORY.md') return 1
      return b.mtime - a.mtime
    })
    return results
  },
}

// ── Embedding Service — vector-based memory search ────────────────────────
interface EmbeddingConfig {
  enabled: boolean
  baseUrl: string
  model: string
  apiKey: string // decrypted plain text
}

let _embeddingConfig: EmbeddingConfig | null = null

function ensureEmbeddingTable() {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_embeddings (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      chunk_idx INTEGER NOT NULL,
      chunk     TEXT NOT NULL,
      vector    TEXT NOT NULL,
      UNIQUE(file_path, chunk_idx)
    );
    CREATE INDEX IF NOT EXISTS idx_emb_file ON memory_embeddings(file_path);
  `)
}

/** Split text into paragraphs / chunks (~500 chars each) */
function chunkText(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let buf = ''
  for (const p of paragraphs) {
    if (buf.length + p.length > 500 && buf.length > 0) {
      chunks.push(buf)
      buf = p
    } else {
      buf = buf ? buf + '\n\n' + p : p
    }
  }
  if (buf) chunks.push(buf)
  return chunks.length > 0 ? chunks : [text.slice(0, 500) || '']
}

/** Call OpenAI-compatible embedding API */
async function getEmbeddings(texts: string[], config: EmbeddingConfig): Promise<number[][]> {
  const url = config.baseUrl.replace(/\/$/, '') + '/embeddings'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, input: texts }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`Embedding API error ${res.status}`)
  const data = await res.json() as { data: Array<{ embedding: number[] }> }
  return data.data.map(d => d.embedding)
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1)
}

/** Index a single file's embeddings (upserts chunks) */
async function indexFileEmbeddings(relPath: string) {
  if (!_embeddingConfig?.enabled) return
  try {
    const content = await MemoryService.read(relPath)
    if (!content.trim()) return
    const chunks = chunkText(content)
    const vectors = await getEmbeddings(chunks, _embeddingConfig)
    const db = getDb()
    ensureEmbeddingTable()
    // Delete old chunks for this file
    db.prepare('DELETE FROM memory_embeddings WHERE file_path = ?').run(relPath)
    const insert = db.prepare(
      'INSERT INTO memory_embeddings (file_path, chunk_idx, chunk, vector) VALUES (?, ?, ?, ?)'
    )
    const tx = db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        insert.run(relPath, i, chunks[i], JSON.stringify(vectors[i]))
      }
    })
    tx()
  } catch {
    // best-effort — don't block write operations
  }
}

/** Semantic search across all indexed embeddings */
async function semanticSearch(query: string, topK = 5): Promise<Array<{ path: string; snippet: string; score: number }>> {
  if (!_embeddingConfig?.enabled) throw new Error('Embedding not configured')
  ensureEmbeddingTable()
  const [queryVec] = await getEmbeddings([query], _embeddingConfig)
  const db = getDb()
  const rows = db.prepare('SELECT file_path, chunk, vector FROM memory_embeddings').all() as Array<{
    file_path: string; chunk: string; vector: string
  }>
  const scored = rows.map(r => ({
    path: r.file_path,
    snippet: r.chunk,
    score: cosineSimilarity(queryVec, JSON.parse(r.vector)),
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

/** Pre-build index for all memory files */
async function prebuildEmbeddingIndex() {
  if (!_embeddingConfig?.enabled) return
  try {
    const files = await MemoryService.list()
    ensureEmbeddingTable()
    const db = getDb()
    const indexed = new Set(
      (db.prepare('SELECT DISTINCT file_path FROM memory_embeddings').all() as Array<{ file_path: string }>)
        .map(r => r.file_path)
    )
    for (const f of files) {
      if (!indexed.has(f.path)) {
        await indexFileEmbeddings(f.path)
      }
    }
  } catch {
    // best-effort
  }
}

ipcMain.handle('memory:setEmbeddingConfig', async (_e, config: EmbeddingConfig) => {
  _embeddingConfig = config
  if (config.enabled) {
    ensureEmbeddingTable()
    // Kick off async index build
    prebuildEmbeddingIndex()
  }
  return { success: true }
})

ipcMain.handle('memory:read', async (_e, relPath: string) => {
  try { return { content: await MemoryService.read(relPath) } }
  catch (err) { return { error: String(err) } }
})

ipcMain.handle('memory:write', async (_e, relPath: string, content: string) => {
  try {
    await MemoryService.write(relPath, content)
    // Async update embedding index (fire & forget)
    indexFileEmbeddings(relPath)
    return { success: true }
  } catch (err) { return { error: String(err) } }
})

ipcMain.handle('memory:delete', async (_e, relPath: string) => {
  try { await MemoryService.delete(relPath); return { success: true } }
  catch (err) { return { error: String(err) } }
})

ipcMain.handle('memory:list', async () => {
  try { return { files: await MemoryService.list() } }
  catch (err) { return { error: String(err) } }
})

ipcMain.handle('memory:search', async (_e, query: string) => {
  // Use semantic search if embedding is configured, otherwise keyword fallback
  try {
    if (_embeddingConfig?.enabled) {
      try {
        const results = await semanticSearch(query)
        return { results: results.map(r => ({ path: r.path, snippet: r.snippet })) }
      } catch {
        // Fall through to keyword search
      }
    }
    const files = await MemoryService.list()
    const results: Array<{ path: string; snippet: string }> = []
    const lowerQ = query.toLowerCase()
    for (const f of files) {
      const content = await MemoryService.read(f.path)
      if (!content) continue
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQ)) {
          const start = Math.max(0, i - 1)
          const end = Math.min(lines.length, i + 2)
          results.push({ path: f.path, snippet: lines.slice(start, end).join('\n') })
          break // one match per file
        }
      }
    }
    return { results }
  } catch (err) { return { error: String(err) } }
})

// ── IPC: Migration — promote neko_local_memories.json entries to server ──
// This is a one-shot read; actual upload happens in the renderer after auth.
ipcMain.handle('db:readLegacyLocalMemories', async () => {
  try {
    const filePath = path.join(app.getPath('userData'), 'neko_local_memories.json')
    try { await fs.access(filePath) } catch { return { entries: [] } }
    const raw = await fs.readFile(filePath, 'utf-8')
    const entries: Array<{ id: string; category: string; content: string; created_at: string }> = JSON.parse(raw)
    return { entries: Array.isArray(entries) ? entries : [] }
  } catch { return { entries: [] } }
})

ipcMain.handle('db:deleteLegacyLocalMemories', async () => {
  try {
    const filePath = path.join(app.getPath('userData'), 'neko_local_memories.json')
    await fs.unlink(filePath)
    return { success: true }
  } catch {
    return { success: true } // already gone, treat as success
  }
})

// ── IPC: Browser automation (Playwright, lazy-loaded) ─────────────────────
let _pw: typeof import('playwright-core') | null = null
let _browserContext: import('playwright-core').BrowserContext | null = null
let _browserPage: import('playwright-core').Page | null = null

/** Find an installed Chromium-based browser on the system */
function findSystemBrowser(): string | undefined {
  const candidates = [
    // Chrome Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    // Edge Windows
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(os.homedir(), 'AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe'),
    // Chrome macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    // Chrome Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ]
  const fsSync = require('fs') as typeof import('fs')
  for (const p of candidates) {
    try { if (fsSync.existsSync(p)) return p } catch { /* skip */ }
  }
  return undefined
}

async function ensureBrowserPage(): Promise<import('playwright-core').Page> {
  if (_browserPage && !_browserPage.isClosed()) return _browserPage
  if (!_pw) {
    _pw = require('playwright-core') as typeof import('playwright-core')
  }
  const executablePath = findSystemBrowser()
  if (!executablePath) {
    throw new Error('未找到 Chrome 或 Edge 浏览器，请安装后再试。')
  }
  const browser = await _pw.chromium.launch({ headless: false, executablePath })
  _browserContext = await browser.newContext()
  _browserPage = await _browserContext.newPage()
  return _browserPage
}

ipcMain.handle('browser:navigate', async (_e, url: string) => {
  try {
    const page = await ensureBrowserPage()
    await page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' })
    appendOpLog({ type: 'browser_navigate', url })
    return { url: page.url(), title: await page.title() }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('browser:screenshot', async () => {
  try {
    const page = await ensureBrowserPage()
    const buf = await page.screenshot({ type: 'png' })
    return { base64: buf.toString('base64') }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('browser:click', async (_e, opts: { selector?: string; x?: number; y?: number }) => {
  try {
    const page = await ensureBrowserPage()
    if (opts.selector) {
      await page.click(opts.selector, { timeout: 10_000 })
    } else if (opts.x !== undefined && opts.y !== undefined) {
      await page.mouse.click(opts.x, opts.y)
    } else {
      return { error: '需要提供 selector 或 x/y 坐标' }
    }
    return { success: true }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('browser:type', async (_e, selector: string, text: string) => {
  try {
    const page = await ensureBrowserPage()
    await page.fill(selector, text, { timeout: 10_000 })
    return { success: true }
  } catch (err) {
    return { error: String(err) }
  }
})

// Cleanup browser on app quit
app.on('before-quit', () => {
  _browserContext?.browser()?.close().catch(() => {})
  shutdownKnowledge().catch(() => {})
})

// ── IPC: Knowledge base ───────────────────────────────────────────────────

ipcMain.handle('knowledge:hasIndex', () => {
  return { hasIndex: knowledgeHasIndex() }
})

ipcMain.handle('knowledge:search', async (_e, query: string, topK?: number) => {
  try {
    const results = await searchKnowledge(query, topK ?? 5)
    return { results }
  } catch (err) {
    return { error: String(err), results: [] }
  }
})

ipcMain.handle('knowledge:setDir', async (_e, dir: string | null) => {
  try {
    await setKnowledgeDir(dir)
    return { success: true }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('knowledge:getDir', () => {
  return { dir: getKnowledgeDir() }
})

ipcMain.handle('knowledge:setEmbeddingConfig', (_e, config: KnowledgeEmbeddingConfig | null) => {
  setKnowledgeEmbedding(config)
  return { success: true }
})
