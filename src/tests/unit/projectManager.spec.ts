import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

describe('projectManager.parseProjectGodot', () => {
  let tmp: string;
  let parseProjectGodot: (p: string) => Promise<{ configVersion: string; isMono: boolean; name?: string; mainScene?: string }>;

  beforeEach(async () => {
    tmp = path.join(os.tmpdir(), 'gl-pm-' + Math.random().toString(36).slice(2));
    await fs.mkdir(tmp, { recursive: true });
    process.env.GL_DATA_DIR = tmp;
    const mod = await import('../../main/services/projectManager');
    parseProjectGodot = mod.parseProjectGodot;
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('解析 basic 项目', async () => {
    const project = path.join(tmp, 'demo');
    await fs.mkdir(project, { recursive: true });
    await fs.writeFile(
      path.join(project, 'project.godot'),
      `
; Engine configuration file.
config_version=5

[application]
config/name="My Demo"
run/main_scene="res://main.tscn"

[config]
version="4.6"
features=["4.4"]
`
    );
    const meta = await parseProjectGodot(project);
    expect(meta.configVersion).toBe('4.6');
    expect(meta.isMono).toBe(false);
    expect(meta.name).toBe('My Demo');
    expect(meta.mainScene).toBe('res://main.tscn');
  });

  it('识别 mono 特性', async () => {
    const project = path.join(tmp, 'mono');
    await fs.mkdir(project, { recursive: true });
    await fs.writeFile(
      path.join(project, 'project.godot'),
      `
[config]
version="4.6"
features=["mono","4.4"]
`
    );
    const meta = await parseProjectGodot(project);
    expect(meta.isMono).toBe(true);
  });

  it('空文件不抛错', async () => {
    const project = path.join(tmp, 'empty');
    await fs.mkdir(project, { recursive: true });
    await fs.writeFile(path.join(project, 'project.godot'), '');
    const meta = await parseProjectGodot(project);
    expect(meta.isMono).toBe(false);
    expect(meta.configVersion).toBe('');
  });
});

describe('projectManager.recommendVersion', () => {
  it('从 configVersion 提取 major.minor', async () => {
    const { recommendVersion } = await import('../../main/services/projectManager');
    expect(recommendVersion({ configVersion: '4.6.stable.mono', isMono: true })).toBe('4.6');
    expect(recommendVersion({ configVersion: '', isMono: false })).toBeUndefined();
  });
});
