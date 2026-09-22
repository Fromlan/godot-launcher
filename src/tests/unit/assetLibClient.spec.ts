import { describe, it, expect, vi, beforeEach } from 'vitest';

// 模拟 undici
const fetchMock = vi.fn();
vi.mock('undici', () => ({ fetch: (...args: unknown[]) => fetchMock(...args) }));

import { search } from '../../main/services/assetLibClient';

describe('assetLibClient.search', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('正常解析响应', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        result: [
          {
            id: 1,
            title: 'Test Addon',
            author: 'someone',
            author_id: 1,
            category: 'Tools',
            category_id: 1,
            description: 'demo',
            version: '1',
            version_string: '1.2.3',
            godot_version: '4.4',
            modify_date: '2025-01-01',
            download_url: 'https://example.com/test.zip',
            versions: [{ download_url: 'https://example.com/test.zip', version_string: '1.2.3', godot_version: '4.4' }]
          }
        ],
        page: 1,
        pages: 1,
        page_size: 12,
        count: 1
      })
    });
    const r = await search({ keyword: 'test', page: 1, pageSize: 12 });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].title).toBe('Test Addon');
    expect(r.items[0].downloadUrl).toBe('https://example.com/test.zip');
    expect(r.items[0].godotVersions).toContain('4.4');
    expect(r.total).toBe(1);
  });

  it('API 返回 error 时抛错', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ error: 'something bad' })
    });
    await expect(search({})).rejects.toThrow(/assetlib error/);
  });

  it('非 200 抛错', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(search({})).rejects.toThrow(/500/);
  });
});
