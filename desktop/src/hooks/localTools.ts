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
      // Browser automation requires Playwright in the Electron main process — not yet implemented
      return Promise.resolve({ error: '浏览器自动化功能尚未实现，请稍后使用。' })

    default:
      return { error: `Unknown client tool: ${toolName}` }
  }
}
