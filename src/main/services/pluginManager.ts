import { promises as fs } from 'node:fs';
import path from 'node:path';
import { unzip } from '../utils/unzip';
import { fetch } from 'undici';
import { ERR_NO_COMPATIBLE_RELEASE, type AssetLibItem, type AssetLibRelease, type PluginEntry } from '../../shared/types/plugin';
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
  projectGodotVersion?: string;
  listReleasesFn?: (publisherSlug: string, assetSlug: string, opts: { stableOnly?: boolean; compatibility?: string }) => Promise<AssetLibRelease[]>;
  downloadFn?: (url: string) => Promise<Response>;
  maxReleaseRetries?: number;
}): Promise<PluginEntry> {
  const {
    projectPath,
    item,
    cacheDir,
    projectGodotVersion,
    listReleasesFn,
    downloadFn,
    maxReleaseRetries = 1
  } = args;
  if (!item.publisherSlug || !item.assetSlug) throw new Error('资源标识不完整');
  const listReleases = listReleasesFn ?? (await import('./storeAssetClient')).listReleases;
  const download = downloadFn ?? (async (u) => fetch(u, { headers: { 'User-Agent': 'godot-launcher' } }));
  const compatibleOnly = projectGodotVersion !== undefined;
  let releases = await listReleases(item.publisherSlug, item.assetSlug, {});
  if (projectGodotVersion) releases = releases.filter((r) => {
    if (!r.minGodotVersion) return false;
    if (r.minGodotVersion > projectGodotVersion) return false;
    if (r.maxGodotVersion && projectGodotVersion > r.maxGodotVersion) return false;
    return true;
  });
  let chosen = pickRelease(releases, projectGodotVersion);
  if (!chosen) {
    const e = new Error(
      compatibleOnly
        ? '该资源没有与当前项目 Godot ' + projectGodotVersion + ' 兼容的可下载版本'
        : '该资源暂无任何可下载版本'
    );
    e.name = ERR_NO_COMPATIBLE_RELEASE;
    throw e;
  }
  const pluginSlug = (item.assetSlug || item.name)
    .replace(/[^a-zA-Z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'plugin';
  await fs.mkdir(cacheDir, { recursive: true });
  // cacheFile 名必须安全:assetSlug 可能含 /: 等 Windows 非法字符,所以分别 sanitize 后拼回。

  const safeId = String(chosen.id);

  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '');

  const cacheBase = sanitize(item.publisherSlug) + '__' + sanitize(item.assetSlug) + '__' + safeId + '.zip';

  const cacheFile = path.join(cacheDir, cacheBase);
  const tmpCacheFile = cacheFile + '.part';
  try {
    if (!(await readIfExists(cacheFile))) {
      for (let attempt = 0; attempt <= maxReleaseRetries; attempt++) {
        try { await fs.unlink(tmpCacheFile); } catch { /* ignore */ }
        log.info('downloading asset', item.publisherSlug + '/' + item.assetSlug, chosen.downloadUrl);
        const res = await download(chosen.downloadUrl);
        if (!res.ok || !res.body) {
          const retryable = res.status === 403 || res.status === 404;
          if (!retryable || attempt >= maxReleaseRetries) {
            throw new Error('asset download failed ' + res.status);
          }
          log.warn('presign URL expired, refetching release', res.status, attempt + 1);
          const next = await listReleases(item.publisherSlug, item.assetSlug, {});
          const filtered = projectGodotVersion
            ? next.filter((r) => r.minGodotVersion && r.minGodotVersion <= projectGodotVersion && (!r.maxGodotVersion || projectGodotVersion <= r.maxGodotVersion))
            : next;
          const nextChosen = pickRelease(filtered, projectGodotVersion);
          if (!nextChosen) throw new Error('asset download failed ' + res.status);
          chosen = nextChosen;
          continue;
        }
        const fileHandle = await fs.open(tmpCacheFile, 'w');
        try {
          for await (const chunk of res.body as unknown as AsyncIterable<Buffer>) {
            await fileHandle.write(chunk);
          }
        } finally {
          await fileHandle.close();
        }
        await fs.rename(tmpCacheFile, cacheFile);
        break;
      }
    }
    const targetDir = path.join(projectPath, 'addons', pluginSlug);
    await fs.mkdir(targetDir, { recursive: true });
    await unzip(cacheFile, targetDir, { stripTopLevel: true });
    // 兜底:很多 Godot 风格 zip 顶层是 'addons/<dir>/plugin.cfg',stripTopLevel 后
    // 会变成 'addons/<pluginSlug>/<dir>/plugin.cfg'(嵌套),readSinglePlugin 找不到。
    // 这里把含 plugin.cfg 的子目录内容搬到 targetDir 顶层。
    await flattenToPluginDir(targetDir);
    const installed = await readSinglePlugin(projectPath, pluginSlug);
    if (installed && !installed.enabled) {
      await togglePlugin(projectPath, installed.name);
    }
    if (installed) {
      const refreshed = await readSinglePlugin(projectPath, pluginSlug);
      return refreshed || installed;
    }
    return {
      name: pluginSlug,
      path: targetDir,
      displayName: item.name,
      description: item.description,
      author: item.publisherName,
      version: chosen.version,
      enabled: true
    };
  } catch (err) {
    try { await fs.unlink(tmpCacheFile); } catch { /* ignore */ }
    throw err;
  }
}

function pickRelease(releases: AssetLibRelease[], projectGodotVersion?: string): AssetLibRelease | null {
  if (releases.length === 0) return null;
  const proj = projectGodotVersion?.trim() || undefined;
  const compat = (r: AssetLibRelease): boolean => {
    if (!proj) return true;
    const min = r.minGodotVersion;
    const max = r.maxGodotVersion;
    if (!min) return false;
    if (min > proj) return false;
    if (max && proj > max) return false;
    return true;
  };
  const stableCompat = releases.filter((r) => r.stable && compat(r));
  if (stableCompat.length) {
    stableCompat.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    return stableCompat[0];
  }
  const anyCompat = releases.filter(compat);
  if (anyCompat.length) {
    anyCompat.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    return anyCompat[0];
  }
  return null;
}


/**
 * 兜底 normalize:某些 zip(如 addons/<dir>/plugin.cfg 风格)解压后 plugin.cfg
 * 不在 targetDir 顶层,而是被嵌套在 targetDir/<sub>/ 下。把含 plugin.cfg 的
 * 一层子目录内容搬到 targetDir,使 readSinglePlugin 能找到。
 */
export async function flattenToPluginDir(targetDir: string): Promise<boolean> {
  if (await readIfExists(path.join(targetDir, 'plugin.cfg'))) return true;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(targetDir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const subDir = path.join(targetDir, ent.name);
    if (await readIfExists(path.join(subDir, 'plugin.cfg'))) {
      const inner = await fs.readdir(subDir, { withFileTypes: true });
      for (const it of inner) {
        const src = path.join(subDir, it.name);
        const dst = path.join(targetDir, it.name);
        try {
          if (it.isDirectory()) {
            await fs.rm(dst, { recursive: true, force: true });
          } else {
            await fs.unlink(dst);
          }
        } catch {
          /* ignore: target may not exist */
        }
        try {
          await fs.rename(src, dst);
        } catch {
          if (it.isDirectory()) {
            await fs.cp(src, dst, { recursive: true });
          } else {
            await fs.copyFile(src, dst);
          }
          await fs.rm(src, { recursive: true, force: true });
        }
      }
      try { await fs.rmdir(subDir); } catch { /* ignore: subdir may be non-empty after partial moves */ }
      return true;
    }
  }
  return false;
}
