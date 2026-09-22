/** 应用全局配置 */
export interface AppConfig {
  /** 默认 Godot 版本 id */
  defaultVersionId?: string;
  /** 启动项目时附加的全局参数 */
  defaultLaunchArgs: string[];
  /** 关闭窗口是否最小化到托盘 */
  closeToTray: boolean;
  /** 是否开机自启 */
  autoLaunch: boolean;
  /** 启动时是否自动检查更新 */
  autoCheckUpdate: boolean;
  /** Godot Release 缓存的 lastFetchedAt(ISO) */
  releasesCachedAt?: string;
  /** 应用主题,当前固定 'godot-dark' */
  theme: 'godot-dark';
  /** 数据目录覆盖(默认使用 userData) */
  dataDirOverride?: string;
}

/** 默认配置 */
export const DEFAULT_APP_CONFIG: AppConfig = {
  defaultLaunchArgs: [],
  closeToTray: true,
  autoLaunch: false,
  autoCheckUpdate: true,
  theme: 'godot-dark'
};
