/**
 * Execute a client-side tool via Electron IPC bridge.
 */
export async function executeLocalTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const bridge = window.nekoBridge

  switch (toolName) {
    // ── Memory tools ──────────────────────────────────────────────────
    case 'memory_read':
      return bridge.memory.read(args.path as string)

    case 'memory_write':
      return bridge.memory.write(args.path as string, args.content as string)

    case 'memory_search':
      return bridge.memory.search(args.query as string)

    // ── File tools ────────────────────────────────────────────────────
    case 'file_read':
      return bridge.file.read(args.path as string)

    case 'file_write':
      return bridge.file.write(args.path as string, args.content as string)

    case 'file_list':
      return bridge.file.list(args.path as string)

    case 'file_delete':
      return bridge.file.delete(args.path as string)

    case 'shell_exec':
      return bridge.shell.exec(args.command as string)

    case 'browser_navigate':
    case 'browser_screenshot':
    case 'browser_click':
    case 'browser_type':
      // Browser tools are handled via a dedicated BrowserWorker
      // For now, delegate to the browser worker handler
      return executeBrowserTool(toolName, args)

    default:
      return { error: `Unknown client tool: ${toolName}` }
  }
}

// Lazy-initialize browser worker
let browserWorker: Worker | null = null
let browserWorkerTimer: ReturnType<typeof setTimeout> | null = null
const BROWSER_WORKER_IDLE_MS = 5 * 60 * 1000

function getBrowserWorker(): Worker {
  if (!browserWorker) {
    browserWorker = new Worker(new URL('./browserWorker.ts', import.meta.url), { type: 'module' })
  }
  resetBrowserIdleTimer()
  return browserWorker
}

function resetBrowserIdleTimer() {
  if (browserWorkerTimer) clearTimeout(browserWorkerTimer)
  browserWorkerTimer = setTimeout(() => {
    browserWorker?.terminate()
    browserWorker = null
    browserWorkerTimer = null
  }, BROWSER_WORKER_IDLE_MS)
}

function executeBrowserTool(toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const worker = getBrowserWorker()
    const id = Math.random().toString(36).slice(2)
    const onMsg = (ev: MessageEvent) => {
      if (ev.data.id === id) {
        worker.removeEventListener('message', onMsg)
        resolve(ev.data.result)
      }
    }
    worker.addEventListener('message', onMsg)
    worker.postMessage({ id, tool: toolName, args })
  })
}
