// 브리지

const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

const PD = "C:\\ProgramData\\Rad Messenger\\client\\config.json";
const APPDATA = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "Rad Messenger", "config.json")
  : null;
const RES_DEFAULT = path.join(process.resourcesPath, "config.default.json"); // extraResources 로 포함

async function loadConfig() {
  return (
    (PD && readJsonSafe(PD)) ||
    (APPDATA && readJsonSafe(APPDATA)) ||
    readJsonSafe(RES_DEFAULT) || {
      serverUrl: "http://192:168.10.70:3030",
      displayName: "Unknown",
      defaultRoom: "1",
      alwaysOnTop: false,
      soundEnabled: true,
      soundVolume: 1.0,
    }
  );
}

contextBridge.exposeInMainWorld("api", {
  loadConfig,
  setAlwaysOnTop: async (flag) =>
    ipcRenderer.invoke("win:set-always-on-top", !!flag),
});
