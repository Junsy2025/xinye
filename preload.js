const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  selectMusicDir: () => ipcRenderer.invoke("select-music-dir"),
  selectLyricsDir: () => ipcRenderer.invoke("select-lyrics-dir"),
  scanMusic: (dir) => ipcRenderer.invoke("scan-music", dir),
  readLyrics: (lyricsPath) => ipcRenderer.invoke("read-lyrics", lyricsPath),
  saveSettings: (patch) => ipcRenderer.invoke("save-settings", patch),
  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("window-toggle-maximize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  updatePlayerState: (state) => ipcRenderer.send("player-state", state),
  onPlayerCommand: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("player-command", handler);
    return () => ipcRenderer.removeListener("player-command", handler);
  },
  onScanProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("scan-progress", handler);
    return () => ipcRenderer.removeListener("scan-progress", handler);
  }
});
