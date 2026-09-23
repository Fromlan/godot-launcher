<p align="right">
  English  <b>|</b>  <a href="README.md">中文</a>
</p>

<h1 align="center">Godot Launcher</h1>

<p align="center">
  A desktop launcher for Godot -- manage <b>engine versions</b>, <b>projects</b>, and <b>plugins</b> (local + official AssetLib) in one app.
</p>

<p align="center">
  Built with Electron + TypeScript + React. Windows-first.
</p>

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Requirements](#requirements)
- [Getting Started](#getting-started)
- [One-click Script (`dev.bat`)](#one-click-script-devbat)
- [Data Directory & Persistence](#data-directory--persistence)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Multi-version engine management**: stable + mono (.NET) channels side by side. Download, extract, register.
- **Project management**: manual registration. Launch, reveal in Explorer, remove.
- **Plugin management**:
  - Local plugins under `addons/<name>/` -- enable/disable by renaming `plugin.cfg`.
  - Official AssetLib online pool with search, install-to-project, and 2nd-level cache.
- **System integration**: auto-launch on boot, system tray, auto-update (GitHub Releases).
- **Persistent state**: config / version manifest / project list / AssetLib cache / launch logs all live in `%APPDATA%`. **Restart-safe**.
- **UI**: Godot-official dark style, primary `#478CBF`, micro-animations, card polish, editorial hero rhythm.
- **Type-safe**: three-layer isolated tsconfig, full-stack TypeScript strict mode.
- **Tests**: 53 unit tests covering services/utils; Playwright E2E scaffold in place.

## Screenshots

> Coming soon (placeholders below).
>
> ![Versions](docs/screenshots/versions.png)
> ![Projects](docs/screenshots/projects.png)
> ![Plugins](docs/screenshots/plugins.png)

## Tech Stack

| Layer | Tech |
|-------|------|
| Shell | Electron 31 LTS |
| Main | Node.js 20 + TypeScript |
| Renderer | React 18 + Vite 5 + Zustand |
| Styles | Vanilla CSS + CSS Variables (Godot theme) |
| Icons | addons/at-icons (open-source Godot editor icon set) + inline SVG `fill=currentColor` |
| Storage | JSON (`%APPDATA%/godot-launcher/`) |
| HTTP | undici |
| Compression | yauzl |
| Auto-update | electron-updater (GitHub Releases) |
| Packaging | electron-builder + NSIS |
| Unit tests | Vitest |
| E2E | Playwright + `_electron` |

## Requirements

- **OS**: Windows 10 / 11 (64-bit)
- **Runtime**: Node.js 20+ (dev mode)
- **Disk**: ~200 MB (app itself) + Godot engine per version (~80-110 MB each)

## Getting Started

### Install

```bash
cd D:\UGit\Godot-Launcher
npm install
```

> Tip: if `electron` download is slow, use a mirror first:
>
> ```bash
> set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
> npm install
> ```

### Dev mode

```bash
npm run dev
```

This runs `tsc --watch (main + preload) + Vite + Electron` together with HMR.

### Build & package

```bash
npm run build         # Compile three layers
npm run package       # Produce NSIS installer in out/
```

## One-click Script (`dev.bat`)

The repo ships a `dev.bat` with an interactive menu and quick commands.

**Double-click to open the menu**, or pass a task name directly:

```bash
dev.bat              # open menu
dev.bat dev          # default dev
dev.bat clean        # clean dist before launch
dev.bat reset        # reset userData before launch
dev.bat debug        # debug mode (verbose)
dev.bat inspect      # remote debug (wait for Chrome DevTools attach)
dev.bat reset-debug  # reset + debug
dev.bat port 5174    # custom vite port
dev.bat --help       # show help
```

Menu:

```
============================================================
  Godot Launcher  --  Dev Console
============================================================
  [1]  dev                default dev
  [2]  clean              clean dist before launch
  [3]  reset              reset userData before launch
  [4]  debug              debug mode (verbose logs)
  [5]  inspect            enable Node inspector on 9229
  [6]  reset-debug        reset + debug
  [7]  port               custom vite port
  [0]  exit
============================================================
```

## Data Directory & Persistence

All user state lives in **`%APPDATA%/godot-launcher/`**:

```
config.json                  app config (default version, args, tray, autolaunch)
versions.json               installed Godot list
projects.json               project library
releases-cache.json         GitHub Release cache (TTL 6h)
versions/                   Godot binaries
plugin-cache/               plugin zip cache
logs/                       per-project launch stdout/stderr
cache/                      electron-updater temp
```

**Restarting the app does NOT lose data** (state is on disk, independent of the Electron process).

| Action | Data impact |
|--------|-------------|
| Close / restart app | preserved |
| `npm run dev` / `npm run dev:clean` | preserved |
| `npm run dev:reset` | wipes userData on purpose |
| Uninstall NSIS installer | preserved by default (customize in `installer.nsh`) |

## Project Structure

```
Godot-Launcher/
+- dev.bat                       Windows one-click script
+- package.json / tsconfig.*     project config
+- electron-builder.yml          NSIS packaging
+- vite.config.ts                Vite + React build
+- vitest.config.ts              unit tests
+- resources/                    icons / NSIS custom hooks
+- src/
   +- main/                      Electron main process
   |  +- index.ts                entry
   |  +- window.ts / tray.ts     window + tray
   |  +- autoLaunch.ts / updater.ts
   |  +- ipc/                    IPC routes
   |  +- services/               business (unit-testable)
   |  |  +- godotManager.ts          version download/extract/launch
   |  |  +- godotReleaseSource.ts   GitHub Releases fetcher
   |  |  +- projectManager.ts        project.godot parser
   |  |  +- pluginManager.ts         local plugin CRUD
   |  |  +- assetLibClient.ts        official AssetLib API
   |  |  +- settingsService.ts       AppConfig + autolaunch
   |  +- utils/                  logger / path / unzip / hash
   +- preload/                   contextBridge exposes window.api
   +- renderer/                  React UI
   |  +- pages/                  Versions / Projects / Plugins / Settings
   |  +- components/             Sidebar / Modal / ToastHost / Icon
|  +- assets/icons/            inline SVG icons (addons/at-icons subset)
   |  +- hooks/                  useApi / useApiEvent
   |  +- stores/                 Zustand (toast)
   |  +- styles/                 theme.css / globals.css
   +- shared/                    main/renderer shared types & constants
   +- tests/                     unit + e2e
```

## Roadmap

### v0.2 (planned)

- Project list rename (consumes dead `projects:update` API)
- preload rewrite: `satisfies GodotLauncherApi` full-stack contract at compile time
- GitHub Actions CI (`.github/workflows/ci.yml`) + release (`.github/workflows/release.yml`)
- Godot download SHA-256 verification + streamable write + failure cleanup of `.zip.part`
- AssetLib install switched from one-shot `Buffer.from(...)` to streaming write
- `autoLaunch` dev mode no longer pollutes Windows registry
- Renderer-side ErrorBoundary + route `React.lazy` lazy loading
- `LICENSE` (MIT) + `.nvmrc` (Node 20) + `engines` field
- vitest coverage thresholds + jsdom + ErrorBoundary unit tests
- App logo + icon: logo.png selected; generated resources/icon.ico (16/32/48/64/128/256 multi-resolution) and resources/tray.ico (16/32); removed .icon-candidates/ directory

### v0.3 done

- **Icon system refactor**: introduced `Icon` component + inline `assets/icons/` (19 at-icons hand-picked SVGs), unified `fill=currentColor`, color follows parent color
  - Sidebar nav (atom / folder / cog / wrench) + Toast (check / cross / lightning / info-circle) + buttons (refresh / download / play / trash / pencil / link) + rating (star) + theme (palette) + empty states (search-empty)
  - Replaced original Unicode characters (◈ ▣ ◉ ⚙ etc.) with SVG; consistent, accessible, vector-scalable
- **UI style polish**: cards now use flex column layout, height follows content; buttons get `white-space: nowrap` + `min-width` + `flex-shrink: 0` to stop icon/text vertical overflow
- **dev startup ESM/CJS fix**: `scripts/dev.mjs` now auto-runs `write-pkg-type.mjs` to write `dist-main/package.json` + `dist-preload/package.json` (`type: commonjs`), preventing Electron from treating them as ESM (which produced the cryptic `exports is not defined` error)
- **Icon rendering fix**: `Icon` component now passes the source SVG's `viewBox` to the React `\<svg\>` element — otherwise path data outside the `width`/`height` box gets clipped by SVG's default `overflow: hidden`. This was the root cause of every icon showing as a truncated blob.

### v0.4 (planned)

- Project list export / import (cross-device sync)
- NSIS uninstall prompt for userData cleanup (`resources/installer.nsh`)
- macOS / Linux support (extend `resolveExecutable` platform branches)
- Tray real icon (`resources/icon.ico` generated by `scripts/build-icon.mjs`)

### v1.0 (goal)

- Auto-release pipeline (`v*` tag triggered, uploads NSIS package to GitHub Releases)
- Auto-update via `electron-updater` end-to-end (after configuring `GH_TOKEN`)
- AssetLib OAuth (optional)
- CLI argument presets and project templates

## Release

Configure `GH_TOKEN` (classic PAT with `repo` scope) in repository Settings → Secrets and variables → Actions.

```
git tag v0.2.0
git push origin v0.2.0
```

A `v*` tag push triggers `.github/workflows/release.yml`, which builds the NSIS package and uploads it to the GitHub Release.

Without `GH_TOKEN`, the workflow fails clearly at the publish step.

## FAQ

**Q: Extraction of large versions stalls at "extracting".**

A: Windows Defender real-time scanning can significantly slow extraction. The app now shows per-file progress + 5-min timeout. As a workaround, temporarily disable scanning or whitelist Godot zips.

**Q: Default vite port 5173 is taken.**

A: `npm run dev:port 5174` or edit `vite.config.ts`.

**Q: `electron` download is slow.**

A: `set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/` then reinstall.

**Q: How do I reset user data?**

A: `npm run dev:reset` or manually delete `%APPDATA%/godot-launcher/`.

## Contributing

PRs and Issues are welcome. Open an Issue first for large changes.

```bash
git checkout -b feature/xxx
git commit -m "feat: ..."
git push origin feature/xxx
```

## License

[MIT](LICENSE)
