import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

const fetchMock = vi.fn();
vi.mock('undici', () => ({ fetch: (...args: unknown[]) => fetchMock(...args) }));

import { listReleases } from '../../main/services/godotReleaseSource';

let tmp: string;

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), 'gl-grf-' + Math.random().toString(36).slice(2));
  await fs.mkdir(tmp, { recursive: true });
  process.env.GL_DATA_DIR = tmp;
  fetchMock.mockReset();
});

async function seedCache(releases: Array<{ tag: string; channel: string }>): Promise<void> {
  const cacheFile = path.join(tmp, 'releases-cache.json');
  await fs.writeFile(
    cacheFile,
    JSON.stringify({
      schemaVersion: 1,
      cachedAt: Date.now(),
      releases: releases.map((r) => ({
        tag: r.tag,
        label: r.tag,
        channel: r.channel,
        platform: 'win64',
        downloadUrl: 'https://x/' + r.tag + '-' + r.channel + '.zip',
        sizeBytes: 100,
        prerelease: false,
        publishedAt: '2026-09-22'
      }))
    })
  );
}

describe('listReleases (network fallback)', () => {
  it('缓存有效时直接返回缓存(不 fetch)', async () => {
    await seedCache([{ tag: '4.6.2-stable', channel: 'stable' }]);
    const r = await listReleases();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.releases).toHaveLength(1);
    expect(r.stale).toBe(false);
  });

  it('缓存过期且网络可用时刷新', async () => {
    await seedCache([{ tag: '4.6.2-stable', channel: 'stable' }]);
    // 把 cachedAt 改为很久之前
    const cacheFile = path.join(tmp, 'releases-cache.json');
    const json = JSON.parse(await fs.readFile(cacheFile, 'utf-8'));
    json.cachedAt = Date.now() - 7 * 24 * 60 * 60 * 1000;
    await fs.writeFile(cacheFile, JSON.stringify(json));

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => []
    });
    const r = await listReleases();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.releases).toEqual([]);
    expect(r.stale).toBe(false);
  });

  it('forceRefresh=true 跳过缓存', async () => {
    await seedCache([{ tag: '4.6.2-stable', channel: 'stable' }]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => []
    });
    const r = await listReleases({ forceRefresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.releases).toEqual([]);
  });

  it('网络失败且有缓存时返回 stale=true 的缓存', async () => {
    await seedCache([{ tag: '4.6.2-stable', channel: 'stable' }]);
    // 把 cachedAt 改为过期
    const cacheFile = path.join(tmp, 'releases-cache.json');
    const json = JSON.parse(await fs.readFile(cacheFile, 'utf-8'));
    json.cachedAt = Date.now() - 7 * 24 * 60 * 60 * 1000;
    await fs.writeFile(cacheFile, JSON.stringify(json));

    fetchMock.mockRejectedValueOnce(new Error('net fail'));
    const r = await listReleases();
    expect(r.releases).toHaveLength(1);
    expect(r.releases[0].tag).toBe('4.6.2-stable');
    expect(r.stale).toBe(true);
  });

  it('网络失败且无缓存时抛错', async () => {
    fetchMock.mockRejectedValueOnce(new Error('net fail'));
    await expect(listReleases()).rejects.toThrow(/net fail/);
  });

  it('GitHub API 错误(非 200)且无缓存时抛错', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    await expect(listReleases({ forceRefresh: true })).rejects.toThrow(/503/);
  });

  it('损坏的缓存被备份并继续走网络', async () => {
    const cacheFile = path.join(tmp, 'releases-cache.json');
    await fs.writeFile(cacheFile, '{nope');
    // 缓存损坏 -> 读返回 null -> 走网络 forceRefresh=true
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => []
    });
    const r = await listReleases({ forceRefresh: true });
    expect(r.releases).toEqual([]);
  });

  it('不传 forceRefresh + 损坏缓存 + 网络成功:也能完成', async () => {
    const cacheFile = path.join(tmp, 'releases-cache.json');
    await fs.writeFile(cacheFile, '{nope');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => []
    });
    const r = await listReleases();
    expect(r.releases).toEqual([]);
    // 损坏文件会被 rename 备份
    const after = await fs.readdir(tmp);
    expect(after.some((n) => n.startsWith('releases-cache.json.bak.'))).toBe(true);
  });

  it('缓存命中后把 releases 排序后返回', async () => {
    await seedCache([
      { tag: '4.6.2-stable', channel: 'stable' },
      { tag: '4.8-dev3', channel: 'stable' }
    ]);
    const r = await listReleases();
    expect(r.releases.map((x) => x.tag)).toEqual(['4.8-dev3', '4.6.2-stable']);
  });
});
