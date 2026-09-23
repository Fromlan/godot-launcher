import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.mock('undici', () => ({ fetch: (...args: unknown[]) => fetchMock(...args) }));

import { search } from '../../main/services/assetLibClient';

describe('assetLibClient.search description 兜底', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('AssetLib 列表结果不带 description 字段(真实 API 行为)→ 转换后 description 为空串', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        result: [
          {
            id: 16,
            title: 'MessDeform',
            author: 'RandomShaper',
            author_id: 36,
            category: '2D Tools',
            category_id: 1,
            godot_version: '2.1',
            rating: '0',
            cost: 'MIT',
            support_level: 'community',
            icon_url: 'https://example.com/icon.png',
            version: '4',
            version_string: '1.3',
            modify_date: '2017-09-13 18:15:44'
            // 关键:没有 description 字段,这是 AssetLib 列表 API 的真实行为
          }
        ],
        page: 1,
        pages: 1,
        page_size: 24,
        count: 1
      })
    });
    const r = await search({ pageSize: 12 });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].description).toBe('');
    // 不能是 undefined - 否则 Plugins.tsx 的 it.description.slice 会抛错导致组件树卸载白屏
    expect(r.items[0].description).not.toBeUndefined();
    // 渲染调用验证:不会抛错
    expect(() => r.items[0].description.slice(0, 120)).not.toThrow();
  });

  it('description 显式为 undefined 也兜底为空串', async () => {
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
            description: undefined,
            version: '1',
            version_string: '1.0',
            godot_version: '4.4',
            modify_date: '2026-01-01'
          }
        ],
        page: 1,
        page_size: 24,
        count: 1
      })
    });
    const r = await search({});
    expect(r.items[0].description).toBe('');
  });

  it('description 为 null 兜底为空串', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        result: [
          {
            id: 2,
            title: 'Y',
            author: 'a',
            author_id: 1,
            category: 'Tools',
            category_id: 1,
            description: null,
            version: '1',
            version_string: '1.0',
            godot_version: '4.4',
            modify_date: '2026-01-01'
          }
        ],
        page: 1,
        page_size: 24,
        count: 1
      })
    });
    const r = await search({});
    expect(r.items[0].description).toBe('');
  });

  it('description 为正常字符串时原样保留', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        result: [
          {
            id: 3,
            title: 'Z',
            author: 'a',
            author_id: 1,
            category: 'Tools',
            category_id: 1,
            description: 'hello world',
            version: '1',
            version_string: '1.0',
            godot_version: '4.4',
            modify_date: '2026-01-01'
          }
        ],
        page: 1,
        page_size: 24,
        count: 1
      })
    });
    const r = await search({});
    expect(r.items[0].description).toBe('hello world');
  });
});
