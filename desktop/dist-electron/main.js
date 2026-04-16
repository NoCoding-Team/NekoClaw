"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const path = require("path");
const fs = require("fs/promises");
const os = require("os");
let _db = null;
function getDb() {
  if (_db) return _db;
  const Database = require("better-sqlite3");
  const dbPath = path.join(electron.app.getPath("userData"), "neko.db");
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS local_sessions (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      synced     INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS local_messages (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES local_sessions(id) ON DELETE CASCADE,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      tool_calls  TEXT,
      token_count INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      synced      INTEGER NOT NULL DEFAULT 0
    );
  `);
  return _db;
}
function dbGetSessions(onlyUnsynced = false) {
  const db = getDb();
  const sql = onlyUnsynced ? "SELECT id, title, created_at as createdAt, synced FROM local_sessions WHERE synced = 0 ORDER BY created_at DESC" : "SELECT id, title, created_at as createdAt, synced FROM local_sessions ORDER BY created_at DESC";
  return db.prepare(sql).all();
}
function dbUpsertSession(id, title, createdAt) {
  getDb().prepare(
    "INSERT INTO local_sessions (id, title, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title"
  ).run(id, title, createdAt);
}
function dbGetMessages(sessionId) {
  return getDb().prepare(
    "SELECT id, session_id as sessionId, role, content, tool_calls as toolCalls, token_count as tokenCount, created_at as createdAt, synced FROM local_messages WHERE session_id = ? ORDER BY created_at ASC"
  ).all(sessionId);
}
function dbInsertMessage(msg) {
  getDb().prepare(
    "INSERT OR IGNORE INTO local_messages (id, session_id, role, content, tool_calls, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(msg.id, msg.sessionId, msg.role, msg.content, msg.toolCalls ?? null, msg.tokenCount, msg.createdAt);
}
function dbMarkSynced(sessionId) {
  const db = getDb();
  db.prepare("UPDATE local_sessions SET synced = 1 WHERE id = ?").run(sessionId);
  db.prepare("UPDATE local_messages SET synced = 1 WHERE session_id = ?").run(sessionId);
}
function dbDeleteSession(sessionId) {
  const db = getDb();
  db.prepare("DELETE FROM local_messages WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM local_sessions WHERE id = ?").run(sessionId);
}
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
electron.app.setName("NekoClaw");
if (process.platform === "win32") {
  electron.app.setAppUserModelId("com.nekoclaw.desktop");
}
let _opLogPath = null;
function getOpLogPath() {
  if (!_opLogPath) _opLogPath = path.join(electron.app.getPath("userData"), "operation-log.jsonl");
  return _opLogPath;
}
async function appendOpLog(entry) {
  try {
    const line = JSON.stringify({ ...entry, ts: (/* @__PURE__ */ new Date()).toISOString() }) + "\n";
    await fs.appendFile(getOpLogPath(), line, "utf-8");
  } catch {
  }
}
function getIconPath(format = "png") {
  const appPath = electron.app.isReady() ? electron.app.getAppPath() : path.join(__dirname, "..");
  return path.join(appPath, "build", format === "ico" ? "icon.ico" : "icon.png");
}
function getWindowIconPath() {
  return process.platform === "win32" ? getIconPath("ico") : getIconPath("png");
}
function createWindow() {
  const iconPath = getWindowIconPath();
  const appIcon = electron.nativeImage.createFromPath(iconPath);
  const win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0f0f13",
    titleBarStyle: "hiddenInset",
    frame: false,
    show: false,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // needed for preload modules
      webSecurity: false
      // allow renderer to fetch external APIs (CORS disabled; contextIsolation still guards node access)
    }
  });
  win.once("ready-to-show", () => {
    win.setIcon(electron.nativeImage.createFromPath(getWindowIconPath()));
    if (process.platform === "win32") {
      win.setAppDetails({
        appId: "com.nekoclaw.desktop",
        appIconPath: getIconPath("ico"),
        appIconIndex: 0
      });
      win.setTitle("NekoClaw");
    }
    win.show();
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  return win;
}
electron.app.whenReady().then(() => {
  electron.app.setName("NekoClaw");
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.ipcMain.handle("file:read", async (_e, filePath) => {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return { content };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("file:write", async (_e, filePath, content) => {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    appendOpLog({ type: "file_write", path: filePath });
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("file:list", async (_e, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return {
      entries: entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(dirPath, e.name)
      }))
    };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("file:delete", async (_e, filePath) => {
  try {
    await fs.unlink(filePath);
    appendOpLog({ type: "file_delete", path: filePath });
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("shell:exec", async (_e, command) => {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    const { stdout, stderr } = await execAsync(command, {
      timeout: 3e5,
      cwd: os.homedir()
    });
    appendOpLog({ type: "shell_exec", command, exitCode: 0 });
    return { stdout, stderr };
  } catch (err) {
    appendOpLog({ type: "shell_exec", command, exitCode: err.code ?? 1, error: err.message });
    return { error: err.message, stdout: err.stdout || "", stderr: err.stderr || "" };
  }
});
electron.ipcMain.handle("storage:encrypt", (_e, plaintext) => {
  if (electron.safeStorage.isEncryptionAvailable()) {
    const buf = electron.safeStorage.encryptString(plaintext);
    return { encrypted: buf.toString("base64") };
  }
  return { encrypted: Buffer.from(plaintext).toString("base64") };
});
electron.ipcMain.handle("storage:decrypt", (_e, b64) => {
  if (electron.safeStorage.isEncryptionAvailable()) {
    const buf = Buffer.from(b64, "base64");
    return { decrypted: electron.safeStorage.decryptString(buf) };
  }
  return { decrypted: Buffer.from(b64, "base64").toString("utf-8") };
});
electron.ipcMain.on("window:minimize", () => {
  var _a;
  return (_a = electron.BrowserWindow.getFocusedWindow()) == null ? void 0 : _a.minimize();
});
electron.ipcMain.on("window:maximize", () => {
  const win = electron.BrowserWindow.getFocusedWindow();
  if (win == null ? void 0 : win.isMaximized()) win.unmaximize();
  else win == null ? void 0 : win.maximize();
});
electron.ipcMain.on("window:close", () => {
  var _a;
  return (_a = electron.BrowserWindow.getFocusedWindow()) == null ? void 0 : _a.close();
});
electron.ipcMain.handle("shell:openExternal", async (_e, url) => {
  if (url.startsWith("https://") || url.startsWith("http://")) {
    await electron.shell.openExternal(url);
  }
});
electron.ipcMain.handle("app:getDataPath", () => electron.app.getPath("userData"));
electron.ipcMain.handle("log:getPath", () => getOpLogPath());
electron.ipcMain.handle("db:getSessions", (_e, opts = {}) => {
  try {
    return { sessions: dbGetSessions(opts.onlyUnsynced ?? false) };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("db:upsertSession", (_e, id, title, createdAt) => {
  try {
    dbUpsertSession(id, title, createdAt);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("db:getMessages", (_e, sessionId) => {
  try {
    return { messages: dbGetMessages(sessionId) };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("db:insertMessage", (_e, msg) => {
  try {
    dbInsertMessage(msg);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("db:markSynced", (_e, sessionId) => {
  try {
    dbMarkSynced(sessionId);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("db:deleteSession", (_e, sessionId) => {
  try {
    dbDeleteSession(sessionId);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
const MEMORY_DIR = path.join(electron.app.getPath("userData"), "memory");
function validateMemoryPath(relPath) {
  if (path.isAbsolute(relPath)) throw new Error("Absolute paths not allowed");
  const normalized = path.normalize(relPath);
  if (normalized.startsWith("..") || normalized.includes(`..${path.sep}`)) {
    throw new Error("Path traversal not allowed");
  }
  if (path.extname(normalized) !== ".md" && normalized !== ".") {
    throw new Error("Only .md files are allowed");
  }
  return path.join(MEMORY_DIR, normalized);
}
const MemoryService = {
  async read(relPath) {
    const fullPath = validateMemoryPath(relPath);
    try {
      return await fs.readFile(fullPath, "utf-8");
    } catch {
      return "";
    }
  },
  async write(relPath, content) {
    const fullPath = validateMemoryPath(relPath);
    const sanitized = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, sanitized, "utf-8");
    appendOpLog({ type: "memory_write", path: relPath });
  },
  async delete(relPath) {
    const fullPath = validateMemoryPath(relPath);
    await fs.unlink(fullPath);
    try {
      const db = getDb();
      db.prepare("DELETE FROM memory_embeddings WHERE file_path = ?").run(relPath);
    } catch {
    }
    appendOpLog({ type: "memory_delete", path: relPath });
  },
  async list() {
    const results = [];
    async function walk(dir, prefix) {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) {
          await walk(path.join(dir, e.name), rel);
        } else if (e.name.endsWith(".md")) {
          const stat = await fs.stat(path.join(dir, e.name));
          results.push({ name: e.name, path: rel, mtime: stat.mtimeMs });
        }
      }
    }
    await walk(MEMORY_DIR, "");
    results.sort((a, b) => {
      if (a.path === "MEMORY.md") return -1;
      if (b.path === "MEMORY.md") return 1;
      return b.mtime - a.mtime;
    });
    return results;
  }
};
let _embeddingConfig = null;
function ensureEmbeddingTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_embeddings (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      chunk_idx INTEGER NOT NULL,
      chunk     TEXT NOT NULL,
      vector    TEXT NOT NULL,
      UNIQUE(file_path, chunk_idx)
    );
    CREATE INDEX IF NOT EXISTS idx_emb_file ON memory_embeddings(file_path);
  `);
}
function chunkText(text) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = "";
  for (const p of paragraphs) {
    if (buf.length + p.length > 500 && buf.length > 0) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length > 0 ? chunks : [text.slice(0, 500) || ""];
}
async function getEmbeddings(texts, config) {
  const url = config.baseUrl.replace(/\/$/, "") + "/embeddings";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({ model: config.model, input: texts }),
    signal: AbortSignal.timeout(3e4)
  });
  if (!res.ok) throw new Error(`Embedding API error ${res.status}`);
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}
async function indexFileEmbeddings(relPath) {
  if (!(_embeddingConfig == null ? void 0 : _embeddingConfig.enabled)) return;
  try {
    const content = await MemoryService.read(relPath);
    if (!content.trim()) return;
    const chunks = chunkText(content);
    const vectors = await getEmbeddings(chunks, _embeddingConfig);
    const db = getDb();
    ensureEmbeddingTable();
    db.prepare("DELETE FROM memory_embeddings WHERE file_path = ?").run(relPath);
    const insert = db.prepare(
      "INSERT INTO memory_embeddings (file_path, chunk_idx, chunk, vector) VALUES (?, ?, ?, ?)"
    );
    const tx = db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        insert.run(relPath, i, chunks[i], JSON.stringify(vectors[i]));
      }
    });
    tx();
  } catch {
  }
}
async function semanticSearch(query, topK = 5) {
  if (!(_embeddingConfig == null ? void 0 : _embeddingConfig.enabled)) throw new Error("Embedding not configured");
  ensureEmbeddingTable();
  const [queryVec] = await getEmbeddings([query], _embeddingConfig);
  const db = getDb();
  const rows = db.prepare("SELECT file_path, chunk, vector FROM memory_embeddings").all();
  const scored = rows.map((r) => ({
    path: r.file_path,
    snippet: r.chunk,
    score: cosineSimilarity(queryVec, JSON.parse(r.vector))
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
async function prebuildEmbeddingIndex() {
  if (!(_embeddingConfig == null ? void 0 : _embeddingConfig.enabled)) return;
  try {
    const files = await MemoryService.list();
    ensureEmbeddingTable();
    const db = getDb();
    const indexed = new Set(
      db.prepare("SELECT DISTINCT file_path FROM memory_embeddings").all().map((r) => r.file_path)
    );
    for (const f of files) {
      if (!indexed.has(f.path)) {
        await indexFileEmbeddings(f.path);
      }
    }
  } catch {
  }
}
electron.ipcMain.handle("memory:setEmbeddingConfig", async (_e, config) => {
  _embeddingConfig = config;
  if (config.enabled) {
    ensureEmbeddingTable();
    prebuildEmbeddingIndex();
  }
  return { success: true };
});
electron.ipcMain.handle("memory:read", async (_e, relPath) => {
  try {
    return { content: await MemoryService.read(relPath) };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("memory:write", async (_e, relPath, content) => {
  try {
    await MemoryService.write(relPath, content);
    indexFileEmbeddings(relPath);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("memory:delete", async (_e, relPath) => {
  try {
    await MemoryService.delete(relPath);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("memory:list", async () => {
  try {
    return { files: await MemoryService.list() };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("memory:search", async (_e, query) => {
  try {
    if (_embeddingConfig == null ? void 0 : _embeddingConfig.enabled) {
      try {
        const results2 = await semanticSearch(query);
        return { results: results2.map((r) => ({ path: r.path, snippet: r.snippet })) };
      } catch {
      }
    }
    const files = await MemoryService.list();
    const results = [];
    const lowerQ = query.toLowerCase();
    for (const f of files) {
      const content = await MemoryService.read(f.path);
      if (!content) continue;
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQ)) {
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length, i + 2);
          results.push({ path: f.path, snippet: lines.slice(start, end).join("\n") });
          break;
        }
      }
    }
    return { results };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("db:readLegacyLocalMemories", async () => {
  try {
    const filePath = path.join(electron.app.getPath("userData"), "neko_local_memories.json");
    try {
      await fs.access(filePath);
    } catch {
      return { entries: [] };
    }
    const raw = await fs.readFile(filePath, "utf-8");
    const entries = JSON.parse(raw);
    return { entries: Array.isArray(entries) ? entries : [] };
  } catch {
    return { entries: [] };
  }
});
electron.ipcMain.handle("db:deleteLegacyLocalMemories", async () => {
  try {
    const filePath = path.join(electron.app.getPath("userData"), "neko_local_memories.json");
    await fs.unlink(filePath);
    return { success: true };
  } catch {
    return { success: true };
  }
});
//# sourceMappingURL=main.js.map
