import { promises as fs } from 'node:fs';
import { fetch } from 'undici';
import { GODOT_RELEASES_REPO, RELEASES_CACHE_TTL_MS } from '../../shared/constants/godot';
import type { ReleaseInfo } from '../../shared/types/godot';
import type { GodotChannel } from '../../shared/constants/godot';
import { createLogger } from '../utils/logger';
import { getReleasesCachePath, ensureDir, getUserDataDir } from '../utils/path';

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
}

/** 将 GitHub Release 转换为内部 ReleaseInfo,仅匹配 win64 + mono 变体 */
function toReleaseInfo(r: GitHubRelease): ReleaseInfo[] {
  const out: ReleaseInfo[] = [];
  for (const asset of r.assets) {
    const lower = asset.name.toLowerCase();
    const isWin64 = lower.includes('win64') && lower.endsWith('.zip');
    if (!isWin64) continue;
    const channel: GodotChannel = lower.includes('mono') ? 'mono' : 'stable';
    out.push({
      tag: r.tag_name,
      label: r.name || r.tag_name,
      channel,
      platform: 'win64',
      downloadUrl: asset.browser_download_url,
      sizeBytes: asset.size,
      prerelease: r.prerelease,
      publishedAt: r.published_at
    });
  }
  return out;
}

/**
 * 解析 tag 字符串为可比较的排序键。
 * 支持的形态:
 *   4.6-stable       -> [4, 6, 0, 0, 0]
 *   4.6.2-stable     -> [4, 6, 2, 0, 0]
 *   4.8-dev6         -> [4, 8, 0, 3, 6]
 *   4.8-rc1          -> [4, 8, 0, 1, 1]
 *   4.8-beta2        -> [4, 8, 0, 2, 2]
 *   4.8-alpha1       -> [4, 8, 0, 4, 1]
 * typeRank: stable=0 / rc=1 / beta=2 / dev=3 / alpha=4 / 其他=5
 */
const SUFFIX_RANK: Record<string, number> = {
  stable: 0,
  rc: 1,
  beta: 2,
  dev: 3,
  alpha: 4
};

function parseTagKey(tag: string): number[] {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?(?:-(.+))?$/.exec(tag.trim());
  if (!m) return [0, 0, 0, 99, 0];
  const major = parseInt(m[1], 10);
  const minor = parseInt(m[2], 10);
  const patch = m[3] ? parseInt(m[3], 10) : 0;
  const suffix = (m[4] || '').toLowerCase();
  let typeRank = SUFFIX_RANK[suffix] ?? 5;
  let suffixNum = 0;
  const numMatch = /(\d+)/.exec(suffix);
  if (numMatch) suffixNum = parseInt(numMatch[1], 10);
  return [major, minor, patch, typeRank, suffixNum];
}

/**
 * 排序规则(降序,数值越大越靠前):
 *   1) 主版本号 major.minor.patch 数字降序
 *   2) 同主版本号时,类型优先级 stable > rc > beta > dev > alpha
 *   3) 同类型时,suffixNum(数字)越大越靠前
 *   4) 同 key:stable 通道优先于 mono
 *   5) 兜底:发布时间晚的优先
 */
export function compareReleases(a: ReleaseInfo, b: ReleaseInfo): number {
  const ka = parseTagKey(a.tag);
  const kb = parseTagKey(b.tag);
  if (ka[0] !== kb[0]) return kb[0] - ka[0];   // major desc
  if (ka[1] !== kb[1]) return kb[1] - ka[1];   // minor desc
  if (ka[2] !== kb[2]) return kb[2] - ka[2];   // patch desc
  if (ka[3] !== kb[3]) return ka[3] - kb[3];   // type asc(stable 优先)
  if (ka[4] !== kb[4]) return kb[4] - ka[4];   // suffixNum desc
  if (a.channel !== b.channel) return a.channel === 'stable' ? -1 : 1;
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
}
export function sortReleases(list: ReleaseInfo[]): ReleaseInfo[] {
  return [...list].sort(compareReleases);
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
  try {
    const buf = await fs.readFile(getReleasesCachePath(), 'utf-8');
    return JSON.parse(buf) as CachePayload;
  } catch {
    return null;
  }
}

async function saveCache(releases: ReleaseInfo[]): Promise<void> {
  await ensureDir(getUserDataDir());
  const payload: CachePayload = { cachedAt: Date.now(), releases };
  await fs.writeFile(getReleasesCachePath(), JSON.stringify(payload), 'utf-8');
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
