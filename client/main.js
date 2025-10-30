// Electron 메인

const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");

const PROGRAM_DATA_CFG = "C:\\ProgramData\\RadMessenger\\client\\config.json";
const DEFAULT_CFG_IN_RES = path.join(
  process.resourcesPath,
  "config.default.json",
);

function ensureProgramDataConfig() {
  try {
    const dir = path.dirname(PROGRAM_DATA_CFG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (!fs.existsSync(PROGRAM_DATA_CFG)) {
      const fallback = fs.existsSync(DEFAULT_CFG_IN_RES)
        ? fs.readFileSync(DEFAULT_CFG_IN_RES, "utf-8")
        : JSON.stringify(
            {
              serverUrl: "http://192.168.10.70:3030",
              displayName: "MRI",
              defaultRoom: "1",
              alwaysOnTop: true,
              soundEnabled: true,
              soundVolume: 0.8,
            },
            null,
            2,
          );

      fs.writeFileSync(PROGRAM_DATA_CFG, fallback, "utf-8");
    }
  } catch (e) {
    console.warn("[config] ensureProgramDataConfig failed:", e);
  }
}

// app.whenReady() 전에 호출해도 무방
ensureProgramDataConfig();

// ---- 공통 유틸 ----
function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}
function sanitizeServerUrl(raw) {
  try {
    const s = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    const u = new URL(s);
    const proto =
      u.protocol === "http:" || u.protocol === "https:" ? u.protocol : "http:";
    const host = u.hostname;
    const port = u.port || "3030";
    return { proto, host, port }; // 정규화된 요소 반환
  } catch {
    return { proto: "https:", host: "192.168.0.10", port: "3030" };
  }
}

// ---------- main용 config 로더 ----------
function loadConfigForMain() {
  const devPath = path.join(__dirname, "config.json");
  const sysPath = "C:\\ProgramData\\RadMessenger\\client\\config.json";
  const localPath = path.join(process.resourcesPath, "config.default.json");

  return (
    readJsonSafe(devPath) ||
    readJsonSafe(sysPath) ||
    readJsonSafe(localPath) || {
      serverUrl: "http://192.168.0.10:3030",
      displayName: "Unknown",
      defaultRoom: "1",
      alwaysOnTop: false,
      soundEnabled: true,
      soundVolume: 1,
    }
  );
}

// ---------- 동적 CSP 구성 ----------
let cspInstalled = false; // 중복 설치 방지
function setDynamicCSP(serverUrl) {
  if (cspInstalled) return; // 이미 설치면 스킵
  cspInstalled = true;
  const { proto, host, port } = sanitizeServerUrl(serverUrl);
  const httpOrigin = `${proto}//${host}:${port}`;
  const wsOrigin = `ws://${host}:${port}`;

  // 필요 자원만 열어둡니다. (data:/blob:는 오디오/이미지 등에 대비)
  const csp = [
    `default-src 'self'`,
    `script-src 'self'`, // CDN 쓰면 여기에 도메인 추가
    `connect-src 'self' ${httpOrigin} ${wsOrigin} data: blob:`,
    `img-src 'self' data:`,
    `style-src 'self' 'unsafe-inline'`,
    `font-src 'self'`,
    `base-uri 'none'`,
  ].join("; ");

  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}

function createWindow() {
  const cfg = loadConfigForMain();
  setDynamicCSP(cfg.serverUrl); // ← 실행 시 config로 CSP 주입

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

// ---- 앱 라이프사이클 ----
app.whenReady().then(() => {
  const cfg = loadConfigForMain();
  setDynamicCSP(cfg.serverUrl); // ready 이후 1회만 설치
  ipcMain.handle("config:load", () => loadConfigForMain());

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// (옵션) 미처리 Promise 거부 로그 깔끔히
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
