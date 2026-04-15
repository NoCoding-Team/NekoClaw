"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const nekoBridge = {
  file: {
    read: (path) => electron.ipcRenderer.invoke("file:read", path),
    write: (path, content) => electron.ipcRenderer.invoke("file:write", path, content),
    list: (dir) => electron.ipcRenderer.invoke("file:list", dir),
    delete: (path) => electron.ipcRenderer.invoke("file:delete", path)
  },
  shell: {
    exec: (command) => electron.ipcRenderer.invoke("shell:exec", command),
    openExternal: (url) => electron.ipcRenderer.invoke("shell:openExternal", url)
  },
  storage: {
    encrypt: (plaintext) => electron.ipcRenderer.invoke("storage:encrypt", plaintext),
    decrypt: (b64) => electron.ipcRenderer.invoke("storage:decrypt", b64)
  },
  window: {
    minimize: () => electron.ipcRenderer.send("window:minimize"),
    maximize: () => electron.ipcRenderer.send("window:maximize"),
    close: () => electron.ipcRenderer.send("window:close")
  },
  app: {
    getDataPath: () => electron.ipcRenderer.invoke("app:getDataPath")
  },
  log: {
    getPath: () => electron.ipcRenderer.invoke("log:getPath")
  },
  memory: {
    read: (path) => electron.ipcRenderer.invoke("memory:read", path),
    write: (path, content) => electron.ipcRenderer.invoke("memory:write", path, content),
    list: () => electron.ipcRenderer.invoke("memory:list"),
    search: (query) => electron.ipcRenderer.invoke("memory:search", query),
    setEmbeddingConfig: (config) => electron.ipcRenderer.invoke("memory:setEmbeddingConfig", config)
  },
  db: {
    getSessions: (opts) => electron.ipcRenderer.invoke("db:getSessions", opts ?? {}),
    upsertSession: (id, title, createdAt) => electron.ipcRenderer.invoke("db:upsertSession", id, title, createdAt),
    getMessages: (sessionId) => electron.ipcRenderer.invoke("db:getMessages", sessionId).then((r) => r.messages ?? []),
    insertMessage: (msg) => electron.ipcRenderer.invoke("db:insertMessage", msg),
    markSynced: (sessionId) => electron.ipcRenderer.invoke("db:markSynced", sessionId),
    readLegacyLocalMemories: () => electron.ipcRenderer.invoke("db:readLegacyLocalMemories"),
    deleteLegacyLocalMemories: () => electron.ipcRenderer.invoke("db:deleteLegacyLocalMemories")
  }
};
electron.contextBridge.exposeInMainWorld("nekoBridge", nekoBridge);
exports.nekoBridge = nekoBridge;
//# sourceMappingURL=preload.js.map
