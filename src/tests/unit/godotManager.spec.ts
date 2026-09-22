import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

describe('godotManager.resolveExecutable', () => {
  let resolveExecutable: (installPath: string, channel: 'stable' | 'mono') => string | null;

  beforeEach(async () => {
    process.env.GL_DATA_DIR = path.join(os.tmpdir(), 'gl-gm-' + Math.random().toString(36).slice(2));
    const mod = await import('../../main/services/godotManager');
    resolveExecutable = mod.resolveExecutable;
  });

  it('stable 找到 Godot_v4.exe', async () => {
    const dir = path.join(os.tmpdir(), 'gm-stable');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'Godot_v4.exe'), '');
    const exe = resolveExecutable(dir, 'stable');
    expect(exe).toBe(path.join(dir, 'Godot_v4.exe'));
  });

  it('mono 找到 Godot_v4_mono.exe', async () => {
    const dir = path.join(os.tmpdir(), 'gm-mono');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'Godot_v4_mono.exe'), '');
    const exe = resolveExecutable(dir, 'mono');
    expect(exe).toBe(path.join(dir, 'Godot_v4_mono.exe'));
  });

  it('目录无 exe 返回 null', async () => {
    const dir = path.join(os.tmpdir(), 'gm-empty');
    await fs.mkdir(dir, { recursive: true });
    const exe = resolveExecutable(dir, 'stable');
    expect(exe).toBeNull();
  });
});
