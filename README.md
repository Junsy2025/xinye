# 心悦（Windows 桌面本地音乐播放器）

这是一个本地音乐播放器，默认扫描当前用户账户下的 `Music` 目录，将所有音乐文件加入播放列表。你可以在应用内修改音乐与歌词扫描目录，设置会持久化到安装目录根部的 `setting/settings.json` 中。

## 功能概览

- 默认扫描 `C:\Users\<当前用户>\Music`
- 音乐与歌词目录均可自定义并永久保存
- 播放控制：上一首/下一首、播放/暂停、音量、进度拖拽
- 播放方式切换：列表循环 / 列表随机 / 单曲循环
- 歌词展示：读取同名 `.lrc` 并随进度更新，支持歌词/唱片视图切换
- 播放列表可滑出/收起，支持搜索
- 托盘运行与关闭行为可设置（默认最小化到托盘）
- 快捷键可配置（默认 Ctrl+Left/Ctrl+Right/Ctrl+Up/Ctrl+Down）
- 主题色提供 5 种可选
- 设置持久化文件位于安装目录下的 `setting/settings.json`

## 基本依赖环境

1. Windows 10 或更高版本
2. Node.js 18+（推荐 20+）
3. npm（随 Node.js 一起安装）

## 启动项目（开发模式）

1. 安装依赖

```bash
npm install
```

2. 启动应用

```bash
npm run start
```

## 打包生成安装包（Windows）

项目使用 `electron-builder` 打包，最终生成一个可安装的 `.exe` 安装包，支持用户选择安装目录。

1. 生成安装包

```bash
npm run dist
```

2. 产物位置

打包完成后，安装包位于 `dist` 目录下，通常类似：

```
dist\xinye.exe
```

3. 安装说明

双击安装包后，会出现安装向导界面，可自定义安装目录（已在打包配置中开启 `allowToChangeInstallationDirectory`）。

## 持久化设置文件

- 应用首次运行后，会在安装目录下生成 `setting/settings.json`
- 文件内容示例：

```json
{
  "musicDir": "C:\\Users\\你的用户名\\Music",
  "lyricsDir": "C:\\Users\\你的用户名\\Music",
  "showLyrics": false,
  "closeBehavior": "minimize",
  "shortcuts": {
    "prev": "Ctrl+Left",
    "next": "Ctrl+Right",
    "volumeUp": "Ctrl+Up",
    "volumeDown": "Ctrl+Down"
  }
}
```

你也可以手动修改该文件来指定扫描目录。

## 歌词文件说明

- 将歌词文件命名为与音频文件相同的文件名（仅扩展名不同）
- 例如：

```
song.mp3
song.lrc
```
