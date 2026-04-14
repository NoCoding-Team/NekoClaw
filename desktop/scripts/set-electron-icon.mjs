/**
 * Embeds the NekoClaw icon into the local electron.exe binary.
 * Runs automatically via postinstall so dev mode shows the correct icon.
 */
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const exePath = path.resolve(__dirname, '../node_modules/electron/dist/electron.exe')
const icoPath = path.resolve(__dirname, '../build/icon.ico')

if (!fs.existsSync(exePath)) {
  console.log('[set-icon] electron.exe not found, skipping (non-Windows or not installed yet)')
  process.exit(0)
}

if (!fs.existsSync(icoPath)) {
  console.warn('[set-icon] build/icon.ico not found, skipping')
  process.exit(0)
}

try {
  const { rcedit } = require('rcedit')
  await rcedit(exePath, { icon: icoPath })
  console.log('[set-icon] NekoClaw icon embedded into electron.exe')
} catch (err) {
  // Non-fatal: electron may be running (locked), or on non-Windows
  console.warn('[set-icon] Could not embed icon (electron may be running):', err.message)
}
