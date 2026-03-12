const appEl = document.getElementById("app");
const navCenterEl = document.getElementById("nav-center");
const navTextEl = document.getElementById("nav-text");
const rescanBtn = document.getElementById("rescan");
const trackListEl = document.getElementById("track-list");
const emptyStateEl = document.getElementById("empty-state");
const audioEl = document.getElementById("audio");
const nowTitleEl = document.getElementById("now-title");
const nowMetaEl = document.getElementById("now-meta");
const coverEl = document.getElementById("cover");
const coverImgEl = document.getElementById("cover-img");
const vinylEl = document.getElementById("vinyl");
const playToggleBtn = document.getElementById("play-toggle");
const prevTrackBtn = document.getElementById("prev-track");
const nextTrackBtn = document.getElementById("next-track");
const modeToggleBtn = document.getElementById("mode-toggle");
const toggleLyricsBtn = document.getElementById("toggle-lyrics");
const muteToggleBtn = document.getElementById("mute-toggle");
const volumeEl = document.getElementById("volume");
const progressEl = document.getElementById("progress");
const currentTimeEl = document.getElementById("current-time");
const durationEl = document.getElementById("duration");
const lyricsBodyEl = document.getElementById("lyrics-body");
const lyricsEmptyEl = document.getElementById("lyrics-empty");
const playerEl = document.querySelector(".player-area");
const playlistPanelEl = document.getElementById("playlist-panel");
const togglePlaylistBtn = document.getElementById("toggle-playlist");
const mainViewEl = document.getElementById("main-view");
const searchEl = document.getElementById("search");
const sortEl = document.getElementById("setting-default-sort");
const trackCountEl = document.getElementById("track-count");
const scanStatusEl = document.getElementById("scan-status");
const openSettingsBtn = document.getElementById("open-settings");
const closeSettingsBtn = document.getElementById("close-settings");
const minimizeBtn = document.getElementById("minimize-btn");
const maximizeBtn = document.getElementById("maximize-btn");
const closeBtn = document.getElementById("close-btn");
const settingMusicPathEl = document.getElementById("setting-music-path");
const settingLyricsPathEl = document.getElementById("setting-lyrics-path");
const settingMusicBtn = document.getElementById("setting-music-btn");
const settingLyricsBtn = document.getElementById("setting-lyrics-btn");

const settingShowLyricsEl = document.getElementById("setting-show-lyrics");
const settingCompactEl = document.getElementById("setting-compact");
const settingAccentEl = document.getElementById("setting-accent");
const settingRememberVolumeEl = document.getElementById("setting-remember-volume");
const settingVolumeEl = document.getElementById("setting-volume");
const settingDefaultSortEl = document.getElementById("setting-default-sort");
const closeBehaviorRadios = document.querySelectorAll("input[name=\"setting-close\"]");
const shortcutPrevEl = document.getElementById("setting-shortcut-prev");
const shortcutNextEl = document.getElementById("setting-shortcut-next");
const shortcutVolumeUpEl = document.getElementById("setting-shortcut-volume-up");
const shortcutVolumeDownEl = document.getElementById("setting-shortcut-volume-down");

let allTracks = [];
let displayTracks = [];
let currentQueue = [];
let currentIndex = -1;
let currentTrackPath = null;

let lyricLines = [];
let lyricWindow = [];
let activeLyricIndex = -1;
let isSeeking = false;

let shuffleEnabled = false;
let repeatMode = "all";
let shuffleOrder = [];
let shufflePosition = -1;
let currentSettings = null;
let isLyricsView = false;
let currentTrack = null;
let lyricsAvailable = false;
const themeOptions = ["cloud", "sand", "sage", "ocean", "graphite"];

function setScanStatus(text, active = false) {
  scanStatusEl.textContent = text;
  scanStatusEl.classList.toggle("active", active);
}

function setTheme(accent) {
  if (accent && accent !== "netease") {
    document.documentElement.dataset.theme = accent;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function clampVolume(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function applySettings(settings) {
  currentSettings = settings;
  const accent = themeOptions.includes(settings.accent) ? settings.accent : "cloud";
  setTheme(accent);
  isLyricsView = Boolean(settings.showLyrics);
  document.body.classList.toggle("compact", Boolean(settings.compactList));

  sortEl.value = settings.defaultSort || "name";
  settingDefaultSortEl.value = settings.defaultSort || "name";
  settingShowLyricsEl.checked = Boolean(settings.showLyrics);
  settingCompactEl.checked = Boolean(settings.compactList);
  settingAccentEl.value = accent;
  settingRememberVolumeEl.checked = Boolean(settings.rememberVolume);
  settingVolumeEl.disabled = !settings.rememberVolume;
  const closeBehavior = settings.closeBehavior || "minimize";
  closeBehaviorRadios.forEach((radio) => {
    radio.checked = radio.value === closeBehavior;
  });
  settingMusicPathEl.value = settings.musicDir || "";
  settingLyricsPathEl.value = settings.lyricsDir || "";

  const shortcuts = settings.shortcuts || {};
  shortcutPrevEl.value = shortcuts.prev || "";
  shortcutNextEl.value = shortcuts.next || "";
  shortcutVolumeUpEl.value = shortcuts.volumeUp || "";
  shortcutVolumeDownEl.value = shortcuts.volumeDown || "";

  updateLyricsVisibility();

  const targetVolume = settings.rememberVolume
    ? clampVolume(settings.volume)
    : clampVolume(audioEl.volume || 1);
  audioEl.volume = targetVolume;
  volumeEl.value = String(targetVolume);
  settingVolumeEl.value = String(targetVolume);
  updateMuteIcon();
}

async function saveSettings(patch) {
  const next = await window.api.saveSettings(patch);
  applySettings(next);
  if (patch && Object.prototype.hasOwnProperty.call(patch, "defaultSort")) {
    applyFilterSort();
  }
}

function getPlaybackMode() {
  if (repeatMode === "one") return "one";
  if (shuffleEnabled) return "shuffle";
  return "all";
}

function updateModeUI() {
  const mode = getPlaybackMode();
  if (mode === "shuffle") {
    modeToggleBtn.innerHTML = '<i class="bi bi-shuffle"></i>';
    modeToggleBtn.title = "列表随机";
  } else if (mode === "one") {
    modeToggleBtn.innerHTML = '<i class="bi bi-repeat-1"></i>';
    modeToggleBtn.title = "单曲循环";
  } else {
    modeToggleBtn.innerHTML = '<i class="bi bi-repeat"></i>';
    modeToggleBtn.title = "列表循环";
  }
  window.api.updatePlayerState({ mode });
}

function setPlaybackMode(mode) {
  if (mode === "shuffle") {
    shuffleEnabled = true;
    repeatMode = "all";
    buildShuffleOrder();
  } else if (mode === "one") {
    shuffleEnabled = false;
    repeatMode = "one";
  } else {
    shuffleEnabled = false;
    repeatMode = "all";
  }

  updateModeUI();
}

function adjustVolume(delta) {
  const next = clampVolume(audioEl.volume + delta);
  audioEl.volume = next;
  if (currentSettings && currentSettings.rememberVolume) {
    saveSettings({ volume: next });
  }
}

function buildAcceleratorFromEvent(event) {
  const key = event.key;
  if (key === "Control" || key === "Shift" || key === "Alt" || key === "Meta") {
    return null;
  }

  const modifiers = [];
  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Meta");

  const keyMap = {
    ArrowLeft: "Left",
    ArrowRight: "Right",
    ArrowUp: "Up",
    ArrowDown: "Down",
    " ": "Space"
  };

  let mainKey = keyMap[key] || key;
  if (mainKey.length === 1) {
    mainKey = mainKey.toUpperCase();
  } else {
    mainKey = mainKey[0].toUpperCase() + mainKey.slice(1);
  }

  if (!modifiers.length) {
    return mainKey;
  }
  return [...modifiers, mainKey].join("+");
}

function bindShortcutInput(input, field) {
  input.addEventListener("keydown", (event) => {
    event.preventDefault();
    const accelerator = buildAcceleratorFromEvent(event);
    if (!accelerator) return;
    input.value = accelerator;
    saveSettings({ shortcuts: { [field]: accelerator } });
  });
}

function stripExtension(name) {
  return name.replace(/\.[^/.]+$/, "");
}

function formatTime(value) {
  if (!Number.isFinite(value)) return "0:00";
  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getDisplayTitle(track) {
  return track.title || stripExtension(track.name || "未知曲目");
}

function getDisplayMeta(track) {
  const artist = track.artist || "未知艺术家";
  const album = track.album || "未知专辑";
  return `${artist} · ${album}`;
}

function setCover(cover) {
  if (cover) {
    coverImgEl.src = cover;
    coverEl.classList.add("has-cover");
  } else {
    coverImgEl.removeAttribute("src");
    coverEl.classList.remove("has-cover");
  }
}

function setPlayButtonState(isPlaying) {
  playToggleBtn.innerHTML = isPlaying
    ? '<i class="bi bi-pause-fill"></i>'
    : '<i class="bi bi-play-fill"></i>';
  playToggleBtn.title = isPlaying ? "暂停" : "播放";
}

function updateMuteIcon() {
  if (audioEl.muted || audioEl.volume === 0) {
    muteToggleBtn.innerHTML = '<i class="bi bi-volume-mute"></i>';
    muteToggleBtn.title = "取消静音";
  } else if (audioEl.volume < 0.5) {
    muteToggleBtn.innerHTML = '<i class="bi bi-volume-down"></i>';
    muteToggleBtn.title = "静音";
  } else {
    muteToggleBtn.innerHTML = '<i class="bi bi-volume-up"></i>';
    muteToggleBtn.title = "静音";
  }
}

function setVinylSpinning(isPlaying) {
  if (isPlaying) {
    vinylEl.classList.add("spin");
    vinylEl.style.animationPlayState = "running";
  } else {
    vinylEl.style.animationPlayState = "paused";
  }
}

function resetVinyl() {
  vinylEl.classList.remove("spin");
  vinylEl.style.animation = "none";
  vinylEl.style.transform = "rotate(0deg)";
  void vinylEl.offsetWidth;
  vinylEl.style.animation = "";
  vinylEl.style.animationPlayState = "paused";
}

function updateLyricsVisibility() {
  playerEl.classList.toggle("lyrics-only", isLyricsView);
  toggleLyricsBtn.classList.toggle("active", isLyricsView);
}

function getTrackMetaText() {
  if (!currentTrack) return "心悦";
  const title = getDisplayTitle(currentTrack);
  const artist = currentTrack.artist || "未知艺术家";
  return `${title} - ${artist}`;
}

function updateNavText(text) {
  navTextEl.classList.remove("marquee");
  navCenterEl.classList.remove("marquee");
  navTextEl.style.removeProperty("--marquee-distance");
  navTextEl.style.removeProperty("--marquee-duration");
  navTextEl.textContent = text || "";

  requestAnimationFrame(() => {
    const containerWidth = navCenterEl.clientWidth;
    const textWidth = navTextEl.scrollWidth;
    if (textWidth > containerWidth && containerWidth > 0) {
      const distance = textWidth - containerWidth + 24;
      const duration = Math.max(6, distance / 40);
      navTextEl.style.setProperty("--marquee-distance", `${distance}px`);
      navTextEl.style.setProperty("--marquee-duration", `${duration}s`);
      navTextEl.classList.add("marquee");
      navCenterEl.classList.add("marquee");
    }
  });
}

function updateNavForLyrics(index) {
  if (!lyricsAvailable || !lyricLines.length) {
    updateNavText(getTrackMetaText());
    return;
  }

  const line = lyricLines[index] || lyricLines[0];
  updateNavText(line ? line.text : getTrackMetaText());
}

function renderTracks(tracks) {
  trackListEl.innerHTML = "";
  trackCountEl.textContent = `${tracks.length} 首`;
  displayTracks = tracks;
  currentQueue = tracks;

  if (!tracks.length) {
    emptyStateEl.style.display = "block";
    return;
  }

  emptyStateEl.style.display = "none";

  tracks.forEach((track, index) => {
    const item = document.createElement("div");
    item.className = "track";
    item.dataset.index = String(index);
    item.dataset.path = track.path;

    if (track.path === currentTrackPath) {
      item.classList.add("active");
    }

    const cover = document.createElement("div");
    cover.className = "track-cover";

    const coverImg = document.createElement("img");
    if (track.cover) {
      coverImg.src = track.cover;
      cover.classList.add("has-cover");
    }
    const coverFallback = document.createElement("div");
    coverFallback.className = "cover-fallback";
    coverFallback.textContent = "♪";
    cover.appendChild(coverImg);
    cover.appendChild(coverFallback);

    const info = document.createElement("div");
    info.className = "track-info";

    const title = document.createElement("div");
    title.className = "track-title";
    title.textContent = getDisplayTitle(track);

    const meta = document.createElement("div");
    meta.className = "track-meta";
    meta.textContent = getDisplayMeta(track);

    info.appendChild(title);
    info.appendChild(meta);

    const duration = document.createElement("div");
    duration.className = "track-duration";
    duration.textContent = track.duration ? formatTime(track.duration) : "--:--";

    item.appendChild(cover);
    item.appendChild(info);
    item.appendChild(duration);

    item.addEventListener("click", () => {
      playTrack(index);
    });

    trackListEl.appendChild(item);
  });
}

function clearActive() {
  const active = trackListEl.querySelector(".track.active");
  if (active) {
    active.classList.remove("active");
  }
}

function updateActiveTrack(index) {
  clearActive();
  const item = trackListEl.querySelector(`[data-index="${index}"]`);
  if (item) {
    item.classList.add("active");
  }
}

function buildShuffleOrder() {
  shuffleOrder = currentQueue.map((_track, index) => index);
  for (let i = shuffleOrder.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
  }

  if (currentIndex >= 0) {
    const currentPos = shuffleOrder.indexOf(currentIndex);
    if (currentPos > 0) {
      shuffleOrder.splice(currentPos, 1);
      shuffleOrder.unshift(currentIndex);
    }
    shufflePosition = shuffleOrder.indexOf(currentIndex);
  } else {
    shufflePosition = -1;
  }
}

function playTrack(index) {
  const track = currentQueue[index];
  if (!track) return;

  const isNewTrack = track.path !== currentTrackPath;
  currentIndex = index;
  currentTrackPath = track.path;
  currentTrack = track;
  lyricsAvailable = false;

  if (isNewTrack) {
    resetVinyl();
  }

  if (shuffleEnabled) {
    if (!shuffleOrder.length) {
      buildShuffleOrder();
    }
    shufflePosition = shuffleOrder.indexOf(index);
  }

  updateActiveTrack(index);
  nowTitleEl.textContent = getDisplayTitle(track);
  nowMetaEl.textContent = getDisplayMeta(track);
  setCover(track.cover);

  audioEl.src = track.url;
  audioEl.play();
  updateNavText(getTrackMetaText());
  loadLyrics(track.lyricsPath);
}

function updateQueueFromDisplay() {
  currentQueue = displayTracks;
  if (shuffleEnabled) {
    buildShuffleOrder();
  }

  if (currentTrackPath) {
    const nextIndex = currentQueue.findIndex(
      (track) => track.path === currentTrackPath
    );
    currentIndex = nextIndex;
  }
}

function getNextIndex() {
  if (currentIndex === -1) {
    return currentQueue.length ? 0 : -1;
  }

  if (repeatMode === "one") {
    return currentIndex;
  }

  if (shuffleEnabled && shuffleOrder.length) {
    if (shufflePosition === -1) {
      shufflePosition = 0;
      return shuffleOrder[0];
    }
    let nextPos = shufflePosition + 1;
    if (nextPos >= shuffleOrder.length) {
      if (repeatMode === "all") {
        nextPos = 0;
      } else {
        return -1;
      }
    }
    shufflePosition = nextPos;
    return shuffleOrder[nextPos];
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex >= currentQueue.length) {
    return repeatMode === "all" ? 0 : -1;
  }
  return nextIndex;
}

function getPrevIndex() {
  if (currentIndex === -1) {
    return currentQueue.length ? 0 : -1;
  }

  if (repeatMode === "one") {
    return currentIndex;
  }

  if (shuffleEnabled && shuffleOrder.length) {
    if (shufflePosition === -1) {
      shufflePosition = 0;
      return shuffleOrder[0];
    }
    let prevPos = shufflePosition - 1;
    if (prevPos < 0) {
      if (repeatMode === "all") {
        prevPos = shuffleOrder.length - 1;
      } else {
        return -1;
      }
    }
    shufflePosition = prevPos;
    return shuffleOrder[prevPos];
  }

  const prevIndex = currentIndex - 1;
  if (prevIndex < 0) {
    return repeatMode === "all" ? currentQueue.length - 1 : -1;
  }
  return prevIndex;
}

function updateProgressUI() {
  const duration = audioEl.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    progressEl.max = "0";
    progressEl.value = "0";
    currentTimeEl.textContent = "0:00";
    durationEl.textContent = "0:00";
    return;
  }

  progressEl.max = String(duration);
  if (!isSeeking) {
    progressEl.value = String(audioEl.currentTime || 0);
  }
  currentTimeEl.textContent = formatTime(audioEl.currentTime || 0);
  durationEl.textContent = formatTime(duration);
}

function parseLrc(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  let offsetSeconds = 0;

  for (const line of lines) {
    if (line.startsWith("[offset:")) {
      const raw = line.replace("[offset:", "").replace("]", "").trim();
      const offsetMs = Number(raw);
      if (Number.isFinite(offsetMs)) {
        offsetSeconds = offsetMs / 1000;
      }
    }

    const times = [];
    let match;
    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const msRaw = match[3] || "0";
      const ms = Number(msRaw.padEnd(3, "0"));
      times.push(minutes * 60 + seconds + ms / 1000 + offsetSeconds);
    }

    const textPart = line.replace(timeRegex, "").trim();
    if (!times.length || !textPart) {
      continue;
    }

    for (const time of times) {
      entries.push({ time, text: textPart });
    }
  }

  return entries.sort((a, b) => a.time - b.time);
}

function renderLyricWindow(centerIndex) {
  lyricsBodyEl.innerHTML = "";
  lyricWindow = [];

  if (!lyricLines.length) return;

  const start = Math.max(0, centerIndex - 5);
  const end = Math.min(lyricLines.length - 1, centerIndex + 5);

  for (let i = start; i <= end; i += 1) {
    const line = lyricLines[i];
    const el = document.createElement("div");
    el.className = "lyric-line";
    el.dataset.index = String(i);
    el.textContent = line.text;
    if (i === centerIndex) {
      el.classList.add("active");
    }
    lyricsBodyEl.appendChild(el);
    lyricWindow.push(el);
  }
}

async function loadLyrics(lyricsPath) {
  lyricLines = [];
  lyricWindow = [];
  activeLyricIndex = -1;
  lyricsBodyEl.innerHTML = "";
  lyricsBodyEl.style.display = "flex";
  lyricsAvailable = false;

  if (!lyricsPath) {
    lyricsBodyEl.style.display = "none";
    lyricsEmptyEl.style.display = "flex";
    updateNavText(getTrackMetaText());
    return;
  }

  const text = await window.api.readLyrics(lyricsPath);
  if (!text) {
    lyricsBodyEl.style.display = "none";
    lyricsEmptyEl.style.display = "flex";
    updateNavText(getTrackMetaText());
    return;
  }

  const parsed = parseLrc(text);
  if (!parsed.length) {
    lyricsBodyEl.style.display = "none";
    lyricsEmptyEl.style.display = "flex";
    updateNavText(getTrackMetaText());
    return;
  }

  lyricsEmptyEl.style.display = "none";
  lyricsAvailable = true;
  lyricLines = parsed;
  renderLyricWindow(0);
  updateNavForLyrics(0);
}

function updateLyrics() {
  if (!lyricLines.length) return;

  const currentTime = audioEl.currentTime || 0;
  let nextIndex = -1;

  for (let i = 0; i < lyricLines.length; i += 1) {
    if (currentTime >= lyricLines[i].time) {
      nextIndex = i;
    } else {
      break;
    }
  }

  if (nextIndex === activeLyricIndex) return;

  activeLyricIndex = nextIndex;
  renderLyricWindow(activeLyricIndex);
  updateNavForLyrics(activeLyricIndex);
}

function applyFilterSort() {
  const query = searchEl.value.trim().toLowerCase();
  const sortValue = sortEl.value;

  let filtered = allTracks.filter((track) => {
    if (!query) return true;
    const haystack = [
      getDisplayTitle(track),
      track.artist || "",
      track.album || "",
      track.name || ""
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  filtered.sort((a, b) => {
    if (sortValue === "recent") {
      return (b.mtimeMs || 0) - (a.mtimeMs || 0);
    }
    if (sortValue === "duration") {
      const aDur = a.duration || 0;
      const bDur = b.duration || 0;
      return aDur - bDur;
    }
    const aValue =
      sortValue === "artist"
        ? a.artist || ""
        : sortValue === "album"
          ? a.album || ""
          : getDisplayTitle(a);
    const bValue =
      sortValue === "artist"
        ? b.artist || ""
        : sortValue === "album"
          ? b.album || ""
          : getDisplayTitle(b);
    return aValue.localeCompare(bValue, "zh-CN", { sensitivity: "base" });
  });

  renderTracks(filtered);
  updateQueueFromDisplay();
}

async function loadSettingsAndScan() {
  const settings = await window.api.getSettings();
  applySettings(settings);

  setScanStatus("正在扫描本地音乐...", true);
  const result = await window.api.scanMusic({ dir: settings.musicDir });

  const tracks = Array.isArray(result) ? result : result.tracks || [];
  const warnings = Array.isArray(result) ? 0 : result.warnings || 0;
  const error = Array.isArray(result) ? null : result.error;

  if (error) {
    setScanStatus(`扫描失败：${error}`, false);
    allTracks = [];
    applyFilterSort();
    return;
  }

  allTracks = tracks;
  applyFilterSort();
  if (warnings > 0) {
    setScanStatus(`已扫描 ${tracks.length} 首，${warnings} 个文件读取失败`, false);
  } else {
    setScanStatus(`已扫描 ${tracks.length} 首`, false);
  }
}

rescanBtn.addEventListener("click", loadSettingsAndScan);

playToggleBtn.addEventListener("click", () => {
  if (audioEl.paused) {
    if (currentIndex === -1 && currentQueue.length > 0) {
      playTrack(0);
      return;
    }
    audioEl.play();
  } else {
    audioEl.pause();
  }
});

prevTrackBtn.addEventListener("click", () => {
  const prevIndex = getPrevIndex();
  if (prevIndex !== -1) {
    playTrack(prevIndex);
  }
});

nextTrackBtn.addEventListener("click", () => {
  const nextIndex = getNextIndex();
  if (nextIndex !== -1) {
    playTrack(nextIndex);
  }
});

modeToggleBtn.addEventListener("click", () => {
  const order = ["all", "shuffle", "one"];
  const current = getPlaybackMode();
  const next = order[(order.indexOf(current) + 1) % order.length];
  setPlaybackMode(next);
});

muteToggleBtn.addEventListener("click", () => {
  audioEl.muted = !audioEl.muted;
  updateMuteIcon();
});

volumeEl.addEventListener("input", () => {
  audioEl.volume = Number(volumeEl.value);
  if (currentSettings && currentSettings.rememberVolume) {
    saveSettings({ volume: audioEl.volume });
  }
});

audioEl.addEventListener("volumechange", () => {
  volumeEl.value = String(audioEl.volume);
  settingVolumeEl.value = String(audioEl.volume);
  updateMuteIcon();
});


progressEl.addEventListener("input", () => {
  const value = Number(progressEl.value);
  isSeeking = true;
  audioEl.currentTime = value;
  currentTimeEl.textContent = formatTime(value);
});

progressEl.addEventListener("change", () => {
  isSeeking = false;
});

audioEl.addEventListener("loadedmetadata", updateProgressUI);
audioEl.addEventListener("timeupdate", () => {
  updateProgressUI();
  updateLyrics();
});
audioEl.addEventListener("play", () => {
  setPlayButtonState(true);
  setVinylSpinning(true);
  window.api.updatePlayerState({ isPlaying: true, mode: getPlaybackMode() });
});
audioEl.addEventListener("pause", () => {
  setPlayButtonState(false);
  setVinylSpinning(false);
  window.api.updatePlayerState({ isPlaying: false, mode: getPlaybackMode() });
});
audioEl.addEventListener("ended", () => {
  const nextIndex = getNextIndex();
  if (nextIndex !== -1) {
    playTrack(nextIndex);
  } else {
    setPlayButtonState(false);
    setVinylSpinning(false);
  }
});
audioEl.addEventListener("error", () => {
  setScanStatus("播放失败：文件可能损坏或格式不支持", false);
});

searchEl.addEventListener("input", applyFilterSort);

togglePlaylistBtn.addEventListener("click", () => {
  const isOpen = playlistPanelEl.classList.toggle("open");
  togglePlaylistBtn.classList.toggle("active", isOpen);
});

mainViewEl.addEventListener("click", (event) => {
  if (!playlistPanelEl.classList.contains("open")) return;
  if (playlistPanelEl.contains(event.target)) return;
  if (togglePlaylistBtn.contains(event.target)) return;
  playlistPanelEl.classList.remove("open");
  togglePlaylistBtn.classList.remove("active");
});

toggleLyricsBtn.addEventListener("click", () => {
  isLyricsView = !isLyricsView;
  saveSettings({ showLyrics: isLyricsView });
});

openSettingsBtn.addEventListener("click", () => {
  appEl.classList.add("settings-active");
});

closeSettingsBtn.addEventListener("click", () => {
  appEl.classList.remove("settings-active");
});

minimizeBtn.addEventListener("click", () => {
  window.api.windowMinimize();
});

maximizeBtn.addEventListener("click", async () => {
  await window.api.windowToggleMaximize();
});

closeBtn.addEventListener("click", () => {
  window.api.windowClose();
});

settingMusicBtn.addEventListener("click", async () => {
  const settings = await window.api.selectMusicDir();
  if (!settings) return;
  applySettings(settings);
  await loadSettingsAndScan();
});

settingLyricsBtn.addEventListener("click", async () => {
  const settings = await window.api.selectLyricsDir();
  if (!settings) return;
  applySettings(settings);
  await loadSettingsAndScan();
});

settingMusicPathEl.addEventListener("change", () => {
  const value = settingMusicPathEl.value.trim();
  if (value) {
    saveSettings({ musicDir: value });
    loadSettingsAndScan();
  }
});

settingLyricsPathEl.addEventListener("change", () => {
  const value = settingLyricsPathEl.value.trim();
  if (value) {
    saveSettings({ lyricsDir: value });
    loadSettingsAndScan();
  }
});

settingMusicPathEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    settingMusicPathEl.blur();
  }
});

settingLyricsPathEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    settingLyricsPathEl.blur();
  }
});

settingShowLyricsEl.addEventListener("change", () => {
  saveSettings({ showLyrics: settingShowLyricsEl.checked });
});

settingCompactEl.addEventListener("change", () => {
  saveSettings({ compactList: settingCompactEl.checked });
});

settingAccentEl.addEventListener("change", () => {
  saveSettings({ accent: settingAccentEl.value });
});

settingRememberVolumeEl.addEventListener("change", () => {
  saveSettings({ rememberVolume: settingRememberVolumeEl.checked });
});

settingVolumeEl.addEventListener("input", () => {
  const nextVolume = Number(settingVolumeEl.value);
  audioEl.volume = nextVolume;
  if (settingRememberVolumeEl.checked) {
    saveSettings({ volume: nextVolume });
  }
});

settingDefaultSortEl.addEventListener("change", () => {
  saveSettings({ defaultSort: settingDefaultSortEl.value });
  applyFilterSort();
});

closeBehaviorRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    if (radio.checked) {
      saveSettings({ closeBehavior: radio.value });
    }
  });
});

bindShortcutInput(shortcutPrevEl, "prev");
bindShortcutInput(shortcutNextEl, "next");
bindShortcutInput(shortcutVolumeUpEl, "volumeUp");
bindShortcutInput(shortcutVolumeDownEl, "volumeDown");

window.api.onPlayerCommand((payload) => {
  if (!payload) return;
  const { command, payload: data } = payload;
  if (command === "prev") {
    const prevIndex = getPrevIndex();
    if (prevIndex !== -1) {
      playTrack(prevIndex);
    }
  } else if (command === "next") {
    const nextIndex = getNextIndex();
    if (nextIndex !== -1) {
      playTrack(nextIndex);
    }
  } else if (command === "toggle-play") {
    if (audioEl.paused) {
      audioEl.play();
    } else {
      audioEl.pause();
    }
  } else if (command === "set-mode") {
    if (data && data.mode) {
      setPlaybackMode(data.mode);
    }
  } else if (command === "volume-up") {
    adjustVolume(0.05);
  } else if (command === "volume-down") {
    adjustVolume(-0.05);
  }
});

window.api.onScanProgress((progress) => {
  if (!progress) return;
  if (progress.phase === "scan") {
    setScanStatus(`正在扫描: ${progress.scanned} 首`, true);
  } else if (progress.phase === "done") {
    setScanStatus(`扫描完成，共 ${progress.scanned} 首`, false);
  }
});

updateModeUI();
setPlayButtonState(false);
setVinylSpinning(false);
updateMuteIcon();
updateLyricsVisibility();
setCover(null);
updateNavText("心悦");

loadSettingsAndScan();
