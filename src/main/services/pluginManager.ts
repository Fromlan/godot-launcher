import { promises as fs } from 'node:fs';
import path from 'node:path';
import { unzip } from '../utils/unzip';
import { fetch } from 'undici';
import type { PluginEntry, AssetLibItem } from '../../shared/types/plugin';
import { createLogger } from '../utils/logger';

const log = createLogger('plugin-manager');

/** Per-(projectPath,pluginName) 串行队列,避免同名插件并发 toggle 竞态 */
const locks = new Map<string, Promise<unknown>>();

function lockKey(projectPath: string, pluginName: string): string {
  return projectPath + '||' + pluginName;
}

export async function runPluginOp<T>(projectPath: string, pluginName: string, op: () => Promise<T>): Promise<T> {
  const key = lockKey(projectPath, pluginName);
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(op, op);
  locks.set(key, next.catch(() => undefined));
  try {
    return await next;
  } finally {
    if (locks.get(key) === next.catch(() => undefined)) locks.delete(key);
  }
}

/**
 * 解析 plugin.cfg
 * plugin.cfg 是 INI 格式,只有 [plugin] 一节
 */
function parsePluginCfg(text: string): { name: string; description: string; author: string; version: string; script?: string } {
  const lines = text.split(/\r?\n/);
  let section = '';
  const data: Record<string, Record<string, string>> = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    const sm = /^\[(.+)\]$/.exec(line);
    if (sm) {
      section = sm[1];
      data[section] = data[section] || {};
      continue;
    }
    const kv = /^([^=]+)=(.*)$/.exec(line);
    if (kv && section) {
      let v = kv[2].trim();
      // 去掉首尾引号(INI 中 name="Foo" 是常见写法)
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      data[section][kv[1].trim()] = v;
    }
  }
  const p = data.plugin || {};
  return {
    name: p.name || '',
    description: p.description || '',
    author: p.author || '',
    version: p.version || '0.0.0',
    script: p.script
  };
}

async function readIfExists(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * 单插件扫描:不扫整个 addons/ 目录,直接 stat + readFile 单一 plugin。
 * 用于 togglePlugin 后无需 listLocalPlugins 全部重建。
 */
async function readSinglePlugin(projectPath: string, pluginName: string): Promise<PluginEntry | null> {
  const dir = path.join(projectPath, 'addons', pluginName);
  const stat = await fs.stat(dir).catch(() => null);
  if (!stat || !stat.isDirectory()) return null;
  const enabledPath = path.join(dir, 'plugin.cfg');
  const disabledPath = path.join(dir, 'plugin.cfg.disabled');
  // 优化:先 stat enabled,存在则只读 ENABLED,否则只读 DISABLED
  const enabledStat = await fs.stat(enabledPath).catch(() => null);
  const cfgText = enabledStat && enabledStat.isFile()
    ? await readIfExists(enabledPath)
    : await readIfExists(disabledPath);
  if (!cfgText) return null;
  const enabled = !!(enabledStat && enabledStat.isFile());
  let meta;
  try {
    meta = parsePluginCfg(cfgText);
  } catch (err) {
    log.warn('parse plugin.cfg failed', dir, err);
    return null;
  }
  return {
    name: pluginName,
    path: dir,
    displayName: meta.name || pluginName,
    description: meta.description,
    author: meta.author,
    version: meta.version,
    script: meta.script,
    enabled
  };
}

/** 扫描项目内 addons/ 下的所有插件 */
export async function listLocalPlugins(projectPath: string): Promise<PluginEntry[]> {
  const addonsDir = path.join(projectPath, 'addons');
  let entries: string[];
  try {
    entries = await fs.readdir(addonsDir);
  } catch {
    return [];
  }
  const plugins: PluginEntry[] = [];
  for (const name of entries) {
    const dir = path.join(addonsDir, name);
    const stat = await fs.stat(dir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    // 优化:先 stat enabled,存在则只读 ENABLED;否则读 DISABLED
    const enabledPath = path.join(dir, 'plugin.cfg');
    const disabledPath = path.join(dir, 'plugin.cfg.disabled');
    const enabledStat = await fs.stat(enabledPath).catch(() => null);
    const cfgText = enabledStat && enabledStat.isFile()
      ? await readIfExists(enabledPath)
      : await readIfExists(disabledPath);
    if (!cfgText) continue;
    const enabled = !!(enabledStat && enabledStat.isFile());
    let meta;
    try {
      meta = parsePluginCfg(cfgText);
    } catch (err) {
      log.warn('parse plugin.cfg failed', dir, err);
      continue;
    }
    plugins.push({
      name,
      path: dir,
      displayName: meta.name || name,
      description: meta.description,
      author: meta.author,
      version: meta.version,
      script: meta.script,
      enabled
    });
  }
  return plugins;
}

/**
 * 切换启用状态
 * - 当前启用 → 重命名 plugin.cfg → plugin.cfg.disabled
 * - 当前禁用 → 重命名 plugin.cfg.disabled → plugin.cfg
 * 同名并发调用由 runPluginOp 串行化,避免读状态 → 改名竞态。
 * 重命名后用 readSinglePlugin 重建单条 PluginEntry,避免扫整个 addons/。
 */
export function togglePlugin(projectPath: string, pluginName: string): Promise<PluginEntry> {
  return runPluginOp(projectPath, pluginName, async () => {
    const dir = path.join(projectPath, 'addons', pluginName);
    const enabledPath = path.join(dir, 'plugin.cfg');
    const disabledPath = path.join(dir, 'plugin.cfg.disabled');
    const isEnabled = await readIfExists(enabledPath).then(Boolean);
    if (isEnabled) {
      try {
        await fs.rename(enabledPath, disabledPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          const exists = await readIfExists(disabledPath).then(Boolean);
          if (!exists) throw err;
          return pluginsAfter(projectPath, pluginName);
        }
        throw err;
      }
    } else {
      const exists = await readIfExists(disabledPath);
      if (!exists) throw new Error('找不到 plugin.cfg.disabled');
      try {
        await fs.rename(disabledPath, enabledPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          const exists2 = await readIfExists(enabledPath).then(Boolean);
          if (!exists2) throw err;
          return pluginsAfter(projectPath, pluginName);
        }
        throw err;
      }
    }
    return pluginsAfter(projectPath, pluginName);
  });
}

async function pluginsAfter(projectPath: string, pluginName: string): Promise<PluginEntry> {
  const plugin = await readSinglePlugin(projectPath, pluginName);
  if (!plugin) throw new Error('插件切换后丢失');
  return plugin;
}

/** 从 AssetLib 下载并安装到项目 */
export async function installFromAssetLib(args: {
  projectPath: string;
  item: AssetLibItem;
  cacheDir: string;
}): Promise<PluginEntry> {
  const { projectPath, item, cacheDir } = args;
  if (!item.downloadUrl) throw new Error('该资源没有下载链接');
  const slug = item.title.replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase();
  await fs.mkdir(cacheDir, { recursive: true });
  const cacheFile = path.join(cacheDir, `${item.id}_${item.version}.zip`);
  const tmpCacheFile = cacheFile + '.part';

  // 流式写入 + try/finally 清理
  try {
    if (!(await readIfExists(cacheFile))) {
      log.info('downloading asset', item.id, item.downloadUrl);
      // 下载前清理残留 .part
      try { await fs.unlink(tmpCacheFile); } catch { /* ignore */ }
      const res = await fetch(item.downloadUrl, { headers: { 'User-Agent': 'godot-launcher' } });
      if (!res.ok || !res.body) throw new Error(`asset download failed ${res.status}`);
      const fileHandle = await fs.open(tmpCacheFile, 'w');
      try {
        for await (const chunk of res.body as unknown as AsyncIterable<Buffer>) {
          await fileHandle.write(chunk);
        }
      } finally {
        await fileHandle.close();
      }
      // 下载成功后原子 rename
      await fs.rename(tmpCacheFile, cacheFile);
    }

    const targetDir = path.join(projectPath, 'addons', slug);
    await fs.mkdir(targetDir, { recursive: true });
    await unzip(cacheFile, targetDir, { stripTopLevel: true });

    // 解析并启用(用单插件扫描,不扫整个 addons/)
    const installed = await readSinglePlugin(projectPath, slug);
    if (installed && !installed.enabled) {
      await togglePlugin(projectPath, installed.name);
    }
    if (installed) {
      // 重新读取以拿到最新 enabled 状态
      const refreshed = await readSinglePlugin(projectPath, slug);
      return refreshed || installed;
    }
    return {
      name: slug,
      path: targetDir,
      displayName: item.title,
      description: item.description,
      author: item.author,
      version: item.version,
      enabled: true
    };
  } catch (err) {
    // 任何失败清理 .part
    try { await fs.unlink(tmpCacheFile); } catch { /* ignore */ }
    throw err;
  }
}