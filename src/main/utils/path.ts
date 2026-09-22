import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { APP_DIR_NAME, FILE_NAMES } from '../../shared/constants/paths';

/**
 * 解析用户数据目录
 * 测试时可以传入 env.GL_DATA_DIR 注入虚拟目录
 */
export function getUserDataDir(): string {
  if (process.env.GL_DATA_DIR) return process.env.GL_DATA_DIR;
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, APP_DIR_NAME);
  }
  return path.join(os.homedir(), `.${APP_DIR_NAME}`);
}

export function getConfigPath(): string {
  return path.join(getUserDataDir(), FILE_NAMES.config);
}

export function getVersionsManifestPath(): string {
  return path.join(getUserDataDir(), FILE_NAMES.versions);
}

export function getProjectsManifestPath(): string {
  return path.join(getUserDataDir(), FILE_NAMES.projects);
}

export function getReleasesCachePath(): string {
  return path.join(getUserDataDir(), FILE_NAMES.releasesCache);
}

export function getVersionsDir(): string {
  return path.join(getUserDataDir(), FILE_NAMES.versionsDir);
}

export function getPluginCacheDir(): string {
  return path.join(getUserDataDir(), FILE_NAMES.pluginCacheDir);
}

export function getLogsDir(): string {
  return path.join(getUserDataDir(), FILE_NAMES.logsDir);
}

export function getUpdaterCacheDir(): string {
  return path.join(getUserDataDir(), FILE_NAMES.updaterCacheDir);
}

/** 把 Windows 路径分隔符归一化为正斜杠(Godot 配置常用) */
export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/** 版本 id 帮助函数 */
export function makeVersionId(tag: string, channel: string, platform: string): string {
  return `${tag}-${channel}-${platform}`;
}

export async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

/** 递归计算目录占用字节数 */
export async function dirSize(p: string): Promise<number> {
  let total = 0;
  let entries: string[];
  try {
    entries = await fs.readdir(p);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(p, entry);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) total += await dirSize(full);
    else total += stat.size;
  }
  return total;
}
