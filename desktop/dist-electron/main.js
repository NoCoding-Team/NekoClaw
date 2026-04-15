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
