import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { installFromAssetLib, togglePlugin } from '../../main/services/pluginManager';

const fetchMock = vi.fn();
vi.mock('undici', () => ({ fetch: (...args: unknown[]) => fetchMock(...args) }));

function makeResponse(buf: Buffer, status = 200, ok = true) {
  return {
    ok,
    status,
    body: Readable.from([buf]),
    arrayBuffer: async () =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  };
}

let tmp: string;
let project: string;

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), 'gl-pmi-' + Math.random().toString(36).slice(2));
  project = path.join(tmp, 'proj');
  await fs.mkdir(path.join(project, 'addons'), { recursive: true });
  fetchMock.mockReset();
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
  const r = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${src}\\my_plugin' -DestinationPath '${zp}' -Force`
    ],
    { stdio: 'pipe' }
  );
  if (r.status !== 0) throw new Error('compress failed: ' + r.stderr?.toString());
  return fs.readFile(zp);
}

const SAMPLE_ITEM = {
  id: '42',
  title: 'My Plugin',
  author: 'someone',
  description: 'Demo plugin',
  godotVersions: ['4.4'],
  supportsMono: false,
  category: 'Tools',
  downloadUrl: 'https://example.com/my_plugin.zip',
  version: '1.0.0',
  modifyDate: '2026-09-22'
};

describe('installFromAssetLib', () => {
  it('下载 zip,放到 addons/<slug>/,启用插件', async () => {
    const buf = await makePluginZip();
    fetchMock.mockResolvedValueOnce(makeResponse(buf));
    const entry = await installFromAssetLib({
      projectPath: project,
      item: SAMPLE_ITEM,
      cacheDir: path.join(tmp, 'cache')
    });
    expect(entry.name).toBe('my_plugin');
    expect(entry.displayName).toBe('My Plugin');
    expect(entry.enabled).toBe(true);
    const dirs = await fs.readdir(path.join(project, 'addons'));
    expect(dirs).toContain('my_plugin');
    const files = await fs.readdir(path.join(project, 'addons', 'my_plugin'));
    expect(files).toContain('plugin.cfg');
  });

  it('没有 downloadUrl 时抛错', async () => {
    await expect(
      installFromAssetLib({
        projectPath: project,
        item: { ...SAMPLE_ITEM, downloadUrl: undefined },
        cacheDir: path.join(tmp, 'cache')
      })
    ).rejects.toThrow(/下载链接/);
  });

  it('下载失败时抛错', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(Buffer.alloc(0), 404, false));
    await expect(
      installFromAssetLib({
        projectPath: project,
        item: SAMPLE_ITEM,
        cacheDir: path.join(tmp, 'cache')
      })
    ).rejects.toThrow(/404/);
  });

  it('二次安装相同 item 命中 cache 不再 fetch', async () => {
    const buf = await makePluginZip();
    fetchMock.mockResolvedValueOnce(makeResponse(buf));
    await installFromAssetLib({
      projectPath: project,
      item: SAMPLE_ITEM,
      cacheDir: path.join(tmp, 'cache')
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await fs.rm(path.join(project, 'addons', 'my_plugin'), { recursive: true, force: true });
    await installFromAssetLib({
      projectPath: project,
      item: SAMPLE_ITEM,
      cacheDir: path.join(tmp, 'cache')
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('title 含特殊字符的 slug 替换为 _', async () => {
    const buf = await makePluginZip();
    fetchMock.mockResolvedValueOnce(makeResponse(buf));
    const entry = await installFromAssetLib({
      projectPath: project,
      item: { ...SAMPLE_ITEM, title: 'Cool/Plugin: Free!' },
      cacheDir: path.join(tmp, 'cache')
    });
    expect(entry.name).toBe('cool_plugin_free_');
    expect(await fs.stat(path.join(project, 'addons', 'cool_plugin_free_'))).toBeDefined();
  });
});

describe('togglePlugin (lock / 并发)', () => {
  it('同名并发 toggle 最终状态确定', async () => {
    const dir = path.join(project, 'addons', 'race');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'plugin.cfg'),
      '[plugin]\nname="Race"\nauthor="me"\nversion="1.0"\n'
    );

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
    await Promise.all([
      togglePlugin(project, 'a'),
      togglePlugin(project, 'b')
    ]);
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
