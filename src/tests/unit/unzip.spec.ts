import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { unzip } from '../../main/utils/unzip';

let tmp: string;
let zipPath: string;
let destDir: string;

async function createTestZip(entries: Array<{ name: string; data: string }>): Promise<string> {
  const dir = path.join(tmp, 'src');
  await fs.mkdir(dir, { recursive: true });
  const zp = path.join(dir, 'test.zip');
  // 使用 PowerShell 的 Compress-Archive(Windows 自带)
  // 先把所有文件写到 dir 中,然后 Compress-Archive
  for (const e of entries) {
    const p = path.join(dir, e.name);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, e.data);
  }
  const r = spawnSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${dir}\\*' -DestinationPath '${zp}' -Force`
  ], { stdio: 'pipe' });
  if (r.status !== 0) throw new Error('compress failed: ' + r.stderr?.toString());
  return zp;
}

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), 'gl-unzip-' + Math.random().toString(36).slice(2));
  await fs.mkdir(tmp, { recursive: true });
  zipPath = await createTestZip([
    { name: 'Godot_v4.7.2-stable_win64/Godot_v4.exe', data: 'fake-exe-content' },
    { name: 'Godot_v4.7.2-stable_win64/README.md', data: '# Godot\n\nHello world.' },
    { name: 'Godot_v4.7.2-stable_win64/inner/notes.txt', data: 'inner notes' }
  ]);
  destDir = path.join(tmp, 'out');
  await fs.mkdir(destDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('unzip', () => {
  it('解压带 stripTopLevel 的 Godot 风格 zip', async () => {
    const progressCalls: number[] = [];
    const stats = await unzip(zipPath, destDir, {
      stripTopLevel: true,
      onProgress: (info) => progressCalls.push(info.index)
    });
    expect(stats.entryIndex).toBeGreaterThanOrEqual(3);
    expect(progressCalls.length).toBeGreaterThan(0);
    // 文件应该被解压到 destDir 顶层(已 strip 顶层目录)
    const files = await fs.readdir(destDir);
    expect(files).toContain('Godot_v4.exe');
    expect(files).toContain('README.md');
    expect(files).toContain('inner');
  });

  it('解压失败的 zip 应清理目标目录', async () => {
    const badZip = path.join(tmp, 'bad.zip');
    await fs.writeFile(badZip, 'not a real zip content');
    const target = path.join(tmp, 'fail-out');
    await fs.mkdir(target, { recursive: true });
    await expect(unzip(badZip, target, { timeoutMs: 1000 })).rejects.toThrow();
    // 失败后,目标目录应被清空(无残留文件)
    const exists = await fs.stat(target).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('onProgress 回调提供 entryName 和 index', async () => {
    const seen: string[] = [];
    await unzip(zipPath, destDir, {
      stripTopLevel: true,
      onProgress: (info) => seen.push(info.entryName)
    });
    expect(seen.some((n) => n.includes('Godot_v4.exe'))).toBe(true);
    expect(seen.some((n) => n.includes('README.md'))).toBe(true);
  });
});
