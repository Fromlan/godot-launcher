import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { sha256File, sha256Buffer, ensureNoExistingFile } from '../../main/utils/hash';

let tmp: string;

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), 'gl-hash-' + Math.random().toString(36).slice(2));
  await fs.mkdir(tmp, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

function expectedHex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

describe('sha256Buffer', () => {
  it('Buffer 计算正确', () => {
    const buf = Buffer.from('hello world');
    expect(sha256Buffer(buf)).toBe(expectedHex(buf));
  });

  it('空 Buffer 返回 e3b0c44...', () => {
    expect(sha256Buffer(Buffer.alloc(0))).toBe(expectedHex(Buffer.alloc(0)));
  });

  it('不同输入得到不同 hash', () => {
    expect(sha256Buffer(Buffer.from('a'))).not.toBe(sha256Buffer(Buffer.from('b')));
  });
});

describe('sha256File', () => {
  it('文件计算结果与 Buffer 一致', async () => {
    const data = 'streamed content';
    const file = path.join(tmp, 'a.bin');
    await fs.writeFile(file, data);
    expect(await sha256File(file)).toBe(expectedHex(Buffer.from(data)));
  });

  it('大文件流式读取(>64KB,触发多个 chunk)', async () => {
    const data = 'x'.repeat(256 * 1024);
    const file = path.join(tmp, 'big.bin');
    await fs.writeFile(file, data);
    expect(await sha256File(file)).toBe(expectedHex(Buffer.from(data)));
  });

  it('不存在的文件 reject', async () => {
    await expect(sha256File(path.join(tmp, 'absent.bin'))).rejects.toThrow();
  });
});

describe('ensureNoExistingFile', () => {
  it('不存在时静默通过', async () => {
    await expect(ensureNoExistingFile(path.join(tmp, 'nope'))).resolves.toBeUndefined();
  });

  it('存在时抛错', async () => {
    const file = path.join(tmp, 'exist.txt');
    await fs.writeFile(file, 'x');
    await expect(ensureNoExistingFile(file)).rejects.toThrow(/file exists/);
  });

});
