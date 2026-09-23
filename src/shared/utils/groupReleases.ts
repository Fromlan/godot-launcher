/**
 * 共享版本排序与分组工具。
 *
 * 用途:
 *   - renderer 端 Versions 页 / Settings 页共用 groupReleases / isStableGroup
 *   - main 端 godotManager.listInstalled / 渲染端排序逻辑统一
 *   - 单测可以直接覆盖纯函数,不需要跑 JSX 或 Electron
 */
import type { ReleaseInfo, GodotVersion } from '../types/godot';
import { sortReleases as sortReleasesImpl } from './sortReleases';

/** 把 ReleaseInfo 列表按 tag 聚合,每组包含 stable / mono 两个通道 */
export interface VersionGroup {
  tag: string;
  label: string;
  /** 任一通道为 prerelease(dev/rc/beta/alpha)即视为 true */
  prerelease: boolean;
  publishedAt: string;
  stable?: ReleaseInfo;
  mono?: ReleaseInfo;
}

/** 按 tag 把 stable / mono 聚合到同一卡片 */
export function groupReleases(list: ReleaseInfo[]): VersionGroup[] {
  const map = new Map<string, VersionGroup>();
  for (const r of list) {
    let g = map.get(r.tag);
    if (!g) {
      g = { tag: r.tag, label: r.label, prerelease: false, publishedAt: r.publishedAt };
      map.set(r.tag, g);
    }
    // 任一通道为 prerelease,整组视为 dev/prerelease
    g.prerelease = g.prerelease || r.prerelease;
    if (r.channel === 'stable') g.stable = r;
    else if (r.channel === 'mono') g.mono = r;
  }
  return Array.from(map.values());
}

/** 判断 group 是否属于稳定版类型(prerelease=false 即视为 stable) */
export function isStableGroup(g: VersionGroup): boolean {
  return !g.prerelease;
}

/**
 * 对已安装版本按版本号降序排序(stable 优先于 mono)。
 * 通过复用 godotReleaseSource.sortReleases 的语义,保证"已安装排序"与"远端排序"一致。
 */
export function sortInstalled(list: GodotVersion[]): GodotVersion[] {
  const asReleases: ReleaseInfo[] = list.map((v) => ({
    tag: v.tag,
    label: v.label,
    channel: v.channel,
    platform: v.platform,
    downloadUrl: '',
    sizeBytes: v.sizeBytes,
    prerelease: false,
    publishedAt: v.installedAt
  }));
  const sorted = sortReleasesImpl(asReleases);
  const map = new Map(list.map((v) => [v.tag + '|' + v.channel + '|' + v.platform, v]));
  return sorted
    .map((r) => map.get(r.tag + '|' + r.channel + '|' + r.platform))
    .filter((v): v is GodotVersion => !!v);
}