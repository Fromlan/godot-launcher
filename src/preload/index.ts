import { contextBridge, ipcRenderer } from 'electron';
import type { IpcChannel, IpcEvent } from '../shared/types/ipc';

// 通用 invoke 包装,带 ok 判断的轻量回调
function call<T = unknown>(channel: IpcChannel, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

const api = {
  // 通用底层
  invoke: (channel: IpcChannel, payload?: unknown) => ipcRenderer.invoke(channel, payload) as Promise<unknown>,
  on: (event: IpcEvent, handler: (payload: unknown) => void) => {
    const wrapped = (_e: unknown, payload: unknown) => handler(payload);
    ipcRenderer.on(event, wrapped);
    return () => ipcRenderer.removeListener(event, wrapped);
  },

  // 命名空间 API
  versions: {
    list: () => call('versions:list'),
    releases: (args?: { forceRefresh?: boolean }) => call('versions:releases', args),
    download: (args: { tag: string; channel: 'stable' | 'mono' }) => call('versions:download', args),
    remove: (args: { versionId: string }) => call('versions:remove', args),
    setDefault: (args: { versionId: string }) => call('versions:set-default', args),
    importExisting: (args?: { executablePath?: string }) => call('versions:import', args ?? {})
  },
  projects: {
    list: () => call('projects:list'),
    add: (args: { path: string }) => call('projects:add', args),
    remove: (args: { id: string }) => call('projects:remove', args),
    launch: (args: { id: string; options?: unknown }) => call('projects:launch', args),
    reveal: (args: { id: string }) => call('projects:reveal', args)
  },
  plugins: {
    list: (args: { projectId: string }) => call('plugins:list', args),
    toggle: (args: { projectId: string; pluginName: string }) => call('plugins:toggle', args),
    search: (q: unknown) => call('plugins:assetlib-search', q),
    detail: (args: { id: string }) => call('plugins:assetlib-detail', args),
    install: (args: { projectId: string; item: unknown }) => call('plugins:install-from-assetlib', args)
  },
  system: {
    getSettings: () => call('system:get-settings'),
    setSettings: (patch: unknown) => call('system:set-settings', { patch }),
    checkUpdate: () => call('system:check-update'),
    getAppVersion: () => call('system:get-app-version'),
    revealLogs: () => call('system:reveal-logs')
  }
};

contextBridge.exposeInMainWorld('api', api);
