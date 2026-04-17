import { useAppStore } from '../store/app'

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
      return bridge.browser.navigate(args.url as string)

    case 'browser_screenshot':
      return bridge.browser.screenshot()

    case 'browser_click':
      return bridge.browser.click({ selector: args.selector as string | undefined, x: args.x as number | undefined, y: args.y as number | undefined })

    case 'browser_type':
      return bridge.browser.type(args.selector as string, args.text as string)

    // ── Network tools ─────────────────────────────────────────────────
    case 'web_search': {
      const tavilyApiKey = useAppStore.getState().toolsConfig.tavilyApiKey
      return bridge.net.webSearch(args.query as string, (args.max_results as number) ?? 5, tavilyApiKey)
    }

    case 'http_request':
      return bridge.net.httpRequest({
        method: args.method as string,
        url: args.url as string,
        headers: (args.headers as Record<string, string>) ?? {},
        body: (args.body as string) ?? '',
      })

    default:
      return { error: `Unknown client tool: ${toolName}` }
  }
}
