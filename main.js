const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  Tray,
  nativeImage,
  globalShortcut
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { pathToFileURL } = require("url");
let mmModule = null;

const MUSIC_EXTENSIONS = new Set([
  ".mp3",
  ".flac",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".wma"
]);

const COVER_MAX_BYTES = 512 * 1024;

const DEFAULT_SHORTCUTS = {
  prev: "Ctrl+Left",
  next: "Ctrl+Right",
  volumeUp: "Ctrl+Up",
  volumeDown: "Ctrl+Down"
};

let mainWindow = null;
let tray = null;
let isQuitting = false;
let currentSettings = null;
let playerState = {
  isPlaying: false,
  mode: "all"
};

function getSettingsDir() {
  const base = app.isPackaged
    ? path.dirname(process.execPath)
    : app.getAppPath();
  return path.join(base, "setting");
}

function getSettingsFile() {
  return path.join(getSettingsDir(), "settings.json");
}

function getCacheFile() {
  return path.join(getSettingsDir(), "cache.json");
}

function ensureSettingsDir() {
  const dir = getSettingsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function defaultSettings() {
  return {
    musicDir: path.join(os.homedir(), "Music"),
    lyricsDir: path.join(os.homedir(), "Music"),
    showLyrics: false,
    accent: "cloud",
    compactList: false,
    rememberVolume: true,
    volume: 1,
    defaultSort: "name",
    closeBehavior: "minimize",
    shortcuts: { ...DEFAULT_SHORTCUTS }
  };
}

function loadSettings() {
  const filePath = getSettingsFile();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);
      const defaults = defaultSettings();
      const merged = { ...defaults, ...parsed };
      if (!parsed.lyricsDir) {
        merged.lyricsDir = defaults.lyricsDir;
      }
      merged.shortcuts = {
        ...DEFAULT_SHORTCUTS,
        ...(parsed.shortcuts || {})
      };
      return merged;
    }
  } catch (error) {
    // Fall through to defaults on any read/parse error.
  }
  const settings = defaultSettings();
  saveSettings(settings);
  return settings;
}

function saveSettings(settings) {
  ensureSettingsDir();
  fs.writeFileSync(getSettingsFile(), JSON.stringify(settings, null, 2), "utf-8");
  currentSettings = settings;
  registerShortcuts(settings);
}

function sanitizeSettingsPatch(patch) {
  const next = {};
  if (!patch || typeof patch !== "object") {
    return next;
  }

  if (typeof patch.musicDir === "string") {
    next.musicDir = patch.musicDir;
  }
  if (typeof patch.lyricsDir === "string") {
    next.lyricsDir = patch.lyricsDir;
  }
  if (typeof patch.showLyrics === "boolean") {
    next.showLyrics = patch.showLyrics;
  }
  if (typeof patch.accent === "string") {
    next.accent = patch.accent;
  }
  if (typeof patch.compactList === "boolean") {
    next.compactList = patch.compactList;
  }
  if (typeof patch.rememberVolume === "boolean") {
    next.rememberVolume = patch.rememberVolume;
  }
  if (typeof patch.volume === "number" && patch.volume >= 0 && patch.volume <= 1) {
    next.volume = patch.volume;
  }
  if (typeof patch.defaultSort === "string") {
    next.defaultSort = patch.defaultSort;
  }
  if (patch.closeBehavior === "minimize" || patch.closeBehavior === "exit") {
    next.closeBehavior = patch.closeBehavior;
  }
  if (patch.shortcuts && typeof patch.shortcuts === "object") {
    const shortcuts = {};
    if (typeof patch.shortcuts.prev === "string") {
      shortcuts.prev = patch.shortcuts.prev;
    }
    if (typeof patch.shortcuts.next === "string") {
      shortcuts.next = patch.shortcuts.next;
    }
    if (typeof patch.shortcuts.volumeUp === "string") {
      shortcuts.volumeUp = patch.shortcuts.volumeUp;
    }
    if (typeof patch.shortcuts.volumeDown === "string") {
      shortcuts.volumeDown = patch.shortcuts.volumeDown;
    }
    if (Object.keys(shortcuts).length) {
      next.shortcuts = shortcuts;
    }
  }

  return next;
}

async function getMusicMetadata() {
  if (!mmModule) {
    mmModule = await import("music-metadata");
  }
  return mmModule;
}

function loadCache() {
  const cacheFile = getCacheFile();
  try {
    if (fs.existsSync(cacheFile)) {
      const raw = fs.readFileSync(cacheFile, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return { files: parsed.files || {} };
      }
    }
  } catch (error) {
    // Ignore cache read errors.
  }
  return { files: {} };
}

function saveCache(cache) {
  ensureSettingsDir();
  fs.writeFileSync(getCacheFile(), JSON.stringify(cache, null, 2), "utf-8");
}

function normalizeCover(picture) {
  if (!picture || !picture.data || picture.data.length > COVER_MAX_BYTES) {
    return null;
  }

  const mime = picture.format || "image/jpeg";
  const base64 = picture.data.toString("base64");
  return `data:${mime};base64,${base64}`;
}

async function readMetadata(filePath, stat, cache) {
  const cached = cache.files[filePath];
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return { metadata: cached.metadata, cached: true };
  }

  try {
    const { parseFile } = await getMusicMetadata();
    const data = await parseFile(filePath, { duration: true });
    const cover = data.common.picture && data.common.picture[0]
      ? normalizeCover(data.common.picture[0])
      : null;
    const metadata = {
      title: data.common.title || null,
      artist: data.common.artist || null,
      album: data.common.album || null,
      duration: Number.isFinite(data.format.duration) ? data.format.duration : null,
      cover
    };

    cache.files[filePath] = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      metadata
    };

    return { metadata, cached: false };
  } catch (error) {
    const metadata = {
      title: null,
      artist: null,
      album: null,
      duration: null,
      cover: null
    };

    cache.files[filePath] = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      metadata
    };

    return { metadata, cached: false, error: true };
  }
}

async function scanMusicFiles(rootDir, lyricsDir, onProgress) {
  const results = [];
  const cache = loadCache();
  const seen = new Set();
  let scanned = 0;
  let warnings = 0;

  if (!rootDir || !fs.existsSync(rootDir)) {
    return { tracks: [], warnings: 0, error: "目录不存在" };
  }

  const resolvedLyricsDir =
    lyricsDir && fs.existsSync(lyricsDir) ? lyricsDir : "";

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (error) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (MUSIC_EXTENSIONS.has(ext)) {
          let stat;
          try {
            stat = await fs.promises.stat(fullPath);
          } catch (error) {
            warnings += 1;
            continue;
          }

          seen.add(fullPath);
          const metaResult = await readMetadata(fullPath, stat, cache);
          if (metaResult.error) {
            warnings += 1;
          }

          scanned += 1;
          if (onProgress) {
            onProgress({
              phase: "scan",
              scanned,
              current: fullPath
            });
          }

          results.push({
            path: fullPath,
            name: path.basename(fullPath),
            title: metaResult.metadata.title,
            artist: metaResult.metadata.artist,
            album: metaResult.metadata.album,
            duration: metaResult.metadata.duration,
            cover: metaResult.metadata.cover,
            mtimeMs: stat.mtimeMs,
            url: pathToFileURL(fullPath).href
          });
        }
      }
    }
  }

  await walk(rootDir);

  for (const cachedPath of Object.keys(cache.files)) {
    if (!seen.has(cachedPath)) {
      delete cache.files[cachedPath];
    }
  }

  saveCache(cache);

  const tracks = results.map((track) => {
    const ext = path.extname(track.path);
    const baseName = path.basename(track.path, ext);
    let lyricsPath = null;
    if (resolvedLyricsDir) {
      const externalLrc = path.join(resolvedLyricsDir, `${baseName}.lrc`);
      if (fs.existsSync(externalLrc)) {
        lyricsPath = externalLrc;
      }
    }

    if (!lyricsPath) {
      const localLrc = path.join(path.dirname(track.path), `${baseName}.lrc`);
      if (fs.existsSync(localLrc)) {
        lyricsPath = localLrc;
      }
    }

    return {
      ...track,
      lyricsPath
    };
  });

  if (onProgress) {
    onProgress({ phase: "done", scanned, current: null });
  }

  return { tracks, warnings };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: "#f7f8fa",
    icon: path.join(__dirname, "images", "logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile("index.html");
  win.setMenuBarVisibility(false);
  win.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    const closeBehavior = (currentSettings && currentSettings.closeBehavior) || "minimize";
    if (closeBehavior === "minimize") {
      event.preventDefault();
      win.setSkipTaskbar(true);
      win.hide();
    }
  });

  return win;
}

function buildTrayIcon() {
  const iconPath = path.join(__dirname, "images", "logo.png");
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#d33a31"/>
      <path d="M40 18v23.5a7 7 0 1 1-3.2-6V24H26v16.5a7 7 0 1 1-3.2-6V18h17.2z" fill="#fff"/>
    </svg>
  `;
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return nativeImage.createFromDataURL(dataUrl);
}

function getMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow();
  }
  return mainWindow;
}

function showMainWindow() {
  const win = getMainWindow();
  win.setSkipTaskbar(false);
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}

function sendPlayerCommand(command, payload) {
  const win = getMainWindow();
  if (win && win.webContents) {
    win.webContents.send("player-command", { command, payload });
  }
}

function buildTrayMenu() {
  const playLabel = playerState.isPlaying ? "暂停" : "播放";
  const template = [
    {
      label: "播放方式",
      submenu: [
        {
          label: "列表循环",
          type: "radio",
          checked: playerState.mode === "all",
          click: () => sendPlayerCommand("set-mode", { mode: "all" })
        },
        {
          label: "列表随机",
          type: "radio",
          checked: playerState.mode === "shuffle",
          click: () => sendPlayerCommand("set-mode", { mode: "shuffle" })
        },
        {
          label: "单曲循环",
          type: "radio",
          checked: playerState.mode === "one",
          click: () => sendPlayerCommand("set-mode", { mode: "one" })
        }
      ]
    },
    { type: "separator" },
    {
      label: "上一曲",
      click: () => sendPlayerCommand("prev")
    },
    {
      label: "下一曲",
      click: () => sendPlayerCommand("next")
    },
    {
      label: playLabel,
      click: () => sendPlayerCommand("toggle-play")
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ];
  return Menu.buildFromTemplate(template);
}

function updateTrayMenu() {
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
  }
}

function createTray() {
  if (tray) return tray;
  const icon = buildTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("心悦");
  tray.setContextMenu(buildTrayMenu());
  tray.on("double-click", () => {
    showMainWindow();
  });
  tray.on("click", () => {
    showMainWindow();
  });
  tray.on("right-click", () => {
    tray.popUpContextMenu();
  });
  return tray;
}

function registerShortcuts(settings) {
  globalShortcut.unregisterAll();
  if (!settings || !settings.shortcuts) return;

  const shortcuts = { ...DEFAULT_SHORTCUTS, ...settings.shortcuts };
  const mappings = [
    { key: shortcuts.prev, command: "prev" },
    { key: shortcuts.next, command: "next" },
    { key: shortcuts.volumeUp, command: "volume-up" },
    { key: shortcuts.volumeDown, command: "volume-down" }
  ];

  mappings.forEach(({ key, command }) => {
    if (!key || typeof key !== "string") return;
    try {
      globalShortcut.register(key, () => {
        sendPlayerCommand(command);
      });
    } catch (error) {
      // Ignore invalid shortcut registration.
    }
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.local.musicplayer");
  Menu.setApplicationMenu(null);
  currentSettings = loadSettings();
  mainWindow = createWindow();
  createTray();
  registerShortcuts(currentSettings);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

ipcMain.handle("get-settings", () => {
  currentSettings = loadSettings();
  return currentSettings;
});

ipcMain.handle("select-music-dir", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  const settings = loadSettings();
  settings.musicDir = result.filePaths[0];
  saveSettings(settings);
  return settings;
});

ipcMain.handle("select-lyrics-dir", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  const settings = loadSettings();
  settings.lyricsDir = result.filePaths[0];
  saveSettings(settings);
  return settings;
});

ipcMain.handle("scan-music", async (event, payload) => {
  const settings = loadSettings();
  const targetDir =
    typeof payload === "string"
      ? payload
      : payload && payload.dir
        ? payload.dir
        : settings.musicDir;
  return scanMusicFiles(targetDir, settings.lyricsDir, (progress) => {
    event.sender.send("scan-progress", progress);
  });
});

ipcMain.handle("save-settings", async (_event, patch) => {
  const settings = loadSettings();
  const sanitized = sanitizeSettingsPatch(patch);
  const next = {
    ...settings,
    ...sanitized,
    shortcuts: {
      ...(settings.shortcuts || DEFAULT_SHORTCUTS),
      ...(sanitized.shortcuts || {})
    }
  };
  saveSettings(next);
  return next;
});

ipcMain.handle("window-minimize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setSkipTaskbar(false);
    win.minimize();
  }
});

ipcMain.handle("window-toggle-maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  }
  win.maximize();
  return true;
});

ipcMain.handle("window-close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    const closeBehavior = (currentSettings && currentSettings.closeBehavior) || "minimize";
    if (closeBehavior === "exit") {
      isQuitting = true;
      win.close();
    } else {
      win.setSkipTaskbar(true);
      win.hide();
    }
  }
});

ipcMain.on("player-state", (_event, state) => {
  playerState = { ...playerState, ...state };
  updateTrayMenu();
});

ipcMain.handle("read-lyrics", async (_event, lyricsPath) => {
  if (!lyricsPath || path.extname(lyricsPath).toLowerCase() !== ".lrc") {
    return null;
  }

  try {
    return await fs.promises.readFile(lyricsPath, "utf-8");
  } catch (error) {
    return null;
  }
});
