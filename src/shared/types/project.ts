/** 项目登记条目 */
export interface ProjectEntry {
  /** 唯一 id,UUID */
  id: string;
  /** 磁盘上的项目根目录(包含 project.godot) */
  path: string;
  /** 显示名(从 project.godot 解析,失败时取文件夹名) */
  name: string;
  /** 解析出的项目版本(从 config/version) */
  godotVersion?: string;
  /** 是否为 mono 项目(config/features 含 'mono') */
  isMono: boolean;
  /** 注册时间 ISO */
  addedAt: string;
  /** 最近启动时间 ISO */
  lastOpenedAt?: string;
  /** 启动次数 */
  launchCount: number;
}

/** 项目启动参数 */
export interface LaunchOptions {
  /** 强制使用某个已注册版本,缺省使用设置中的默认版本 */
  versionId?: string;
  /** 额外命令行参数,会追加到 godot --editor 之后 */
  extraArgs?: string[];
  /** 是否以 detached 方式启动(默认 true) */
  detached?: boolean;
}

/** project.godot 中解析出的关键配置 */
export interface ProjectMeta {
  configVersion: string;
  isMono: boolean;
  name?: string;
  mainScene?: string;
}
