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
}

contextBridge.exposeInMainWorld('nekoBridge', nekoBridge)
