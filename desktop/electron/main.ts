import { app, BrowserWindow, ipcMain, nativeImage, safeStorage, shell } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'

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
