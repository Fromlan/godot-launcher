/**
 * IPC 统一响应包装
 * 所有 invoke 都返回 IpcResult,主进程不抛裸 Error
 */
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; detail?: string } };

/** 事件推送通道(主→渲染) */
export const IPC_EVENTS = {
  versionsDownloadProgress: 'versions:download-progress',
  systemUpdateAvailable: 'system:update-available',
  systemUpdateDownloaded: 'system:update-downloaded',
  projectsLaunched: 'projects:launched',
  trayNavigateTo: 'tray:navigate-to'
} as const;

/** invoke 通道(渲染→主) */
export const IPC_CHANNELS = {
  // 版本
  versionsList: 'versions:list',
  versionsReleases: 'versions:releases',
  versionsDownload: 'versions:download',
  versionsRemove: 'versions:remove',
  versionsSetDefault: 'versions:set-default',
  versionsImport: 'versions:import',
  // 项目
  projectsList: 'projects:list',
  projectsAdd: 'projects:add',
  projectsRemove: 'projects:remove',
  projectsLaunch: 'projects:launch',
  projectsReveal: 'projects:reveal',
  projectsUpdate: 'projects:update',
  // 插件
  pluginsList: 'plugins:list',
  pluginsToggle: 'plugins:toggle',
  pluginsInstallFromAssetLib: 'plugins:install-from-assetlib',
  pluginsAssetLibSearch: 'plugins:assetlib-search',
  pluginsAssetLibDetail: 'plugins:assetlib-detail',
  // 系统
  systemGetSettings: 'system:get-settings',
  systemSetSettings: 'system:set-settings',
  systemCheckUpdate: 'system:check-update',
  systemGetAppVersion: 'system:get-app-version',
  systemRevealLogs: 'system:reveal-logs'
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];
