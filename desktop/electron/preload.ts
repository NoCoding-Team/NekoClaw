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

    readLegacyLocalMemories: (): Promise<{
      entries: Array<{ id: string; category: string; content: string; created_at: string }>
    }> => ipcRenderer.invoke('db:readLegacyLocalMemories'),

    deleteLegacyLocalMemories: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('db:deleteLegacyLocalMemories'),
  },
}

contextBridge.exposeInMainWorld('nekoBridge', nekoBridge)
