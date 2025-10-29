// Electron 메인

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

function loadConfig() {
  const p = path.join(__dirname, "config.json");
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 640,
    resizable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile("index.html");

  ipcMain.handle("win:set-always-on-top", (event, flag) => {
    const bw = BrowserWindow.fromWebContents(event.sender);
    if (!bw) return false;
    bw.setAlwaysOnTop(!!flag, "screen-saver"); // 우선순위 레벨
    // (선택) 모든 워크스페이스 위에 보이기
    bw.setVisibleOnAllWorkspaces(!!flag, { visibleOnFullScreen: !!flag });
    return bw.isAlwaysOnTop();
  });
}

app.whenReady().then(() => {
  ipcMain.handle("config:load", () => loadConfig());
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
