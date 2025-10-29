// 브리지

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  setAlwaysOnTop: async (flag) =>
    ipcRenderer.invoke("win:set-always-on-top", !!flag),
});
