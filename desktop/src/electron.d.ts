interface NekoBridgeFile {
  read(path: string): Promise<{ content?: string; error?: string }>
  write(path: string, content: string): Promise<{ success?: boolean; error?: string }>
  list(dir: string): Promise<{ entries?: Array<{ name: string; isDirectory: boolean; path: string }>; error?: string }>
  delete(path: string): Promise<{ success?: boolean; error?: string }>
}

interface NekoBridgeShell {
  exec(command: string): Promise<{ stdout?: string; stderr?: string; error?: string }>
  openExternal(url: string): Promise<void>
}

interface NekoBridgeStorage {
  encrypt(plaintext: string): Promise<{ encrypted: string }>
  decrypt(b64: string): Promise<{ decrypted: string }>
}

interface NekoBridgeWindow {
  minimize(): void
  maximize(): void
  close(): void
}

interface NekoBridgeApp {
  getDataPath(): Promise<string>
}

interface NekoBridgeLog {
  getPath(): Promise<string>
}

interface NekoBridge {
  file: NekoBridgeFile
  shell: NekoBridgeShell
  storage: NekoBridgeStorage
  window: NekoBridgeWindow
  app: NekoBridgeApp
  log: NekoBridgeLog
}

declare interface Window {
  nekoBridge: NekoBridge
}
