<p align="right">
  <a href="README.en.md">English</a>  <b>|</b>  中文
</p>

<h1 align="center">Godot Launcher</h1>

<p align="center">
  桌面端 Godot 启动器 —— 一个应用搞定 <b>引擎版本</b>、<b>项目</b>、<b>插件</b>(本地 + 官方 AssetLib)管理。
</p>

<p align="center">
  基于 Electron + TypeScript + React,Windows 优先。
</p>

---

## 目录

- [特性](#特性)
- [截图](#截图)
- [技术栈](#技术栈)
- [系统要求](#系统要求)
- [快速开始](#快速开始)
- [一键运行脚本(`dev.bat`)](#一键运行脚本devbat)
- [数据目录与持久化](#数据目录与持久化)
- [项目结构](#项目结构)
- [路线图](#路线图)
- [常见问题](#常见问题)
- [贡献](#贡献)
- [许可证](#许可证)

---

## 特性

- **多版本引擎管理**:稳定版 + mono(.NET)双通道并行下载、解压、注册
- **项目管理**:手动登记路径,一键启动、打开目录、移除
- **插件管理**:
  - 本地插件 `addons/<name>/` 启用 / 禁用(基于 `plugin.cfg` 重命名)
  - 官方 AssetLib 在线资源池,支持搜索、安装到项目、二级缓存
- **系统集成**:开机自启 → 托盘 → 自动更新(GitHub Releases)
- **持久化**:用户配置 / 版本清单 / 项目库 / AssetLib 缓存 / 启动日志均存 `%APPDATA%`,**重启不丢**
- **UI**:Godot 官方暗色风格,主色 `#478CBF`,微动效 + 卡片质感 + Hero 节奏
- **类型安全**:三层独立 tsconfig,主/预/渲全栈 TypeScript 严格模式
- **测试**:202 个单测(25 个 spec)+ 15 个新增覆盖 SHA-256 / ErrorBoundary / preload contract 等,Playwright E2E 框架就绪

## 截图

> 截图待补充(目前为占位):
>
> ![Versions](docs/screenshots/versions.png)
> ![Projects](docs/screenshots/projects.png)
> ![Plugins](docs/screenshots/plugins.png)

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面壳 | Electron 31 LTS |
| 主进程 | Node.js 20 + TypeScript |
| 渲染层 | React 18 + Vite 5 + Zustand |
| 样式 | 原生 CSS + CSS Variables(Godot 主题色) |
| 持久化 | JSON(`%APPDATA%/godot-launcher/`) |
| HTTP | undici |
| 压缩 | yauzl |
| 自动更新 | electron-updater(GitHub Releases) |
| 打包 | electron-builder + NSIS |
| 单测 | Vitest |
| E2E | Playwright + `_electron` |

## 系统要求

- **操作系统**:Windows 10 / 11(64-bit)
- **运行时**:Node.js 20+(开发模式)
- **磁盘**:约 200 MB(应用本身)+ Godot 引擎按版本累加(每个 ~80-110 MB)

## 快速开始

### 安装依赖

```bash
cd D:\UGit\Godot-Launcher
npm install
```

> 提示:若 `electron` 下载慢,设置国内镜像后再装:
>
> ```bash
> set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
> npm install
> ```

### 启动开发模式

```bash
npm run dev
```

应用自动启动 `tsc --watch (主+预)+ Vite + Electron`,支持热重载。

### 构建与发布

```bash
npm run build         # 编译三层(main / preload / renderer)
npm run package       # 出 NSIS 安装包到 out/
```

## 一键运行脚本(`dev.bat`)

项目根有 `dev.bat` 提供交互菜单与快速调用。

**双击打开菜单**,或命令行直接传任务名:

```bash
dev.bat              # 打开菜单
dev.bat dev          # 普通开发
dev.bat clean        # 清空 dist 后启动
dev.bat reset        # 重置 userData 后启动
dev.bat debug        # 调试模式(详细日志)
dev.bat inspect      # 远程调试(等 Chrome DevTools attach)
dev.bat reset-debug  # 重置 + 调试
dev.bat port 5174    # 自定义端口
dev.bat --help       # 帮助
```

菜单:

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

## 数据目录与持久化

所有用户数据持久化在 **`%APPDATA%/godot-launcher/`**:

```
config.json                  应用配置(默认版本、参数、托盘/自启/更新)
versions.json               已安装 Godot 列表
projects.json               项目库
releases-cache.json         GitHub Release 缓存(TTL 6h)
versions/                   Godot 程序本体
plugin-cache/               插件 zip 缓存
logs/                       启动项目时 stdout/stderr
cache/                      electron-updater 临时
```

**重启应用不会丢失数据**(因为数据落在文件系统,与 Electron 进程无关)。

| 操作 | 数据影响 |
|------|----------|
| 关闭 / 重启应用 | ✅ 保留 |
| `npm run dev` / `npm run dev:clean` | ✅ 保留 |
| `npm run dev:reset` | ⚠️ 主动清空 userData |
| 卸载 NSIS 安装包 | ⚠️ 默认保留(可在 `installer.nsh` 加清理) |

## 项目结构

```
Godot-Launcher/
├─ dev.bat                       一键运行脚本(Windows)
├─ package.json / tsconfig.*     工程配置
├─ electron-builder.yml          NSIS 打包配置
├─ vite.config.ts                Vite + React 构建
├─ vitest.config.ts              单测配置
├─ resources/                    图标 / NSIS 自定义脚本
├─ src/
│  ├─ main/                      Electron 主进程
│  │  ├─ index.ts                入口
│  │  ├─ window.ts / tray.ts     窗口 + 托盘
│  │  ├─ autoLaunch.ts / updater.ts
│  │  ├─ ipc/                    IPC 路由
│  │  ├─ services/               业务逻辑(可单测)
│  │  │  ├─ godotManager.ts          版本下载/解压/启动
│  │  │  ├─ godotReleaseSource.ts   GitHub Release 抓取
│  │  │  ├─ projectManager.ts        project.godot 解析
│  │  │  ├─ pluginManager.ts         本地插件 CRUD
│  │  │  ├─ assetLibClient.ts        官方 AssetLib API
│  │  │  └─ settingsService.ts       AppConfig + 开机自启
│  │  └─ utils/                  logger / path / unzip / hash
│  ├─ preload/                   contextBridge 暴露 window.api
│  ├─ renderer/                  React UI
│  │  ├─ pages/                  Versions / Projects / Plugins / Settings
│  │  ├─ components/             Sidebar / Modal / ToastHost
│  │  ├─ hooks/                  useApi / useApiEvent
│  │  ├─ stores/                 Zustand(toast)
│  │  └─ styles/                 theme.css / globals.css
│  ├─ shared/                    主/渲共享类型与常量
│  └─ tests/                     unit + e2e
```

## 路线图

### v0.2 ✅(已完成)

- 项目列表重命名(消费原 dead API `projects:update`)
- preload 重构: `satisfies GodotLauncherApi` 编辑期全栈契约
- GitHub Actions CI(`.github/workflows/ci.yml`)+ release(`.github/workflows/release.yml`)
- Godot 下载 SHA-256 校验 + 流式写入 + 失败清理 `.zip.part`
- AssetLib 安装从一次性 `Buffer.from(...)` 改为流式写入
- `autoLaunch` dev 模式不再污染 Windows 注册表
- 渲染端 ErrorBoundary + 路由 `React.lazy` 懒加载
- `LICENSE` (MIT) + `.nvmrc` (Node 20) + `engines` 字段
- vitest coverage thresholds + jsdom + ErrorBoundary 单测
- 应用 logo + icon: 已选定 logo.png,生成 resources/icon.ico(16/32/48/64/128/256 多分辨率)与 resources/tray.ico(16/32),删除 .icon-candidates/ 备选目录

### v0.3(计划)

- 项目列表导出 / 导入(跨设备同步)
- NSIS 卸载时询问是否清理 userData(`resources/installer.nsh`)
- macOS / Linux 支持(扩展 `resolveExecutable` 平台分支)
- tray 真实图标(`resources/icon.ico` 由 `scripts/build-icon.mjs` 生成)

### v1.0(目标)

- 自动发布流水线(`v*` tag 触发, 上传 NSIS 包到 GitHub Releases)
- Auto-update 走完整 `electron-updater` 流程(设置 `GH_TOKEN` 后)
- OAuth 登录 AssetLib(可选)
- 命令行参数预设编辑器 + 项目模板

## 发布

在仓库设 Settings → Secrets and variables → Actions 中配置 `GH_TOKEN`(classic PAT, `repo` scope)。

```
git tag v0.2.0
git push origin v0.2.0
```

`v*` tag 推送后会触发 `.github/workflows/release.yml`, 自动出 NSIS 包并上传到 GitHub Release。

如果没有 `GH_TOKEN`, workflow 会在推送阶段明确报错。

## 常见问题

**Q: 解压大版本时卡在「解压中」**

A:Windows Defender 实时扫描会显著拖慢解压。已加进度回报(显示文件名 + 进度)+ 5 分钟超时。如仍卡,可临时关闭实时扫描或将 Godot zip 加入白名单。

**Q: 默认端口 5173 被占**

A: 用 `npm run dev:port 5174` 或编辑 `vite.config.ts`。

**Q: electron 下载慢**

A: 设置 `ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/` 后重装。

**Q: 想重置所有用户数据**

A: `npm run dev:reset` 或手动删 `%APPDATA%/godot-launcher/`。

## 贡献

欢迎 PR 与 Issue。在提大改之前请先开 Issue 讨论。

```bash
git checkout -b feature/xxx
git commit -m "feat: ..."
git push origin feature/xxx
```

## 许可证

[MIT](LICENSE)
