import type { IpcChannel, IpcEvent, IpcResult, LogFileInfo } from '../shared/types/ipc';
import type { GodotVersion, ReleaseInfo, DownloadProgress } from '../shared/types/godot';
import type { ProjectEntry, LaunchOptions } from '../shared/types/project';
import type { PluginEntry, AssetLibSearchQuery, AssetLibSearchResult, AssetLibItem } from '../shared/types/plugin';
import type { AppConfig } from '../shared/types/settings';

interface GodotLauncherApi {
  invoke<TReq = unknown, TRes = unknown>(channel: IpcChannel, payload?: TReq): Promise<IpcResult<TRes>>;
  on(event: IpcEvent, handler: (payload: unknown) => void): () => void;

  versions: {
    list(): Promise<IpcResult<GodotVersion[]>>;
    releases(args?: { forceRefresh?: boolean }): Promise<IpcResult<{ releases: ReleaseInfo[]; cachedAt: string | null; stale: boolean }>>;
    download(args: { tag: string; channel: 'stable' | 'mono' }): Promise<IpcResult<GodotVersion>>;
    remove(args: { versionId: string }): Promise<IpcResult<void>>;
    setDefault(args: { versionId: string }): Promise<IpcResult<void>>;
    importExisting(args?: { executablePath?: string }): Promise<IpcResult<GodotVersion>>;
    onDownloadProgress(handler: (p: DownloadProgress) => void): () => void;
  };
  projects: {
    list(): Promise<IpcResult<ProjectEntry[]>>;
    add(args: { path: string }): Promise<IpcResult<ProjectEntry>>;
    remove(args: { id: string }): Promise<IpcResult<void>>;
    launch(args: { id: string; options?: LaunchOptions }): Promise<IpcResult<{ logFile: string; pid: number | null }>>;
    reveal(args: { id: string }): Promise<IpcResult<void>>;
  };
  plugins: {
    list(args: { projectId: string }): Promise<IpcResult<PluginEntry[]>>;
    toggle(args: { projectId: string; pluginName: string }): Promise<IpcResult<PluginEntry>>;
    search(q: AssetLibSearchQuery): Promise<IpcResult<AssetLibSearchResult>>;
    detail(args: { id: string }): Promise<IpcResult<AssetLibItem>>;
    install(args: { projectId: string; item: AssetLibItem }): Promise<IpcResult<PluginEntry>>;
  };
  system: {
    getSettings(): Promise<IpcResult<AppConfig>>;
    setSettings(patch: Partial<AppConfig>): Promise<IpcResult<AppConfig>>;
    checkUpdate(): Promise<IpcResult<{ status: string; info?: unknown }>>;
    getAppVersion(): Promise<IpcResult<{ version: string; electron: string; node: string }>>;
    revealLogs(): Promise<IpcResult<void>>;
    listLogs(): Promise<IpcResult<LogFileInfo[]>>;
    readLog(args: { name: string; maxBytes?: number }): Promise<IpcResult<string>>;
    clearLogs(): Promise<IpcResult<{ cleared: number }>>;
  };
}

declare global {
  interface Window {
    api: GodotLauncherApi;
  }
}

export {};
