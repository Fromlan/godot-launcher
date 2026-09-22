import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { sortInstalled } from '../../main/services/godotManager';
import { recommendVersion } from '../../main/services/projectManager';
import type { GodotVersion } from '../../shared/types/godot';

function v(tag: string, channel: 'stable' | 'mono', installedAt: string): GodotVersion {
  return {
    id: `${tag}-${channel}-win64`,
    tag,
    label: tag,
    channel,
    platform: 'win64',
    installPath: `/dev/null/${tag}`,
    sizeBytes: 0,
    installedAt
  };
}

describe('sortInstalled', () => {
  beforeEach(() => {
    process.env.GL_DATA_DIR = path.join(os.tmpdir(), 'gl-gms-' + Math.random().toString(36).slice(2));
  });

  it('按 tag 版本号降序', () => {
    const sorted = sortInstalled([
      v('4.6.2-stable', 'stable', '2025-12-01'),
      v('4.8-dev3', 'stable', '2026-09-01'),
      v('4.7.1-stable', 'stable', '2026-06-01')
    ]);
    expect(sorted.map((x) => x.tag)).toEqual(['4.8-dev3', '4.7.1-stable', '4.6.2-stable']);
  });

  it('同版本号 stable 优先于 mono', () => {
    const sorted = sortInstalled([
      v('4.6.2-stable', 'mono', '2026-01-01'),
      v('4.6.2-stable', 'stable', '2026-01-01')
    ]);
    expect(sorted[0].channel).toBe('stable');
    expect(sorted[1].channel).toBe('mono');
  });

  it('不修改入参', () => {
    const input = [v('4.6-stable', 'stable', '2025-01-01'), v('4.8-dev1', 'stable', '2026-01-01')];
    const snapshot = JSON.stringify(input);
    sortInstalled(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('空数组返回 []', () => {
    expect(sortInstalled([])).toEqual([]);
  });
});

describe('recommendVersion', () => {
  it('正常 4.6.stable.mono 提取 major.minor', () => {
    expect(recommendVersion({ configVersion: '4.6.stable.mono', isMono: true })).toBe('4.6');
    expect(recommendVersion({ configVersion: '4.8-dev', isMono: false })).toBe('4.8');
  });

  it('空 configVersion 返回 undefined', () => {
    expect(recommendVersion({ configVersion: '', isMono: false })).toBeUndefined();
  });

  it('无法匹配版本号前缀返回 undefined', () => {
    expect(recommendVersion({ configVersion: 'garbage', isMono: false })).toBeUndefined();
  });
});
