/**
 * Embeds the NekoClaw icon into the local electron.exe binary.
 * Runs automatically via postinstall so dev mode shows the correct icon.
 */
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { execFileSync } from 'child_process'

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
  const rcOptions = {
    icon: icoPath,
    'version-string': {
      CompanyName: 'NekoClaw',
      FileDescription: 'NekoClaw',
      ProductName: 'NekoClaw',
      InternalName: 'NekoClaw',
      OriginalFilename: 'NekoClaw.exe',
    },
  }

  try {
    await rcedit(exePath, rcOptions)
  } catch (firstErr) {
    if (process.platform === 'win32') {
      // electron.exe is often locked by a running dev process; stop it then retry once.
      try {
        execFileSync('taskkill', ['/IM', 'electron.exe', '/F'], { stdio: 'ignore' })
      } catch {
        // Ignore when process does not exist.
      }
      await rcedit(exePath, rcOptions)
    } else {
      throw firstErr
    }
  }

  console.log('[set-icon] NekoClaw icon and metadata embedded into electron.exe')
} catch (err) {
  // Keep non-fatal behavior so install/dev is not blocked by icon resource update.
  console.warn('[set-icon] Could not embed icon after retry:', err.message)
}
