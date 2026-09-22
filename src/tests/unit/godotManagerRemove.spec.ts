import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { listInstalled, importExisting, removeVersion } from '../../main/services/godotManager';

let tmp: string;

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), 'gl-gmr-' + Math.random().toString(36).slice(2));
  await fs.mkdir(tmp, { recursive: true });
  process.env.GL_DATA_DIR = tmp;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('removeVersion', () => {
  it('删除 installPath 目录 + manifest 移除', async () => {
    const dir = path.join(tmp, 'Godot_v4.6.2-stable_win64');
    await fs.mkdir(dir, { recursive: true });
    const exe = path.join(dir, 'Godot_v4.exe');
    await fs.writeFile(exe, 'fake');
    const v = await importExisting({ executablePath: exe });
    expect(await fs.stat(v.installPath)).toBeDefined();
    await removeVersion(v.id);
    expect(await fs.stat(v.installPath).catch(() => null)).toBeNull();
    expect(await listInstalled()).toEqual([]);
  });

  it('清理残留的 .zip / .zip.part 文件', async () => {
    const dir = path.join(tmp, 'Godot_v4.6.2-stable_win64');
    await fs.mkdir(dir, { recursive: true });
    const exe = path.join(dir, 'Godot_v4.exe');
    await fs.writeFile(exe, 'fake');
    const v = await importExisting({ executablePath: exe });
    const versionsDir = path.join(tmp, 'versions');
    await fs.mkdir(versionsDir, { recursive: true });
    const id = v.id;
    await fs.writeFile(path.join(versionsDir, id + '.zip'), 'junk');
    await fs.writeFile(path.join(versionsDir, id + '.zip.part'), 'junk');
    await removeVersion(id);
    expect(await fs.readdir(versionsDir)).toEqual([]);
  });

  it('不存在的 versionId 静默返回', async () => {
    await expect(removeVersion('does-not-exist')).resolves.toBeUndefined();
  });

  it('removeVersion 不影响其它已安装版本', async () => {
    const a = path.join(tmp, 'Godot_v4.6.2-stable_win64');
    const b = path.join(tmp, 'Godot_v4.8-dev6_win64');
    await fs.mkdir(a, { recursive: true });
    await fs.mkdir(b, { recursive: true });
    await fs.writeFile(path.join(a, 'Godot_v4.exe'), 'fake');
    await fs.writeFile(path.join(b, 'Godot_v4.exe'), 'fake');
    const va = await importExisting({ executablePath: path.join(a, 'Godot_v4.exe') });
    const vb = await importExisting({ executablePath: path.join(b, 'Godot_v4.exe') });
    await removeVersion(va.id);
    const list = await listInstalled();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(vb.id);
  });
});
