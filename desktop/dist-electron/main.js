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
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0f0f13",
    titleBarStyle: "hiddenInset",
    frame: false,
    icon: path.join(__dirname, "../build/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
      // needed for preload modules
    }
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  return win;
}
electron.app.whenReady().then(() => {
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
    return { stdout, stderr };
  } catch (err) {
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
//# sourceMappingURL=main.js.map
