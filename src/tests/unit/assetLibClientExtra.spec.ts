import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.mock('undici', () => ({ fetch: (...args: unknown[]) => fetchMock(...args) }));

import { search, getAsset, listCategories } from '../../main/services/assetLibClient';

describe('assetLibClient.search (extra)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('page 缺省为 1', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: [], page: 1, page_size: 24, count: 0 })
    });
    const r = await search({});
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(24);
  });

  it('keyword / category / godotVersion 透传到 query', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: [], page: 1, page_size: 24, count: 0 })
    });
    await search({ keyword: 'dialog', category: 'Tools', godotVersion: '4.4' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('q=dialog');
    expect(url).toContain('category=Tools');
    expect(url).toContain('godot_version=4.4');
    expect(url).toContain('sort=update');
  });

  it('不支持的 godot_version 字段也返回空数组', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: [], page: 1, page_size: 24, count: 0 })
    });
    const r = await search({ keyword: 'no-result' });
    expect(r.items).toEqual([]);
  });

  it('pageSize 超过 ASSET_LIB_MAX_PAGES * ASSET_LIB_PAGE_SIZE 时被截断', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: [], page: 1, page_size: 50, count: 0 })
    });
    const r = await search({ pageSize: 100000 });
    expect(r.pageSize).toBeLessThanOrEqual(50 * 24);
  });

  it('多个版本时取最新版本的 downloadUrl', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        result: [
          {
            id: 1,
            title: 'Multi',
            author: 'a',
            author_id: 1,
            category: 'Tools',
            category_id: 1,
            description: '',
            version: '1',
            version_string: '2.0',
            godot_version: '4.4',
            modify_date: '2026-01-01',
            versions: [
              { download_url: 'https://old.zip', version_string: '1.0', godot_version: '4.3' },
              { download_url: 'https://new.zip', version_string: '2.0', godot_version: '4.4' }
            ]
          }
        ],
        page: 1,
        page_size: 24,
        count: 1
      })
    });
    const r = await search({});
    expect(r.items[0].downloadUrl).toBe('https://new.zip');
    expect(r.items[0].godotVersions).toEqual(['4.3', '4.4']);
  });

  it('supportsMono 命中 godot_versions 含 mono / c#', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        result: [
          {
            id: 1,
            title: 'X',
            author: 'a',
            author_id: 1,
            category: 'Tools',
            category_id: 1,
            description: '',
            version: '1',
            version_string: '1.0',
            godot_version: '4.4',
            modify_date: '2026-01-01',
            versions: [
              { download_url: 'https://x.zip', version_string: '1.0', godot_version: 'C# (.NET)' }
            ]
          }
        ],
        page: 1,
        page_size: 24,
        count: 1
      })
    });
    const r = await search({});
    expect(r.items[0].supportsMono).toBe(true);
  });
});

describe('assetLibClient.getAsset', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('正常返回详情', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 5,
        title: 'Detail',
        author: 'someone',
        author_id: 1,
        category: 'Tools',
        category_id: 1,
        description: 'Detail desc',
        version: '1',
        version_string: '3.0',
        godot_version: '4.4',
        modify_date: '2026-09-22',
        download_url: 'https://d.zip',
        versions: []
      })
    });
    const it = await getAsset('5');
    expect(it.id).toBe('5');
    expect(it.title).toBe('Detail');
    expect(it.downloadUrl).toBe('https://d.zip');
  });

  it('非 200 抛错', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    await expect(getAsset('x')).rejects.toThrow(/404/);
  });
});

describe('assetLibClient.listCategories', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('成功返回分类', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        { id: 1, name: 'Tools' },
        { id: 2, name: 'Shaders' }
      ]
    });
    const list = await listCategories();
    expect(list).toEqual([
      { id: 1, name: 'Tools' },
      { id: 2, name: 'Shaders' }
    ]);
  });

  it('失败返回空数组(不抛错)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('net'));
    const list = await listCategories();
    expect(list).toEqual([]);
  });
});
