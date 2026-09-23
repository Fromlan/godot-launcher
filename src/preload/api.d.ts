/**
 * preload → renderer 的全栈 IPC 契约(单一接口源)。
 *
 * - preload/index.ts 的 `api` 对象必须 `satisfies GodotLauncherApi`,保证实现 ↔ 类型严格一致
 * - renderer 端通过 `window.api.*` 调用,IDE 智能填充 + 编译期类型检查
 * - 主进程侧 IPC handler 名通过 `src/shared/types/ipc.ts` 的常量定义,避免散落字符串
 */
import type {
  IpcResult,
  IpcChannel,
  IpcEvent,
  LogFileInfo
} from '../shared/types/ipc';
import type {
  GodotVersion,
  ReleaseInfo,
  DownloadProgress
} from '../shared/types/godot';
import type {
  ProjectEntry,
  LaunchOptions
} from '../shared/types/project';
import type {
  PluginEntry,
  AssetLibSearchQuery,
  AssetLibSearchResult,
  AssetLibItem
} from '../shared/types/plugin';
import type { AppConfig } from '../shared/types/settings';

export interface GodotLauncherApi {
  /** 通用底层 invoke,可在不修改本接口时调用新通道 */
  invoke<TReq = unknown, TRes = unknown>(channel: IpcChannel, payload?: TReq): Promise<IpcResult<TRes>>;

  /** 通用事件订阅,返回 unsubscribe */
  on<T = unknown>(event: IpcEvent, handler: (payload: T) => void): () => void;

  versions: {
    list(): Promise<IpcResult<GodotVersion[]>>;
    releases(args?: { forceRefresh?: boolean }): Promise<IpcResult<{ releases: ReleaseInfo[]; cachedAt: string | null; stale: boolean }>>;
    download(args: { tag: string; channel: 'stable' | 'mono'; force?: boolean }): Promise<IpcResult<GodotVersion>>;
    remove(args: { versionId: string }): Promise<IpcResult<void>>;
    setDefault(args: { versionId: string }): Promise<IpcResult<void>>;
    importExisting(args?: { executablePath?: string }): Promise<IpcResult<GodotVersion>>;
    /** 订阅下载进度推送,返回 unsubscribe */
    onDownloadProgress(handler: (p: DownloadProgress) => void): () => void;
  };

  projects: {
    list(): Promise<IpcResult<ProjectEntry[]>>;
    add(args: { path: string }): Promise<IpcResult<ProjectEntry>>;
    remove(args: { id: string }): Promise<IpcResult<void>>;
    update(args: { id: string; patch: Partial<ProjectEntry> }): Promise<IpcResult<ProjectEntry>>;
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
    /** 订阅更新可用事件(electron-updater 检测到新版本) */
    onUpdateAvailable(handler: (info: unknown) => void): () => void;
    /** 订阅更新下载完成事件(下次启动时安装) */
    onUpdateDownloaded(handler: (info: unknown) => void): () => void;
  };
}

declare global {
  interface Window {
    api: GodotLauncherApi;
  }
}

export {};