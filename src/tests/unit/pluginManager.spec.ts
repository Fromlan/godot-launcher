import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

describe('pluginManager list/toggle', () => {
  let tmp: string;
  let project: string;
  let listLocalPlugins: (p: string) => Promise<Array<{ name: string; enabled: boolean }>>;
  let togglePlugin: (p: string, n: string) => Promise<{ name: string; enabled: boolean }>;

  beforeEach(async () => {
    tmp = path.join(os.tmpdir(), 'gl-pl-' + Math.random().toString(36).slice(2));
    project = path.join(tmp, 'proj');
    await fs.mkdir(path.join(project, 'addons', 'foo'), { recursive: true });
    await fs.mkdir(path.join(project, 'addons', 'bar'), { recursive: true });
    await fs.writeFile(
      path.join(project, 'addons', 'foo', 'plugin.cfg'),
      `[plugin]\nname="Foo"\ndescription="Test"\nauthor="me"\nversion="1.0.0"\n`
    );
    await fs.writeFile(
      path.join(project, 'addons', 'bar', 'plugin.cfg.disabled'),
      `[plugin]\nname="Bar"\ndescription="Test B"\nauthor="me"\nversion="0.5.0"\n`
    );
    process.env.GL_DATA_DIR = tmp;
    const mod = await import('../../main/services/pluginManager');
    listLocalPlugins = mod.listLocalPlugins;
    togglePlugin = mod.togglePlugin;
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('列出 addons 中的插件,识别 enabled 状态', async () => {
    const list = await listLocalPlugins(project);
    expect(list.length).toBe(2);
    const foo = list.find((p) => p.name === 'foo')!;
    const bar = list.find((p) => p.name === 'bar')!;
    expect(foo.enabled).toBe(true);
    expect(bar.enabled).toBe(false);
  });

  it('toggle 切换 foo 的状态', async () => {
    const after1 = await togglePlugin(project, 'foo');
    expect(after1.enabled).toBe(false);
    const after2 = await togglePlugin(project, 'foo');
    expect(after2.enabled).toBe(true);
  });

  it('toggle 启用 bar', async () => {
    const after = await togglePlugin(project, 'bar');
    expect(after.enabled).toBe(true);
  });
});
