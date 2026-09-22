import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { compareReleases, sortReleases } from '../../main/services/godotReleaseSource';
import type { ReleaseInfo } from '../../shared/types/godot';

function rel(tag: string, channel: 'stable' | 'mono' = 'stable', publishedAt = '2025-01-01T00:00:00Z'): ReleaseInfo {
  return {
    tag,
    label: tag,
    channel,
    platform: 'win64',
    downloadUrl: 'https://example/' + tag,
    sizeBytes: 0,
    prerelease: false,
    publishedAt
  };
}

describe('compareReleases / sortReleases', () => {
  beforeEach(() => {
    process.env.GL_DATA_DIR = path.join(os.tmpdir(), 'gl-sort-' + Math.random().toString(36).slice(2));
  });

  it('主版本号降序:4.8 > 4.6', () => {
    const sorted = sortReleases([rel('4.6.2-stable'), rel('4.8-dev1')]);
    expect(sorted.map((r) => r.tag)).toEqual(['4.8-dev1', '4.6.2-stable']);
  });

  it('patch 数字降序:4.6.2 > 4.6.1', () => {
    const sorted = sortReleases([rel('4.6.1-stable'), rel('4.6.2-stable')]);
    expect(sorted.map((r) => r.tag)).toEqual(['4.6.2-stable', '4.6.1-stable']);
  });

  it('同版本号,stable 优先于 dev:4.6.2-stable > 4.6.2-dev3', () => {
    const sorted = sortReleases([rel('4.6.2-dev3'), rel('4.6.2-stable')]);
    expect(sorted.map((r) => r.tag)).toEqual(['4.6.2-stable', '4.6.2-dev3']);
  });

  it('同版本号同类型,dev 数字越大越靠前:dev6 > dev5', () => {
    const sorted = sortReleases([rel('4.8-dev5'), rel('4.8-dev6')]);
    expect(sorted.map((r) => r.tag)).toEqual(['4.8-dev6', '4.8-dev5']);
  });

  it('同 key,stable 通道优先于 mono', () => {
    const sorted = sortReleases([rel('4.6.2-stable', 'mono'), rel('4.6.2-stable', 'stable')]);
    expect(sorted.map((r) => r.channel)).toEqual(['stable', 'mono']);
  });

  it('完整排序场景(用户截图风格)', () => {
    const list = [
      rel('4.8-dev5', 'stable', '2026-09-11'),
      rel('4.8-dev6', 'mono', '2026-09-16'),
      rel('4.8-dev6', 'stable', '2026-09-16'),
      rel('4.8-dev4', 'stable', '2026-09-09'),
      rel('4.8-dev4', 'mono', '2026-09-09'),
      rel('3.6.2-stable', 'stable', '2025-10-23'),
      rel('3.6.2-stable', 'mono', '2025-10-23')
    ];
    const sorted = sortReleases(list);
    // 期望顺序:
    //   4.8-dev6 stable   (最新 + stable)
    //   4.8-dev6 mono     (同 key,channel)
    //   4.8-dev5 stable   (次新)
    //   4.8-dev4 stable   (再次)
    //   4.8-dev4 mono     (同 key)
    //   3.6.2-stable      (旧主版本)
    //   3.6.2-stable mono
    expect(sorted.map((r) => `${r.tag}/${r.channel}`)).toEqual([
      '4.8-dev6/stable',
      '4.8-dev6/mono',
      '4.8-dev5/stable',
      '4.8-dev4/stable',
      '4.8-dev4/mono',
      '3.6.2-stable/stable',
      '3.6.2-stable/mono'
    ]);
  });

  it('compareReleases 是稳定的方向(数值越大越靠前)', () => {
    expect(compareReleases(rel('4.6.2-stable'), rel('4.6.1-stable'))).toBeLessThan(0);
    expect(compareReleases(rel('4.6.1-stable'), rel('4.6.2-stable'))).toBeGreaterThan(0);
    expect(compareReleases(rel('4.6.2-stable'), rel('4.6.2-stable'))).toBe(0);
  });

  it('非法 tag 不抛错', () => {
    const list = [rel('garbage'), rel('4.6.2-stable')];
    expect(() => sortReleases(list)).not.toThrow();
    // 非法 tag 视作 [0,0,0,99,0],落到最末
    expect(sortReleases(list).map((r) => r.tag)).toEqual(['4.6.2-stable', 'garbage']);
  });
});
