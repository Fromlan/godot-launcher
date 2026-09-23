import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { installFromAssetLib, togglePlugin } from '../../main/services/pluginManager';
import type { AssetLibItem, AssetLibRelease, PluginEntry } from '../../shared/types/plugin';

function makeResponse(buf: Buffer, status: number = 200, ok: boolean = true) {
  return {
    ok,
    status,
    body: Readable.from([buf]),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  };
}

let tmp: string;
let project: string;

function newItem(over: Partial<AssetLibItem> = {}): AssetLibItem {
  return {
    publisherSlug: 'demo',
    assetSlug: 'my_plugin',
    name: 'My Plugin',
    publisherName: 'Demo Author',
    description: 'demo',
    type: 0,
    tags: [],
    license: { type: 'MIT', url: '' },
    reviewsScore: 0,
    featured: false,
    thumbnailUrl: '',
    storeUrl: 'https://store.godotengine.org/asset/demo/my_plugin/',
    supportsMono: false,
    lastUpdated: '2026-09-22',
    ...over
  };
}

function newRelease(over: Partial<AssetLibRelease> = {}): AssetLibRelease {
  return {
    id: 11,
    version: '1.0.0',
    stable: true,
    sizeMb: 1.0,
    created: '2026-09-22',
    minGodotVersion: '4.4',
    downloadUrl: 'https://signed.example.com/test.zip?sig=abc',
    ...over
  };
}

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), 'gl-pmi-' + Math.random().toString(36).slice(2));
  project = path.join(tmp, 'proj');
  await fs.mkdir(path.join(project, 'addons'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function makePluginZip(): Promise<Buffer> {
  const src = path.join(tmp, 'src');
  await fs.mkdir(path.join(src, 'my_plugin'), { recursive: true });
  await fs.writeFile(
    path.join(src, 'my_plugin', 'plugin.cfg'),
    '[plugin]\nname="My Plugin"\ndescription="Demo"\nauthor="me"\nversion="1.0.0"\n'
  );
  await fs.writeFile(path.join(src, 'my_plugin', 'main.gd'), 'extends Node\n');
  const zp = path.join(tmp, 'plugin.zip');
  const psCmd = 'powershell.exe';
  const psArgs = ['-NoProfile', '-Command', "Compress-Archive -Path '" + src + "\\my_plugin' -DestinationPath '" + zp + "' -Force"];
  const r = spawnSync(psCmd, psArgs, { stdio: 'pipe' });
  if (r.status !== 0) throw new Error('compress failed: ' + r.stderr?.toString());
  return fs.readFile(zp);
}

/** 构造 Godot 风格 zip:顶层是 addons/<dir>/plugin.cfg。stripTopLevel 会剥一层 addons/,留下 <dir>/plugin.cfg 解到 addons/<pluginSlug>/<dir>/plugin.cfg(嵌套)。 */
async function makeGodonStyleZip(folderName: string): Promise<Buffer> {
  const src = path.join(tmp, 'godot_src');
  const inner = path.join(src, 'addons', folderName);
  await fs.mkdir(inner, { recursive: true });
  await fs.writeFile(path.join(inner, 'plugin.cfg'), '[plugin]\nname="' + folderName + '"\nauthor="me"\nversion="1.0.0"\n');
  await fs.writeFile(path.join(inner, 'main.gd'), 'extends Node\n');
  const zp = path.join(tmp, 'godot.zip');
  const psArgs = ['-NoProfile', '-Command', "Compress-Archive -Path '" + src + "\\addons' -DestinationPath '" + zp + "' -Force"];
  const r = spawnSync('powershell.exe', psArgs, { stdio: 'pipe' });
  if (r.status !== 0) throw new Error('godot compress failed: ' + r.stderr?.toString());
  return fs.readFile(zp);
}

describe('installFromAssetLib(new flow)', () => {
  it('下载 zip,放到 addons/<slug>/,启用插件', async () => {
    const buf = await makePluginZip();
    const releases = [newRelease()];
    const listReleasesFn = vi.fn(async () => releases);
    const downloadFn = vi.fn(async () => makeResponse(buf));
    const entry = await installFromAssetLib({
      projectPath: project,
      item: newItem(),
      cacheDir: path.join(tmp, 'cache'),
      listReleasesFn,
      downloadFn
    });
    expect(entry.name).toBe('my_plugin');
    expect(entry.displayName).toBe('My Plugin');
    expect(entry.enabled).toBe(true);
    expect(listReleasesFn).toHaveBeenCalledTimes(1);
    expect(downloadFn).toHaveBeenCalledTimes(1);
    const dirs = await fs.readdir(path.join(project, 'addons'));
    expect(dirs).toContain('my_plugin');
    const files = await fs.readdir(path.join(project, 'addons', 'my_plugin'));
    expect(files).toContain('plugin.cfg');
  });

  it('Godot 风格 zip(addons/<dir>/plugin.cfg 顶层)解压后能识别(嵌套结构)', async () => {
    const buf = await makeGodonStyleZip('music-loops-mini-set-3');
    const downloadFn = vi.fn(async () => makeResponse(buf));
    const entry = await installFromAssetLib({
      projectPath: project,
      item: newItem({ assetSlug: 'music-loops-mini-set-3', name: 'Music Loops Mini Set 3' }),
      cacheDir: path.join(tmp, 'cache'),
      listReleasesFn: async () => [newRelease()],
      downloadFn
    });
    expect(entry.name).toBe('music-loops-mini-set-3');
    expect(entry.enabled).toBe(true);
    const files = await fs.readdir(path.join(project, 'addons', entry.name));
    expect(files).toContain('plugin.cfg');
    expect(files).not.toContain('music-loops-mini-set-3');
  });

  it('无 release 列表 → 抛 NoCompatibleReleaseError', async () => {
    await expect(
      installFromAssetLib({
        projectPath: project,
        item: newItem(),
        cacheDir: path.join(tmp, 'cache'),
        listReleasesFn: async () => []
      })
    ).rejects.toMatchObject({ name: 'NoCompatibleReleaseError' });
  });

  it('项目 Godot 版本与 release 不兼容 → 抛 NoCompatibleReleaseError + 描述包含版本号', async () => {
    const releases = [newRelease({ minGodotVersion: '4.5.1', maxGodotVersion: '4.6' })];
    await expect(
      installFromAssetLib({
        projectPath: project,
        item: newItem(),
        cacheDir: path.join(tmp, 'cache'),
        projectGodotVersion: '4.2',
        listReleasesFn: async () => releases
      })
    ).rejects.toThrow(/Godot 4\.2/);
  });

  it('首 release 过期 (403) → 重新拉 release 重试一次后成功', async () => {
    const buf = await makePluginZip();
    let calls = 0;
    const downloadFn = vi.fn(async () => {
      calls++;
      if (calls === 1) return makeResponse(Buffer.alloc(0), 403, false);
      return makeResponse(buf);
    });
    const listReleasesFn = vi
      .fn()
      .mockResolvedValueOnce([newRelease({ downloadUrl: 'https://signed.example.com/old.zip?sig=expired' })])
      .mockResolvedValueOnce([newRelease({ downloadUrl: 'https://signed.example.com/new.zip?sig=fresh' })]);
    const entry = await installFromAssetLib({
      projectPath: project,
      item: newItem(),
      cacheDir: path.join(tmp, 'cache'),
      listReleasesFn,
      downloadFn,
      maxReleaseRetries: 1
    });
    expect(entry.enabled).toBe(true);
    expect(downloadFn).toHaveBeenCalledTimes(2);
    expect(listReleasesFn).toHaveBeenCalledTimes(2);
  });

  it('403 超过 maxReleaseRetries 时抛错', async () => {
    const downloadFn = vi.fn(async () => makeResponse(Buffer.alloc(0), 403, false));
    await expect(
      installFromAssetLib({
        projectPath: project,
        item: newItem(),
        cacheDir: path.join(tmp, 'cache'),
        listReleasesFn: async () => [newRelease({ downloadUrl: 'https://signed.example.com/x.zip' })],
        downloadFn,
        maxReleaseRetries: 1
      })
    ).rejects.toThrow(/asset download failed/);
  });

  it('二次安装相同 item 命中缓存不再走下载', async () => {
    const buf = await makePluginZip();
    const downloadFn = vi.fn(async () => makeResponse(buf));
    const releases = [newRelease()];
    const listReleasesFn = vi.fn(async () => releases);
    await installFromAssetLib({
      projectPath: project,
      item: newItem(),
      cacheDir: path.join(tmp, 'cache'),
      listReleasesFn,
      downloadFn
    });
    expect(downloadFn).toHaveBeenCalledTimes(1);
    await fs.rm(path.join(project, 'addons', 'my_plugin'), { recursive: true, force: true });
    await installFromAssetLib({
      projectPath: project,
      item: newItem(),
      cacheDir: path.join(tmp, 'cache'),
      listReleasesFn,
      downloadFn
    });
    expect(downloadFn).toHaveBeenCalledTimes(1);
  });

  it('assetSlug 含特殊字符的目录名替换为 _', async () => {
    const buf = await makePluginZip();
    const downloadFn = vi.fn(async () => makeResponse(buf));
    const entry = await installFromAssetLib({
      projectPath: project,
      item: newItem({ assetSlug: 'cool/plugin: free!' }),
      cacheDir: path.join(tmp, 'cache'),
      listReleasesFn: async () => [newRelease()],
      downloadFn
    });
    expect(entry.name).toBe('cool_plugin_free');
    expect(await fs.stat(path.join(project, 'addons', 'cool_plugin_free'))).toBeDefined();
  });
});

describe('plugin flatten helper 内部行为', () => {
  it('addons/<dir>/ 结构,flatten 后扁平化', async () => {
    const { flattenToPluginDir } = await import('../../main/services/pluginManager');
    const target = path.join(project, 'addons', 'nestedtest');
    const inner = path.join(target, 'RealDir');
    await fs.mkdir(inner, { recursive: true });
    await fs.writeFile(path.join(inner, 'plugin.cfg'), '[plugin]\nname="X"\n');
    await fs.writeFile(path.join(inner, 'main.gd'), 'extends Node\n');
    const ok = await flattenToPluginDir(target);
    expect(ok).toBe(true);
    const files = await fs.readdir(target);
    expect(files).toContain('plugin.cfg');
    expect(files).toContain('main.gd');
    expect(files).not.toContain('RealDir');
  });
  it('已经扁平时直接返回 true', async () => {
    const { flattenToPluginDir } = await import('../../main/services/pluginManager');
    const target = path.join(project, 'addons', 'flat');
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'plugin.cfg'), '[plugin]\nname="X"\n');
    const ok = await flattenToPluginDir(target);
    expect(ok).toBe(true);
    const files = await fs.readdir(target);
    expect(files).toContain('plugin.cfg');
  });
});

describe('togglePlugin (lock / 并发)', () => {
  it('同名并发 toggle 最终状态确定', async () => {
    const dir = path.join(project, 'addons', 'race');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'plugin.cfg'), '[plugin]\nname="Race"\nauthor="me"\nversion="1.0"\n');
    const ops = Array.from({ length: 6 }, () => togglePlugin(project, 'race'));
    await Promise.all(ops);
    const files = await fs.readdir(dir);
    expect(files).toContain('plugin.cfg');
  });

  it('不同插件名的 toggle 不互相影响', async () => {
    for (const n of ['a', 'b']) {
      const dir = path.join(project, 'addons', n);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'plugin.cfg'), '[plugin]\nname="x"\n');
    }
    await Promise.all([togglePlugin(project, 'a'), togglePlugin(project, 'b')]);
    for (const n of ['a', 'b']) {
      const files = await fs.readdir(path.join(project, 'addons', n));
      expect(files).toContain('plugin.cfg.disabled');
    }
  });

  it('toggle 启用 plugin.cfg.disabled 缺失时抛错', async () => {
    const dir = path.join(project, 'addons', 'broken');
    await fs.mkdir(dir, { recursive: true });
    await expect(togglePlugin(project, 'broken')).rejects.toThrow();
  });

  it('同插件串行 toggle(逐步)的最终态可控', async () => {
    const dir = path.join(project, 'addons', 'seq');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'plugin.cfg'), '[plugin]\nname="S"\n');
    await togglePlugin(project, 'seq');
    expect(await fs.readdir(dir)).toContain('plugin.cfg.disabled');
    await togglePlugin(project, 'seq');
    expect(await fs.readdir(dir)).toContain('plugin.cfg');
  });
});
