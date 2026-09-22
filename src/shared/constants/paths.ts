/**
 * 应用内统一使用的路径/目录名常量
 * 实际文件系统位置通过 electron app.getPath('userData') 获取
 */
export const APP_DIR_NAME = 'godot-launcher';

export const FILE_NAMES = {
  config: 'config.json',
  versions: 'versions.json',
  projects: 'projects.json',
  releasesCache: 'releases-cache.json',
  // 运行时
  versionsDir: 'versions',
  pluginCacheDir: 'plugin-cache',
  logsDir: 'logs',
  updaterCacheDir: 'cache'
} as const;

export const LOG_PREFIX = '[godot-launcher]';
