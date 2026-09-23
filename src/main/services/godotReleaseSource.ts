import { readJsonSafe, writeJsonAtomic, injectSchemaVersion } from '../utils/migrate';
import { SCHEMA_VERSION } from '../../shared/constants/schema';
import { fetch } from 'undici';
import { GODOT_RELEASES_REPO, RELEASES_CACHE_TTL_MS } from '../../shared/constants/godot';
import type { ReleaseInfo } from '../../shared/types/godot';
import type { GodotChannel } from '../../shared/constants/godot';
import { createLogger } from '../utils/logger';
import { getReleasesCachePath } from '../utils/path';
import { sortReleases } from '../../shared/utils/sortReleases';

// 重导出纯函数,保持向后兼容(单测/外部引用)
export { sortReleases, compareReleases, parseTagKey } from '../../shared/utils/sortReleases';

const log = createLogger('godot-release-source');

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  prerelease: boolean;
  published_at: string;
  assets: GitHubAsset[];
}

interface CachePayload {
  cachedAt: number;
  releases: ReleaseInfo[];
  schemaVersion?: number;
}

/** 将 GitHub Release 转换为内部 ReleaseInfo,仅匹配 win64 + mono 变体 */
function toReleaseInfo(r: GitHubRelease): ReleaseInfo[] {
  const out: ReleaseInfo[] = [];
  for (const asset of r.assets) {
    const lower = asset.name.toLowerCase();
    const isWin64 = lower.includes('win64') && lower.endsWith('.zip');
    if (!isWin64) continue;
    const channel: GodotChannel = lower.includes('mono') ? 'mono' : 'stable';
    /**
     * 若 GitHub Release 同时包含 .zip 与 .zip,提取 .sha256 URL 用于下载完整性校验。
     * Godot 官方 Release 的资产命名: Godot_v4.x-stable_win64.zip 与 Godot_v4.x-stable_win64.zip.sha256
     */
    const sha256Asset = r.assets.find((a) => a.name === asset.name + '.sha256');
    out.push({
      tag: r.tag_name,
      label: r.name || r.tag_name,
      channel,
      platform: 'win64',
      downloadUrl: asset.browser_download_url,
      sizeBytes: asset.size,
      prerelease: r.prerelease,
      publishedAt: r.published_at,
      sha256Url: sha256Asset?.browser_download_url
    });
  }
  return out;
}

async function fetchFromNetwork(): Promise<ReleaseInfo[]> {
  const url = `https://api.github.com/repos/${GODOT_RELEASES_REPO.owner}/${GODOT_RELEASES_REPO.repo}/releases?per_page=50`;
  log.info('fetching releases from', url);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'godot-launcher', Accept: 'application/vnd.github+json' }
  });
  if (!res.ok) throw new Error(`github api ${res.status}`);
  const data = (await res.json()) as GitHubRelease[];
  return sortReleases(data.flatMap(toReleaseInfo));
}

async function loadCache(): Promise<CachePayload | null> {
  const stored = await readJsonSafe<CachePayload>(getReleasesCachePath());
  if (!stored) return null;
  return injectSchemaVersion(stored, SCHEMA_VERSION) as CachePayload;
}

async function saveCache(releases: ReleaseInfo[]): Promise<void> {
  const payload: CachePayload = { schemaVersion: SCHEMA_VERSION, cachedAt: Date.now(), releases };
  await writeJsonAtomic(getReleasesCachePath(), payload);
}

/** 列出 Godot 可用版本(win64 + mono),带本地缓存 */
export async function listReleases(opts: { forceRefresh?: boolean } = {}): Promise<{
  releases: ReleaseInfo[];
  cachedAt: string | null;
  stale: boolean;
}> {
  const cache = !opts.forceRefresh ? await loadCache() : null;
  if (cache && Date.now() - cache.cachedAt < RELEASES_CACHE_TTL_MS) {
    return {
      releases: sortReleases(cache.releases),
      cachedAt: new Date(cache.cachedAt).toISOString(),
      stale: false
    };
  }
  try {
    const releases = await fetchFromNetwork();
    await saveCache(releases);
    return { releases, cachedAt: new Date().toISOString(), stale: false };
  } catch (err) {
    log.warn('fetch failed, fallback to stale cache', err);
    if (cache) {
      return {
        releases: sortReleases(cache.releases),
        cachedAt: new Date(cache.cachedAt).toISOString(),
        stale: true
      };
    }
    throw err;
  }
}