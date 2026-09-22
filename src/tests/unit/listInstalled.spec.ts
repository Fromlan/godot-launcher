import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { listInstalled, importExisting } from '../../main/services/godotManager';

let tmp: string;

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), 'gl-list-' + Math.random().toString(36).slice(2));
  await fs.mkdir(tmp, { recursive: true });
  process.env.GL_DATA_DIR = tmp;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('listInstalled 优先用 manifest.executablePath', () => {
  it('导入非标准命名的 exe 后能列出', async () => {
    // 用户目录 Godot_v4.7.2-stable_win64 但 exe 文件名是 Godot_v4.7.2-stable_win64.exe
    const dir = path.join(tmp, 'Godot_v4.7.2-stable_win64');
    await fs.mkdir(dir, { recursive: true });
    const exe = path.join(dir, 'Godot_v4.7.2-stable_win64.exe');
    await fs.writeFile(exe, 'fake');

    const v = await importExisting({ executablePath: exe });
    expect(v.executablePath).toBe(exe);

    const list = await listInstalled();
    expect(list).toHaveLength(1);
    expect(list[0].executablePath).toBe(exe);
    expect(list[0].tag).toBe('4.7.2-stable');
  });

  it('导入标准命名 Godot_v4.exe 也正常', async () => {
    const dir = path.join(tmp, 'Godot_v4.6.2-stable_win64');
    await fs.mkdir(dir, { recursive: true });
    const exe = path.join(dir, 'Godot_v4.exe');
    await fs.writeFile(exe, 'fake');

    await importExisting({ executablePath: exe });
    const list = await listInstalled();
    expect(list).toHaveLength(1);
    expect(list[0].executablePath).toBe(exe);
  });

  it('manifest.executablePath 已失效时,fallback 到 resolveExecutable', async () => {
    const dir = path.join(tmp, 'Godot_v4.6.2-stable_win64');
    await fs.mkdir(dir, { recursive: true });
    const custom = path.join(dir, 'MyGodot.exe');
    await fs.writeFile(custom, 'fake');
    const standard = path.join(dir, 'Godot_v4.exe');
    await fs.writeFile(standard, 'fake');

    // 先导入 custom
    await importExisting({ executablePath: custom });
    // 删掉 custom,保留 standard
    await fs.unlink(custom);

    const list = await listInstalled();
    expect(list).toHaveLength(1);
    // executablePath 已失效,fallback 到标准名
    expect(list[0].executablePath).toBe(standard);
  });

  it('exe 完全不存在时,该版本被过滤', async () => {
    const dir = path.join(tmp, 'Godot_v4.6.2-stable_win64');
    await fs.mkdir(dir, { recursive: true });
    const exe = path.join(dir, 'Godot_v4.exe');
    await fs.writeFile(exe, 'fake');
    await importExisting({ executablePath: exe });
    // 删掉所有 exe
    await fs.unlink(exe);

    const list = await listInstalled();
    expect(list).toHaveLength(0);
  });
});
