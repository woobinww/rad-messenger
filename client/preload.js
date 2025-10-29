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

async function loadConfig() {
  const devPath = path.join(__dirname, "config.json");
  const sysPath = "C:\\ProgramData\\RadMessenger\\client\\config.json";
  const localPath = path.join(process.resourcesPath, "config.default.json");

  return (
    readJsonSafe(devPath) ||
    readJsonSafe(sysPath) ||
    readJsonSafe(localPath) || {
      serverUrl: "http://192.168.10.70:3030",
      displayName: "Unknown",
      defaultRoom: "1",
      alwaysOnTop: false,
      soundEnabled: true,
      soundVolume: 1,
    }
  );
}

contextBridge.exposeInMainWorld("api", {
  loadConfig,
  setAlwaysOnTop: async (flag) =>
    ipcRenderer.invoke("win:set-always-on-top", !!flag),
});
