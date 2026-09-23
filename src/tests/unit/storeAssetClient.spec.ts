import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.mock('undici', () => ({ fetch: (...args: unknown[]) => fetchMock(...args) }));

import { search, getAsset, listReleases, StoreApiError } from '../../main/services/storeAssetClient';

function jsonResponse(obj: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => obj,
    text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj))
  };
}

describe('storeAssetClient.search', () => {
  beforeEach(() => fetchMock.mockReset());

  it('把空 keyword/page/tag 正确映射到 query string', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: '0', hits: [], scroll: 'cursor-xyz' }));
    await search({ page: 2, pageSize: 30, sort: 'rating' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/search/query/');
    expect(url).toContain('query='); // 空 keyword 也发出 ?query=
    expect(url).toContain('page=2');
    expect(url).toContain('batch_size=30');
    expect(url).toContain('sort=reviews_desc');
    expect(url).toContain('require_release=true');
  });

  it('tag/godotVersion 透传到 ?tags= 和 ?compatibility=', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: '0', hits: [] }));
    await search({ tag: '3d', godotVersion: '4.4' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('tags=3d');
    expect(url).toContain('compatibility=4.4');
  });

  it('requireRelease=false 时正确传出 false', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: '0', hits: [] }));
    await search({ requireRelease: false });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('require_release=false');
  });

  it('命中 hit 数组并归一化为 AssetLibItem 形状', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        count: '1',
        hits: [
          {
            asset: {
              slug: 'gdscript-templates',
              publisher: { slug: 'rumys', name: 'Rumys', verified: true },
              name: 'GDScript Templates',
              type: 0,
              description: 'Code snippets',
              price_cent: 0,
              license_type: 'MIT',
              license_url: 'https://choosealicense.com/licenses/mit/',
              thumbnail: 'https://asset-store-prod.fra1.digitaloceanspaces.com/assets/2931/x.webp',
              reviews_score: 5,
              tags: [{ slug: 'csharp', display_name: 'C#', featured: false }],
              store_url: 'https://store.godotengine.org/asset/rumys/gdscript-templates/',
              source: 'https://github.com/rumys/gdscript-templates',
              last_updated: '2026-01-06',
              featured: true
            }
          }
        ],
        scroll: 'cursor'
      })
    );
    const r = await search({});
    expect(r.items).toHaveLength(1);
    const it0 = r.items[0];
    expect(it0.publisherSlug).toBe('rumys');
    expect(it0.assetSlug).toBe('gdscript-templates');
    expect(it0.name).toBe('GDScript Templates');
    expect(it0.publisherName).toBe('Rumys');
    expect(it0.license.type).toBe('MIT');
    expect(it0.reviewsScore).toBe(5);
    expect(it0.sourceUrl).toBe('https://github.com/rumys/gdscript-templates');
    expect(it0.supportsMono).toBe(true); // tags 含 csharp
    expect(it0.featured).toBe(true);
    expect(r.total).toBe('1');
    expect(r.scrollToken).toBe('cursor');
  });

  it('非 2xx 抛 StoreApiError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(search({})).rejects.toThrow(StoreApiError);
  });
});

describe('storeAssetClient.getAsset', () => {
  beforeEach(() => fetchMock.mockReset());

  it('走 /assets/{pub}/{slug}/ 路径并 encode slug', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        slug: 'cool plugin',
        publisher: { slug: 'acme', name: 'Acme' },
        name: 'Cool Plugin',
        type: 0,
        description: 'desc',
        license_type: 'MIT',
        license_url: '',
        tags: [],
        store_url: '',
        last_updated: '2026-01-01'
      })
    );
    await getAsset('ac me', 'cool plugin');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/assets/ac%20me/cool%20plugin/');
  });

  it('返回 null description 时归一化为空串,后续 .slice 不抛错', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        slug: 'foo',
        publisher: { slug: 'p', name: 'p' },
        name: 'Foo',
        type: 0,
        description: null,
        tags: [],
        license_type: '',
        last_updated: ''
      })
    );
    const it0 = await getAsset('p', 'foo');
    expect(it0.description).toBe('');
    expect(() => it0.description.slice(0, 5)).not.toThrow();
  });
});

describe('storeAssetClient.listReleases', () => {
  beforeEach(() => fetchMock.mockReset());

  it('空 opts 不带查询串', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await listReleases('p', 's');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/\/api\/v1\/releases\/p\/s\/$/);
  });

  it('stableOnly=true + compatibility 时拼上 query', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await listReleases('p', 's', { stableOnly: true, compatibility: '4.4' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('stable_only=true');
    expect(url).toContain('compatibility=4.4');
  });

  it('返回 release 数组已类型化为 AssetLibRelease', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: 100,
          version: 'v1.2',
          stable: true,
          size: 12.5,
          created: '2026-09-01',
          min_godot_version: '4.4',
          max_godot_version: null,
          notes: 'lts',
          download_url: 'https://signed.example.com/x.zip'
        }
      ])
    );
    const rs = await listReleases('p', 's');
    expect(rs[0].id).toBe(100);
    expect(rs[0].sizeMb).toBe(12.5);
    expect(rs[0].minGodotVersion).toBe('4.4');
    expect(rs[0].maxGodotVersion).toBeUndefined();
  });
});

describe('storeAssetClient.search sort mapping', () => {
  beforeEach(() => fetchMock.mockReset());

  it('updated -> updated_desc', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: '0', hits: [] }));
    await search({ sort: 'updated' });
    expect(fetchMock.mock.calls[0][0]).toContain('sort=updated_desc');
  });

  it('rating -> reviews_desc', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: '0', hits: [] }));
    await search({ sort: 'rating' });
    expect(fetchMock.mock.calls[0][0]).toContain('sort=reviews_desc');
  });

  it('relevance -> relevance', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: '0', hits: [] }));
    await search({ sort: 'relevance' });
    expect(fetchMock.mock.calls[0][0]).toContain('sort=relevance');
  });

  it('未传 sort 默认走 updated_desc', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: '0', hits: [] }));
    await search({});
    expect(fetchMock.mock.calls[0][0]).toContain('sort=updated_desc');
  });
});
