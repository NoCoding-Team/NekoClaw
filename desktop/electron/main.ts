import { app, BrowserWindow, ipcMain, nativeImage, safeStorage, shell } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'

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
