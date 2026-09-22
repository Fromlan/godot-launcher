import type { GodotChannel, GodotPlatform } from '../constants/godot';

/** 已注册的 Godot 版本(本地安装) */
export interface GodotVersion {
  /** 唯一 id,推荐使用 `tag-channel-platform` 形式 */
  id: string;
  /** GitHub tag,例如 4.6-stable */
  tag: string;
  /** 人类可读版本名,例如 4.6.2-stable */
  label: string;
  channel: GodotChannel;
  platform: GodotPlatform;
  /** 解压后的目录路径 */
  installPath: string;
  /** 编辑器可执行文件绝对路径 */
  executablePath: string;
  /** 字节大小(目录占用) */
  sizeBytes: number;
  /** ISO 时间戳 */
  installedAt: string;
}

/** GitHub Release 远端信息 */
export interface ReleaseInfo {
  tag: string;
  label: string;
  channel: GodotChannel;
  platform: GodotPlatform;
  /** 下载 URL(指向 .zip) */
  downloadUrl: string;
  /** 文件字节大小(用于预估进度) */
  sizeBytes: number;
  /** 是否预发布/测试版 */
  prerelease: boolean;
  /** 发布时间 ISO */
  publishedAt: string;
}

/** 下载进度事件 payload */
export interface DownloadProgress {
  tag: string;
  channel: GodotChannel;
  platform: GodotPlatform;
  /** 已下载字节 */
  receivedBytes: number;
  /** 总字节(若未知则为 0) */
  totalBytes: number;
  /** 0-100 */
  percent: number;
  /** 阶段:'downloading' | 'extracting' | 'done' | 'error' */
  phase: 'downloading' | 'extracting' | 'done' | 'error';
  message?: string;
}
