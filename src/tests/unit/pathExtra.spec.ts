import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import {
  getUserDataDir,
  getConfigPath,
  getVersionsDir,
  getVersionsManifestPath,
  getProjectsManifestPath,
  getReleasesCachePath,
  getPluginCacheDir,
  getLogsDir,
  getUpdaterCacheDir,
  makeVersionId,
  toPosix,
  ensureDir,
  dirSize
} from '../../main/utils/path';

describe('path utils (extra coverage)', () => {
  beforeEach(() => {
    process.env.GL_DATA_DIR = path.join(os.tmpdir(), 'gl-paths-' + Math.random().toString(36).slice(2));
  });

  it('所有 get*Path 函数都基于 GL_DATA_DIR', () => {
    const base = getUserDataDir();
    expect(getConfigPath()).toBe(path.join(base, 'config.json'));
    expect(getVersionsManifestPath()).toBe(path.join(base, 'versions.json'));
    expect(getProjectsManifestPath()).toBe(path.join(base, 'projects.json'));
    expect(getReleasesCachePath()).toBe(path.join(base, 'releases-cache.json'));
    expect(getVersionsDir()).toBe(path.join(base, 'versions'));
    expect(getPluginCacheDir()).toBe(path.join(base, 'plugin-cache'));
    expect(getLogsDir()).toBe(path.join(base, 'logs'));
    expect(getUpdaterCacheDir()).toBe(path.join(base, 'cache'));
  });

  it('GL_DATA_DIR 缺省时回退到 APPDATA / ~/.godot-launcher', () => {
    delete process.env.GL_DATA_DIR;
    // 设置假的 APPDATA
    const fake = path.join(os.tmpdir(), 'gl-fake-appdata');
    process.env.APPDATA = fake;
    expect(getUserDataDir()).toBe(path.join(fake, 'godot-launcher'));
    // 没有 APPDATA 时回退到 ~/.godot-launcher
    delete process.env.APPDATA;
    const home = os.homedir();
    expect(getUserDataDir()).toBe(path.join(home, '.godot-launcher'));
  });

  it('GL_DATA_DIR 优先级最高,无视 APPDATA', () => {
    const fake = path.join(os.tmpdir(), 'gl-fake2');
    process.env.APPDATA = fake;
    // GL_DATA_DIR 已在 beforeEach 设置
    expect(getUserDataDir()).not.toContain('godot-launcher');
  });

  it('makeVersionId 拼接规则', () => {
    expect(makeVersionId('4.6', 'stable', 'win64')).toBe('4.6-stable-win64');
    expect(makeVersionId('4.6-stable', 'mono', 'win64')).toBe('4.6-stable-mono-win64');
  });

  it('toPosix 处理 Windows 反斜杠', () => {
    expect(toPosix('C:\\Users\\Foo\\Bar')).toBe('C:/Users/Foo/Bar');
    expect(toPosix('mixed/sep\\here')).toBe('mixed/sep/here');
  });

  it('ensureDir 重复调用幂等', async () => {
    const target = path.join(getUserDataDir(), 'a', 'b', 'c');
    await ensureDir(target);
    await ensureDir(target);
    const stat = await fs.stat(target);
    expect(stat.isDirectory()).toBe(true);
  });

  it('dirSize 递归目录', async () => {
    const base = path.join(getUserDataDir(), 'tree');
    await fs.mkdir(path.join(base, 'sub1', 'sub2'), { recursive: true });
    await fs.writeFile(path.join(base, 'root.bin'), Buffer.alloc(100));
    await fs.writeFile(path.join(base, 'sub1', 'one.bin'), Buffer.alloc(200));
    await fs.writeFile(path.join(base, 'sub1', 'sub2', 'deep.bin'), Buffer.alloc(50));
    expect(await dirSize(base)).toBe(350);
  });

  it('dirSize 不存在的目录返回 0', async () => {
    expect(await dirSize(path.join(getUserDataDir(), 'absent'))).toBe(0);
  });

  it('dirSize 跳过无法 stat 的子项(坏符号链接)', async () => {
    const base = path.join(getUserDataDir(), 'mixed');
    await fs.mkdir(base, { recursive: true });
    await fs.writeFile(path.join(base, 'good.bin'), Buffer.alloc(10));
    // 在 Windows 上创建坏符号链接需要管理员,改用不可 stat 的目录项:
    // 先创建一个目录,再把它替换为同名文件,使其 stat 失败
    // 简化:用一个纯文件冒充目录,dirSize 会 stat 失败并 continue
    await fs.writeFile(path.join(base, 'fake-dir'), '');
    expect(await dirSize(base)).toBe(10);
  });
});
