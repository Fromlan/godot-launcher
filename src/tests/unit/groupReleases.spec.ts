import { describe, it, expect } from 'vitest';
import { groupReleases, isStableGroup, type VersionGroup } from '../../renderer/pages/Versions';
import type { ReleaseInfo } from '../../shared/types/godot';

function rel(tag: string, channel: 'stable' | 'mono', prerelease = false): ReleaseInfo {
  return {
    tag,
    label: tag,
    channel,
    platform: 'win64',
    downloadUrl: 'https://example/' + tag + '-' + channel,
    sizeBytes: 100,
    prerelease,
    publishedAt: '2026-01-01'
  };
}

describe('groupReleases', () => {
  it('同 tag 的 stable 与 mono 合并到一项', () => {
    const groups = groupReleases([rel('4.8-dev6', 'stable'), rel('4.8-dev6', 'mono')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].tag).toBe('4.8-dev6');
    expect(groups[0].stable?.downloadUrl).toContain('stable');
    expect(groups[0].mono?.downloadUrl).toContain('mono');
  });

  it('不同 tag 各自独立', () => {
    const groups = groupReleases([
      rel('4.8-dev6', 'stable'),
      rel('4.8-dev5', 'stable'),
      rel('4.8-dev5', 'mono')
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].tag).toBe('4.8-dev6');
    expect(groups[0].stable).toBeDefined();
    expect(groups[0].mono).toBeUndefined();
    expect(groups[1].tag).toBe('4.8-dev5');
    expect(groups[1].stable).toBeDefined();
    expect(groups[1].mono).toBeDefined();
  });

  it('只有 stable 也保留 group(mono 字段 undefined)', () => {
    const groups = groupReleases([rel('4.6.2-stable', 'stable')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].stable).toBeDefined();
    expect(groups[0].mono).toBeUndefined();
  });

  it('只有 mono 也保留 group(stable 字段 undefined)', () => {
    const groups = groupReleases([rel('4.6.2-stable', 'mono')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].stable).toBeUndefined();
    expect(groups[0].mono).toBeDefined();
  });

  it('保留 prerelease 与 publishedAt(取首次出现)', () => {
    const a = rel('4.8-dev6', 'stable', true);
    const b = rel('4.8-dev6', 'mono', true);
    const groups = groupReleases([a, b]);
    expect(groups[0].prerelease).toBe(true);
    expect(groups[0].publishedAt).toBe('2026-01-01');
  });

  it('不修改入参', () => {
    const input = [rel('4.8-dev6', 'stable'), rel('4.8-dev6', 'mono')];
    const before = JSON.stringify(input);
    groupReleases(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('空数组返回空数组', () => {
    expect(groupReleases([])).toEqual([]);
  });
});

describe('isStableGroup', () => {
  it('prerelease=false 视为稳定版', () => {
    const g: VersionGroup = { tag: '4.6.2-stable', label: '4.6.2-stable', prerelease: false, publishedAt: 'x' };
    expect(isStableGroup(g)).toBe(true);
  });

  it('prerelease=true 视为 dev/prerelease', () => {
    const g: VersionGroup = { tag: '4.8-dev6', label: '4.8-dev6', prerelease: true, publishedAt: 'x' };
    expect(isStableGroup(g)).toBe(false);
  });

  it('groupReleases 后 stable release → group.prerelease=false', () => {
    const groups = groupReleases([rel('4.6.2-stable', 'stable')]);
    expect(isStableGroup(groups[0])).toBe(true);
  });

  it('groupReleases 后 dev release → group.prerelease=true', () => {
    const groups = groupReleases([rel('4.8-dev6', 'stable', true), rel('4.8-dev6', 'mono', true)]);
    expect(isStableGroup(groups[0])).toBe(false);
  });

  it('任一通道为 prerelease 即整组视为 dev(OR 关系)', () => {
    // 极端情况:理论上不会发生,验证逻辑健壮性
    const groups = groupReleases([rel('4.8-dev6', 'stable', false), rel('4.8-dev6', 'mono', true)]);
    expect(groups[0].prerelease).toBe(true);
    expect(isStableGroup(groups[0])).toBe(false);
  });
});
