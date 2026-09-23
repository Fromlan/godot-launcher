import { contextBridge, ipcRenderer } from 'electron';
import { IPC_EVENTS } from '../shared/types/ipc';
import type { GodotLauncherApi } from './api';

/**
 * 把 ipcRenderer.invoke 包装成带类型的 call()。所有命名空间方法都通过 call() 间接调用 IPC_CHANNELS。
 */
function call<TReq = unknown, TRes = unknown>(channel: string, payload?: TReq): Promise<TRes> {
  return ipcRenderer.invoke(channel, payload) as Promise<TRes>;
}

/**
 * 通用事件订阅。返回 unsubscribe。
 */
function on<T = unknown>(event: string, handler: (payload: T) => void): () => void {
  const wrapped = (_e: unknown, payload: T) => handler(payload);
  ipcRenderer.on(event, wrapped);
  return () => {
    ipcRenderer.removeListener(event, wrapped);
  };
}

const api = {
  invoke: <TReq = unknown, TRes = unknown>(channel: string, payload?: TReq) =>
    call<TReq, TRes>(channel, payload),
  on: <T = unknown>(event: string, handler: (payload: T) => void) => on<T>(event, handler),

  versions: {
    list: () => call('versions:list'),
    releases: (args?: { forceRefresh?: boolean }) => call('versions:releases', args),
    download: (args: { tag: string; channel: 'stable' | 'mono'; force?: boolean }) =>
      call('versions:download', args),
    remove: (args: { versionId: string }) => call('versions:remove', args),
    setDefault: (args: { versionId: string }) => call('versions:set-default', args),
    importExisting: (args?: { executablePath?: string }) => call('versions:import', args),
    onDownloadProgress: (handler: (p: import('../shared/types/godot').DownloadProgress) => void) =>
      on(IPC_EVENTS.versionsDownloadProgress, handler)
  },

  projects: {
    list: () => call('projects:list'),
    add: (args: { path: string }) => call('projects:add', args),
    remove: (args: { id: string }) => call('projects:remove', args),
    update: (args: { id: string; patch: Partial<import('../shared/types/project').ProjectEntry> }) =>
      call('projects:update', args),
    launch: (args: { id: string; options?: import('../shared/types/project').LaunchOptions }) =>
      call('projects:launch', args),
    reveal: (args: { id: string }) => call('projects:reveal', args)
  },

  plugins: {
    list: (args: { projectId: string }) => call('plugins:list', args),
    toggle: (args: { projectId: string; pluginName: string }) => call('plugins:toggle', args),
    search: (q: import('../shared/types/plugin').AssetLibSearchQuery) => call('plugins:assetlib-search', q),
    detail: (args: { publisherSlug: string; assetSlug: string }) =>
      call('plugins:assetlib-detail', args),
    install: (args: { projectId: string; item: import('../shared/types/plugin').AssetLibItem }) =>
      call('plugins:install-from-assetlib', args)
  },

  system: {
    getSettings: () => call('system:get-settings'),
    setSettings: (patch: Partial<import('../shared/types/settings').AppConfig>) =>
      call('system:set-settings', { patch }),
    checkUpdate: () => call('system:check-update'),
    getAppVersion: () => call('system:get-app-version'),
    revealLogs: () => call('system:reveal-logs'),
    listLogs: () => call('system:list-logs'),
    readLog: (args: { name: string; maxBytes?: number }) => call('system:read-log', args),
    clearLogs: () => call('system:clear-logs'),
    onUpdateAvailable: (handler: (info: unknown) => void) => on(IPC_EVENTS.systemUpdateAvailable, handler),
    onUpdateDownloaded: (handler: (info: unknown) => void) => on(IPC_EVENTS.systemUpdateDownloaded, handler)
  }
} as const satisfies GodotLauncherApi;

contextBridge.exposeInMainWorld('api', api);