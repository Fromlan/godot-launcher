/**
 * Godot Asset Store 新客户端(`/api/v1`)。
 *
 * 数据源:`https://store.godotengine.org/api/v1`(完整 OpenAPI 见 `/api/v1/openapi.json`)。
 * 此模块不引入鉴权;读类接口全部匿名可用。
 */
import { fetch } from 'undici';
import { ASSET_LIB_PAGE_SIZE, STORE_API_BASE } from '../../shared/constants/godot';
import { createLogger } from '../utils/logger';
import {
  ASSET_TYPE_ADDON,
  ASSET_TYPE_PROJECT,
  deriveMono,
  type AssetLibItem,
  type AssetLibRelease,
  type AssetLibSearchQuery,
  type AssetLibSearchResult,
  type AssetLibSearchSort,
  type AssetTag,
  type AssetTypeId
} from '../../shared/types/plugin';

const log = createLogger('store-asset-client');

const UA = 'godot-launcher/0.1 (+https://github.com/Fromlan/godot-launcher)';
const FALLBACK_THUMB = 'https://store.godotengine.org/static/images/share-image.webp';

/** 错误对象:API 返回非 2xx 时抛出 */
export class StoreApiError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(status: number, url: string, msg: string) {
  super(`${msg} (status=${status} url=${url})`);
    this.name = 'StoreApiError';
    this.status = status;
    this.url = url;
  }
}

/**
 * 把 UI 上的 sort 映射到 Manticore 接受的 sort 字符串。
 * 合法值:relevance / updated_desc / updated_asc / reviews_desc / reviews_asc / created_desc / created_asc
 * 其它会得到 422 (Unprocessable Entity)。
 */
function toManticoreSort(s: AssetLibSearchSort | undefined): string {
  switch (s) {
  case 'updated':
    return 'updated_desc';
  case 'rating':
    return 'reviews_desc';
  case 'relevance':
    return 'relevance';
  case undefined:
  default:
    return 'updated_desc';
  }
}

/** tags:slug,slug → tags=slug1,slug2 的样式 API 期望单 tag 时直接 ?tags=slug */
function mapQueryToParams(q: AssetLibSearchQuery): URLSearchParams {
  const p = new URLSearchParams();
  // 空 keyword 也允许(API 接受 ?query=&... 返回全部)
  p.set('query', q.keyword ?? '');
  if (q.page && q.page > 1) p.set('page', String(q.page));
  const ps = q.pageSize ?? ASSET_LIB_PAGE_SIZE;
  p.set('batch_size', String(ps));
  if (q.tag) p.set('tags', q.tag);
  if (q.godotVersion) p.set('compatibility', q.godotVersion);
  p.set('sort', toManticoreSort(q.sort));
  p.set('require_release', q.requireRelease === false ? 'false' : 'true');
  return p;
}

interface RawTag { slug: string; display_name: string; featured?: boolean }
interface RawPublisher { slug: string; name: string; thumbnail?: string; store_url?: string; verified?: boolean }
interface RawAssetSummary {
  slug: string;
  publisher: RawPublisher;
  name: string;
  type: number;
  description?: string | null;
  price_cent: number;
  license_type?: string;
  license_url?: string;
  thumbnail?: string;
  reviews_score?: number;
  tags?: RawTag[];
  store_url?: string;
  featured_thumbnail?: string;
  source?: string;
  created?: string;
  last_updated?: string;
  featured?: boolean;
}
interface RawHit { asset: RawAssetSummary }
interface RawSearchResponse {
  count: string | number;
  hits?: RawHit[];
  scroll?: string;
}
interface RawRelease {
  id: number;
  version: string;
  stable: boolean;
  size?: number | string | null;
  created: string;
  min_godot_version?: string | null;
  max_godot_version?: string | null;
  notes?: string;
  download_url: string;
}

function toTag(t: RawTag): AssetTag {
  return { slug: String(t.slug), displayName: String(t.display_name), featured: !!t.featured };
}

function toAssetTypeId(t: number): AssetTypeId {
  return t === 1 ? ASSET_TYPE_PROJECT : ASSET_TYPE_ADDON;
}

function normalizeAsset(raw: RawAssetSummary): AssetLibItem {
  const tags: AssetTag[] = Array.isArray(raw.tags) ? raw.tags.map(toTag) : [];
  const license = { type: raw.license_type ?? '', url: raw.license_url ?? '' };
  const item: AssetLibItem = {
    publisherSlug: String(raw.publisher?.slug || ''),
    assetSlug: String(raw.slug || ''),
    name: String(raw.name || ''),
    publisherName: String(raw.publisher?.name || ''),
    description: typeof raw.description === 'string' ? raw.description : '',
    type: toAssetTypeId(raw.type),
    tags,
    license,
    reviewsScore: typeof raw.reviews_score === 'number' ? raw.reviews_score : 0,
    featured: !!raw.featured,
    thumbnailUrl: raw.thumbnail || raw.featured_thumbnail || FALLBACK_THUMB,
    storeUrl: raw.store_url || `https://store.godotengine.org/asset/${raw.publisher?.slug || ''}/${raw.slug || ''}/`,
    sourceUrl: raw.source || undefined,
    supportsMono: false, // 占位,接着覆盖
    lastUpdated: raw.last_updated || raw.created || ''
  };
  item.supportsMono = deriveMono(item);
  return item;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new StoreApiError(res.status, url, `store api ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/**
 * 主入口:搜索/列出资产。
 * Empty query 与未传 query 行为一致:返回按 weight desc 的资源池。
 */
export async function search(q: AssetLibSearchQuery): Promise<AssetLibSearchResult> {
  const params = mapQueryToParams(q);
  const url = `${STORE_API_BASE}/search/query/?${params.toString()}`;
  const data = await getJson<RawSearchResponse>(url);
  const items = (data.hits || []).map((h) => normalizeAsset(h.asset));
  const result: AssetLibSearchResult = {
    items,
    page: q.page ?? 1,
    pageSize: q.pageSize ?? ASSET_LIB_PAGE_SIZE,
    total: String(data.count ?? items.length),
    scrollToken: data.scroll || undefined
  };
  log.debug('search', { q, total: result.total, hits: items.length });
  return result;
}

/** 取单个资产详情(AssetDataDetailed 字段多于列表 hit) */
export async function getAsset(publisherSlug: string, assetSlug: string): Promise<AssetLibItem> {
  const url = `${STORE_API_BASE}/assets/${encodeURIComponent(publisherSlug)}/${encodeURIComponent(assetSlug)}/`;
  const raw = await getJson<RawAssetSummary>(url);
  return normalizeAsset(raw);
}

/** 列出一个资产的 release(实际可下载 zip + Godot 兼容) */
export async function listReleases(
  publisherSlug: string,
  assetSlug: string,
  opts: { stableOnly?: boolean; compatibility?: string } = {}
): Promise<AssetLibRelease[]> {
  const params = new URLSearchParams();
  if (opts.stableOnly) params.set('stable_only', 'true');
  if (opts.compatibility) params.set('compatibility', opts.compatibility);
  const qs = params.toString();
  const url = `${STORE_API_BASE}/releases/${encodeURIComponent(publisherSlug)}/${encodeURIComponent(assetSlug)}/${qs ? '?' + qs : ''}`;
  const raw = await getJson<RawRelease[]>(url);
  return (raw || []).map((r) => ({
    id: Number(r.id),
    version: String(r.version || ''),
    stable: !!r.stable,
    sizeMb: typeof r.size === 'number' ? r.size : Number(r.size) || 0,
    created: String(r.created || ''),
    minGodotVersion: r.min_godot_version || undefined,
    maxGodotVersion: r.max_godot_version || undefined,
    notes: r.notes || undefined,
    downloadUrl: String(r.download_url || '')
  }));
}

