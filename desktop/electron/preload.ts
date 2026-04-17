import { contextBridge, ipcRenderer } from 'electron'

export const nekoBridge = {
  file: {
    read: (path: string) => ipcRenderer.invoke('file:read', path),
    write: (path: string, content: string) => ipcRenderer.invoke('file:write', path, content),
    list: (dir: string) => ipcRenderer.invoke('file:list', dir),
    delete: (path: string) => ipcRenderer.invoke('file:delete', path),
  },
  shell: {
    exec: (command: string) => ipcRenderer.invoke('shell:exec', command),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
  storage: {
    encrypt: (plaintext: string) => ipcRenderer.invoke('storage:encrypt', plaintext),
    decrypt: (b64: string) => ipcRenderer.invoke('storage:decrypt', b64),
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  app: {
    getDataPath: (): Promise<string> => ipcRenderer.invoke('app:getDataPath'),
  },
  log: {
    getPath: (): Promise<string> => ipcRenderer.invoke('log:getPath'),
  },
  browser: {
    navigate: (url: string) => ipcRenderer.invoke('browser:navigate', url),
    screenshot: () => ipcRenderer.invoke('browser:screenshot'),
    click: (opts: { selector?: string; x?: number; y?: number }) => ipcRenderer.invoke('browser:click', opts),
    type: (selector: string, text: string) => ipcRenderer.invoke('browser:type', selector, text),
  },
  net: {
    webSearch: (query: string, maxResults: number, apiKey: string) =>
      ipcRenderer.invoke('net:webSearch', query, maxResults, apiKey),
    httpRequest: (opts: { method: string; url: string; headers?: Record<string, string>; body?: string }) =>
      ipcRenderer.invoke('net:httpRequest', opts),
  },
  memory: {
    read: (path: string) => ipcRenderer.invoke('memory:read', path),
    write: (path: string, content: string) => ipcRenderer.invoke('memory:write', path, content),
    delete: (path: string) => ipcRenderer.invoke('memory:delete', path),
    list: () => ipcRenderer.invoke('memory:list'),
    search: (query: string) => ipcRenderer.invoke('memory:search', query),
    setEmbeddingConfig: (config: { enabled: boolean; baseUrl: string; model: string; apiKey: string }) =>
      ipcRenderer.invoke('memory:setEmbeddingConfig', config),
  },
  db: {
    getSessions: (opts?: { onlyUnsynced?: boolean }): Promise<{
      sessions?: Array<{ id: string; title: string; createdAt: number; synced: number }>
      error?: string
    }> => ipcRenderer.invoke('db:getSessions', opts ?? {}),

    upsertSession: (id: string, title: string, createdAt: number): Promise<{ success?: boolean; error?: string }> =>
      ipcRenderer.invoke('db:upsertSession', id, title, createdAt),

    getMessages: (sessionId: string): Promise<Array<{
      id: string; sessionId: string; role: string; content: string
      toolCalls: string | null; tokenCount: number; createdAt: number; synced: number
    }>> => ipcRenderer.invoke('db:getMessages', sessionId).then((r: any) => r.messages ?? []),

    insertMessage: (msg: {
      id: string; sessionId: string; role: string; content: string
      toolCalls?: string | null; tokenCount?: number; createdAt: number
    }): Promise<{ success?: boolean; error?: string }> =>
      ipcRenderer.invoke('db:insertMessage', msg),

    markSynced: (sessionId: string): Promise<{ success?: boolean; error?: string }> =>
      ipcRenderer.invoke('db:markSynced', sessionId),

    deleteSession: (sessionId: string): Promise<{ success?: boolean; error?: string }> =>
      ipcRenderer.invoke('db:deleteSession', sessionId),

    updateMessageToolCalls: (id: string, toolCalls: string): Promise<{ success?: boolean; error?: string }> =>
      ipcRenderer.invoke('db:updateMessageToolCalls', id, toolCalls),

    readLegacyLocalMemories: (): Promise<{
      entries: Array<{ id: string; category: string; content: string; created_at: string }>
    }> => ipcRenderer.invoke('db:readLegacyLocalMemories'),

    deleteLegacyLocalMemories: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('db:deleteLegacyLocalMemories'),
  },
  scheduler: {
    sync: (tasks: Array<{
      id: number; title: string; description: string
      cron_expr: string | null; run_at: string | null
      skill_id: string | null; is_enabled: boolean
    }>): Promise<{ scheduled: number }> => ipcRenderer.invoke('scheduler:sync', tasks),

    validateCron: (expr: string): Promise<{ valid: boolean }> =>
      ipcRenderer.invoke('scheduler:validate-cron', expr),

    onFired: (callback: (task: { id: number; title: string; description: string; skill_id: string | null }) => void) => {
      const handler = (_e: any, task: any) => callback(task)
      ipcRenderer.on('scheduler:fired', handler)
      return () => { ipcRenderer.removeListener('scheduler:fired', handler) }
    },
  },
}

contextBridge.exposeInMainWorld('nekoBridge', nekoBridge)
