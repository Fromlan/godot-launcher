import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import {
  getUserDataDir,
  getConfigPath,
  getVersionsDir,
  makeVersionId,
  toPosix,
  ensureDir,
  dirSize
} from '../../main/utils/path';

describe('path utils', () => {
  beforeEach(() => {
    process.env.GL_DATA_DIR = path.join(os.tmpdir(), 'gl-test-' + Math.random().toString(36).slice(2));
  });

  it('GL_DATA_DIR 注入', () => {
    expect(getUserDataDir()).toContain('gl-test-');
    expect(getConfigPath()).toContain('config.json');
    expect(getVersionsDir()).toMatch(/versions$/);
  });

  it('makeVersionId', () => {
    expect(makeVersionId('4.6-stable', 'stable', 'win64')).toBe('4.6-stable-stable-win64');
  });

  it('toPosix 转换', () => {
    expect(toPosix('a\\b\\c')).toBe('a/b/c');
    expect(toPosix('a/b/c')).toBe('a/b/c');
  });

  it('ensureDir 创建嵌套目录', async () => {
    const target = path.join(getUserDataDir(), 'a', 'b', 'c');
    await ensureDir(target);
    const stat = await fs.stat(target);
    expect(stat.isDirectory()).toBe(true);
  });

  it('dirSize 累加文件字节', async () => {
    const dir = path.join(getUserDataDir(), 'sized');
    await ensureDir(dir);
    await fs.writeFile(path.join(dir, 'a.bin'), Buffer.alloc(100));
    await fs.writeFile(path.join(dir, 'b.bin'), Buffer.alloc(250));
    const total = await dirSize(dir);
    expect(total).toBe(350);
  });
});
