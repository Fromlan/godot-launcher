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
    // Godot 启用/禁用做法:重命名 plugin.cfg.disabled ↔ plugin.cfg
    const enabledPath = path.join(dir, 'plugin.cfg');
    const disabledPath = path.join(dir, 'plugin.cfg.disabled');
    const enabledCfg = await readIfExists(enabledPath);
    const disabledCfg = await readIfExists(disabledPath);
    const cfgText = enabledCfg || disabledCfg;
    if (!cfgText) continue;
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
      enabled: !!enabledCfg
    });
  }
  return plugins;
}

/**
 * 切换启用状态
 * - 当前启用 → 重命名 plugin.cfg → plugin.cfg.disabled
 * - 当前禁用 → 重命名 plugin.cfg.disabled → plugin.cfg
 * 同名并发调用由 runPluginOp 串行化,避免读状态 → 改名竞态。
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
          // 竞态兜底:其它调用已经先重命名了,再读一次决定结果
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
  const plugins = await listLocalPlugins(projectPath);
  const found = plugins.find((p) => p.name === pluginName);
  if (!found) throw new Error('插件切换后丢失');
  return found;
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

  if (!(await readIfExists(cacheFile))) {
    log.info('downloading asset', item.id, item.downloadUrl);
    const res = await fetch(item.downloadUrl, { headers: { 'User-Agent': 'godot-launcher' } });
    if (!res.ok || !res.body) throw new Error(`asset download failed ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(cacheFile, buf);
  }

  const targetDir = path.join(projectPath, 'addons', slug);
  await fs.mkdir(targetDir, { recursive: true });
  await unzip(cacheFile, targetDir, { stripTopLevel: true });

  // 解析并启用
  const plugins = await listLocalPlugins(projectPath);
  const installed = plugins.find((p) => p.path === targetDir);
  if (installed && !installed.enabled) {
    await togglePlugin(projectPath, installed.name);
  }
  return installed || {
    name: slug,
    path: targetDir,
    displayName: item.title,
    description: item.description,
    author: item.author,
    version: item.version,
    enabled: true
  };
}







