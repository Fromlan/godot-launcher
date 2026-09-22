import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { importExisting } from '../../main/services/godotManager';

let tmp: string;

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), 'gl-imp-' + Math.random().toString(36).slice(2));
  await fs.mkdir(tmp, { recursive: true });
  process.env.GL_DATA_DIR = tmp;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function makeGodot(parentName: string, fileName = 'Godot_v4.exe', content = 'fake'): Promise<string> {
  const dir = path.join(tmp, parentName);
  await fs.mkdir(dir, { recursive: true });
  const p = path.join(dir, fileName);
  await fs.writeFile(p, content);
  return p;
}

describe('importExisting', () => {
  it('从父目录名 Godot_v4.6.2-stable_win64 推断 tag=4.6.2-stable, channel=stable', async () => {
    const exe = await makeGodot('Godot_v4.6.2-stable_win64');
    const v = await importExisting({ executablePath: exe });
    expect(v.tag).toBe('4.6.2-stable');
    expect(v.channel).toBe('stable');
    expect(v.platform).toBe('win64');
    expect(v.installPath).toBe(path.dirname(exe));
    expect(v.executablePath).toBe(exe);
  });

  it('从 mono 父目录名推断 channel=mono', async () => {
    const exe = await makeGodot('Godot_v4.6.2-stable_mono_win64');
    const v = await importExisting({ executablePath: exe });
    expect(v.tag).toBe('4.6.2-stable');
    expect(v.channel).toBe('mono');
  });

  it('从 dev 后缀名推断', async () => {
    const exe = await makeGodot('Godot_v4.8-dev6_win64');
    const v = await importExisting({ executablePath: exe });
    expect(v.tag).toBe('4.8-dev6');
    expect(v.channel).toBe('stable');
  });

  it('重复导入同 id 时返回原记录且更新路径', async () => {
    const exe = await makeGodot('Godot_v4.6.2-stable_win64');
    const v1 = await importExisting({ executablePath: exe });
    const v2 = await importExisting({ executablePath: exe });
    expect(v1.id).toBe(v2.id);
    expect(v2.executablePath).toBe(exe);
  });

  it('非 .exe 文件抛错', async () => {
    const txt = path.join(tmp, 'Godot_v4.6.2-stable_win64');
    await fs.mkdir(txt, { recursive: true });
    const f = path.join(txt, 'notes.txt');
    await fs.writeFile(f, 'x');
    await expect(importExisting({ executablePath: f })).rejects.toThrow(/\.exe/);
  });

  it('不存在的文件抛错', async () => {
    await expect(importExisting({ executablePath: 'D:/nonexistent.exe' })).rejects.toThrow();
  });

  it('非 Godot 文件夹名也尽量推断(文件名包含版本号)', async () => {
    const exe = await makeGodot('MyCustomGodot', 'Godot_v4.7-stable.exe');
    const v = await importExisting({ executablePath: exe });
    expect(v.tag).toBe('4.7-stable');
  });

  it('彻底无法推断时用 parentName 兜底', async () => {
    const exe = await makeGodot('weird-folder-name');
    const v = await importExisting({ executablePath: exe });
    expect(v.id).toMatch(/weird-folder-name/);
    expect(v.channel).toBe('stable');
  });
});
