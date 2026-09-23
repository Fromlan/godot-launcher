/**
 * 纯函数:Godot tag 解析与远端 ReleaseInfo 排序。
 * 没有 IO、没有副作用,可以在 main / renderer / 单测里通用。
 *
 * 排序规则(降序,数值越大越远前):
 *   1) 主版本号 major.minor.patch 数字降序
 *   2) 同主版本号时,类型优先级 stable > rc > beta > dev > alpha
 *   3) 同类型时,suffixNum(数字)越大越远前
 *   4) 同 key:stable 通道优先于 mono
 *   5) 兜底:发布时间晚的优先
 */
import type { ReleaseInfo } from '../types/godot';

const SUFFIX_RANK: Record<string, number> = {
  stable: 0,
  rc: 1,
  beta: 2,
  dev: 3,
  alpha: 4
};

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
export function parseTagKey(tag: string): number[] {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?(?:-(.+))?$/.exec(tag.trim());
  if (!m) return [0, 0, 0, 99, 0];
  const major = parseInt(m[1], 10);
  const minor = parseInt(m[2], 10);
  const patch = m[3] ? parseInt(m[3], 10) : 0;
  const suffix = (m[4] || '').toLowerCase();
  const typeRank = SUFFIX_RANK[suffix] ?? 5;
  let suffixNum = 0;
  const numMatch = /(\d+)/.exec(suffix);
  if (numMatch) suffixNum = parseInt(numMatch[1], 10);
  return [major, minor, patch, typeRank, suffixNum];
}

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