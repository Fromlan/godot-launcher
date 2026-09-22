import { fetch } from 'undici';
import {
  ASSET_LIB_BASE,
  ASSET_LIB_PAGE_SIZE,
  ASSET_LIB_MAX_PAGES
} from '../../shared/constants/godot';
import type { AssetLibItem, AssetLibSearchQuery, AssetLibSearchResult } from '../../shared/types/plugin';
import { createLogger } from '../utils/logger';

const log = createLogger('asset-lib');

interface AssetLibRawItem {
  id: number;
  title: string;
  author: string;
  author_id: number;
  category: string;
  category_id: number;
  description: string;
  download_url?: string;
  version: string;
  version_string: string;
  godot_version: string;
  modify_date: string;
  /** AssetLib 内单个版本的下载 zip;为列表中的最新版本 */
  versions?: Array<{
    id?: string;
    download_url?: string;
    version_string: string;
    godot_version: string;
  }>;
}

interface AssetLibRawResponse {
  result?: AssetLibRawItem[];
  page?: number;
  pages?: number;
  page_size?: number;
  count?: number;
  error?: string;
}

function toAssetLibItem(raw: AssetLibRawItem): AssetLibItem {
  // 取最新版本的下载 URL
  const versions = raw.versions || [];
  const latest = versions[versions.length - 1];
  const downloadUrl = raw.download_url || latest?.download_url;
  const godotVersions = Array.from(
    new Set(versions.map((v) => v.godot_version).filter(Boolean))
  );
  return {
    id: String(raw.id),
    title: raw.title,
    author: raw.author,
    description: raw.description,
    godotVersions: godotVersions.length ? godotVersions : raw.godot_version ? [raw.godot_version] : [],
    supportsMono: godotVersions.some((v) => /mono|c#/i.test(v)) || false,
    category: raw.category,
    downloadUrl,
    version: raw.version_string || raw.version || '0.0.0',
    modifyDate: raw.modify_date
  };
}

/** 列出全部类别(用于筛选) */
export async function listCategories(): Promise<Array<{ id: number; name: string }>> {
  try {
    const res = await fetch(`${ASSET_LIB_BASE}/category`, { headers: { 'User-Agent': 'godot-launcher' } });
    if (!res.ok) throw new Error(`category fetch ${res.status}`);
    const data = (await res.json()) as Array<{ id: number; name: string }>;
    return data;
  } catch (err) {
    log.warn('list categories failed', err);
    return [];
  }
}

/** 搜索 AssetLib 资源 */
export async function search(q: AssetLibSearchQuery): Promise<AssetLibSearchResult> {
  const page = Math.max(1, q.page || 1);
  const pageSize = Math.min(ASSET_LIB_MAX_PAGES * ASSET_LIB_PAGE_SIZE, q.pageSize || ASSET_LIB_PAGE_SIZE);
  const params = new URLSearchParams({
    type: 'addon',
    page: String(page),
    page_size: String(pageSize)
  });
  if (q.keyword) params.set('q', q.keyword);
  if (q.category) params.set('category', q.category);
  if (q.godotVersion) params.set('godot_version', q.godotVersion);
  // sort:默认按修改时间倒序
  params.set('sort', 'update');
  const res = await fetch(`${ASSET_LIB_BASE}/asset?${params.toString()}`, { headers: { 'User-Agent': 'godot-launcher' } });
  if (!res.ok) throw new Error(`assetlib search ${res.status}`);
  const data = (await res.json()) as AssetLibRawResponse;
  if (data.error) throw new Error(`assetlib error: ${data.error}`);
  const items = (data.result || []).map(toAssetLibItem);
  return {
    items,
    page: data.page ?? page,
    total: data.count ?? items.length,
    pageSize: data.page_size ?? pageSize
  };
}

/** 获取单个资源的详细信息(含下载链接) */
export async function getAsset(id: string): Promise<AssetLibItem> {
  const res = await fetch(`${ASSET_LIB_BASE}/asset/${id}`, { headers: { 'User-Agent': 'godot-launcher' } });
  if (!res.ok) throw new Error(`asset detail ${res.status}`);
  const raw = (await res.json()) as AssetLibRawItem;
  return toAssetLibItem(raw);
}
