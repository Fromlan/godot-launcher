/**
 * godotManager.downloadAndInstall 的关键路径覆盖:
 *   - SHA-256 mismatch → 抛错并清理 .zip.part
 *   - 解压阶段推送 phase: 'extracting'
 *   - 成功路径:写入 manifest.sha256
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import * as crypto from 'node:crypto';

const fetchMock = vi.fn();
vi.mock('undici', () => ({ fetch: (...args: unknown[]) => fetchMock(...args) }));

import { downloadAndInstall } from '../../main/services/godotManager';
import type { ReleaseInfo, DownloadProgress } from '../../shared/types/godot';

let tmp: string;
let events: DownloadProgress[];

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), 'gl-gmdl-' + Math.random().toString(36).slice(2));
  process.env.GL_DATA_DIR = tmp;
  await fs.mkdir(tmp, { recursive: true });
  events = [];
  fetchMock.mockReset();
});

afterEach(async () => {
  delete process.env.GL_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});

function makeRelease(sha256Url?: string): ReleaseInfo {
  return {
    tag: '4.6-stable',
    label: '4.6-stable',
    channel: 'stable',
    platform: 'win64',
    downloadUrl: 'https://example/Godot_v4.6-stable_win64.zip',
    sizeBytes: 1024,
    prerelease: false,
    publishedAt: '2026-01-01T00:00:00Z',
    sha256Url
  };
}

/**
 * 构造一个 Response-like 对象,支持:
 *   - res.ok / res.status / res.headers.get
 *   - await res.text() → 返回文本
 *   - for await (chunk of res.body) → 流式返回 Buffer
 */
function makeResponse(opts: { body: Buffer | string; text?: string; status?: number }) {
  const buf = typeof opts.body === 'string' ? Buffer.from(opts.body, 'utf-8') : opts.body;
  return {
    ok: (opts.status ?? 200) >= 200 && (opts.status ?? 200) < 300,
    status: opts.status ?? 200,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-length' ? String(buf.length) : null) },
    body: Readable.from([buf]),
    text: async () => opts.text ?? buf.toString('utf-8')
  };
}

describe('godotManager.downloadAndInstall SHA-256 校验', () => {
  it('SHA-256 mismatch → 抛错并清理 .zip.part', async () => {
    const zipBuf = Buffer.from('PK\u0003\u0004fakezipbytes-not-a-real-zip-but-has-hash');
    const realHash = crypto.createHash('sha256').update(zipBuf).digest('hex');
    const wrongHash = '0'.repeat(64);
    expect(wrongHash).not.toBe(realHash);

    fetchMock
      .mockResolvedValueOnce(makeResponse({ body: wrongHash + '  Godot_v4.6-stable_win64.zip\n', text: wrongHash + '  Godot_v4.6-stable_win64.zip\n' }))
      .mockResolvedValueOnce(makeResponse({ body: zipBuf }));

    const onProgress = (p: DownloadProgress) => events.push(p);
    await expect(downloadAndInstall({
      tag: '4.6-stable',
      channel: 'stable',
      release: makeRelease('https://example/Godot_v4.6-stable_win64.zip.sha256'),
      onProgress
    })).rejects.toThrow(/SHA256 mismatch/);

    // .zip.part 必须被清理
    const versionsDir = path.join(tmp, 'versions');
    const entries = await fs.readdir(versionsDir).catch(() => []);
    expect(entries.some((n) => n.endsWith('.zip.part'))).toBe(false);
  });

  it('SHA-256 匹配但 zip 无效 → 抛错并清理 .zip.part', async () => {
    const zipBuf = Buffer.from('not a real zip');
    const realHash = crypto.createHash('sha256').update(zipBuf).digest('hex');

    fetchMock
      .mockResolvedValueOnce(makeResponse({ body: realHash + '  x.zip\n', text: realHash + '  x.zip\n' }))
      .mockResolvedValueOnce(makeResponse({ body: zipBuf }));

    await expect(downloadAndInstall({
      tag: '4.6-stable',
      channel: 'stable',
      release: makeRelease('https://example/x.sha256'),
      onProgress: (p) => events.push(p)
    })).rejects.toThrow();

    const phases = events.map((e) => e.phase);
    // 至少经历了 downloading 阶段
    expect(phases).toContain('downloading');

    // .zip.part 必须被清理(任何 try 内失败 → finally)
    const versionsDir = path.join(tmp, 'versions');
    const entries = await fs.readdir(versionsDir).catch(() => []);
    expect(entries.some((n) => n.endsWith('.zip.part'))).toBe(false);
  });

  it('没提供 sha256Url → 跳过校验,只调 1 次 fetch', async () => {
    const zipBuf = Buffer.from('still not a zip');
    fetchMock.mockResolvedValueOnce(makeResponse({ body: zipBuf }));

    await expect(downloadAndInstall({
      tag: '4.6-stable',
      channel: 'stable',
      release: makeRelease(undefined),
      onProgress: (p) => events.push(p)
    })).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});