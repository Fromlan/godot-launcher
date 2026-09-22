# Godot Launcher

桌面端 Godot 启动器,管理 **Godot 版本**、**项目**、**插件**(本地 + 官方 AssetLib 在线资源池)。

## 技术栈
- Electron 31 + TypeScript
- React 18 + Vite + Zustand
- electron-store(JSON 持久化)
- electron-updater(自动更新)
- Vitest + Playwright(单测 + E2E)
- electron-builder + NSIS(打包)

## 开发

```
npm install
npm run dev          # 同时启动 vite + electron
npm run build        # 编译主/预/渲染三层
npm run start        # 生产模式启动
npm run test:unit    # 单测
npm run test:e2e     # E2E
npm run package      # 生成 NSIS 安装包
```

## 目录速查
- `src/main/` Electron 主进程(服务、IPC、托盘、Updater)
- `src/preload/` contextBridge 暴露 API
- `src/renderer/` React UI
- `src/shared/` 主/渲共享类型与常量
- `src/tests/` 单测 + E2E

## 数据目录
- `%APPDATA%/godot-launcher/` 配置/版本/项目/缓存/日志
