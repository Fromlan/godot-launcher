import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import {
  listProjects,
  addProject,
  removeProject,
  updateProject,
  markLaunched
} from '../../main/services/projectManager';

let tmp: string;

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), 'gl-pmcrud-' + Math.random().toString(36).slice(2));
  await fs.mkdir(tmp, { recursive: true });
  process.env.GL_DATA_DIR = tmp;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function makeProject(name: string, body: string): Promise<string> {
  const dir = path.join(tmp, 'projects', name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'project.godot'), body);
  return dir;
}

const BASIC_PROJECT = `
config_version=5
[application]
config/name="Hello"
[config]
version="4.6"
features=["4.4"]
`;

describe('listProjects', () => {
  it('空 manifest 返回 []', async () => {
    expect(await listProjects()).toEqual([]);
  });

  it('损坏 manifest 自动备份并返回 []', async () => {
    const file = path.join(tmp, 'projects.json');
    await fs.writeFile(file, '{nope');
    expect(await listProjects()).toEqual([]);
    const bak = (await fs.readdir(tmp)).find((n) => n.startsWith('projects.json.bak.'));
    expect(bak).toBeDefined();
  });
});

describe('addProject', () => {
  it('解析基础项目并入库', async () => {
    const proj = await makeProject('hello', BASIC_PROJECT);
    const entry = await addProject(proj);
    expect(entry.path).toBe(proj);
    expect(entry.name).toBe('Hello');
    expect(entry.godotVersion).toBe('4.6');
    expect(entry.isMono).toBe(false);
    expect(entry.launchCount).toBe(0);
    expect(entry.id).toMatch(/[0-9a-f-]+/);
  });

  it('缺少 project.godot 时抛错', async () => {
    const dir = path.join(tmp, 'empty');
    await fs.mkdir(dir, { recursive: true });
    await expect(addProject(dir)).rejects.toThrow(/project\.godot/);
  });

  it('project.godot 是目录而非文件时抛错', async () => {
    const dir = path.join(tmp, 'weird');
    await fs.mkdir(path.join(dir, 'project.godot'), { recursive: true });
    await expect(addProject(dir)).rejects.toThrow();
  });

  it('重复添加相同路径返回已有 entry(id 一致)', async () => {
    const proj = await makeProject('dup', BASIC_PROJECT);
    const a = await addProject(proj);
    const b = await addProject(proj);
    expect(a.id).toBe(b.id);
    expect((await listProjects())).toHaveLength(1);
  });

  it('无 application/config/name 时回退到目录名', async () => {
    const proj = await makeProject('unnamed', '[config]\nversion="4.6"\n');
    const entry = await addProject(proj);
    expect(entry.name).toBe('unnamed');
  });

  it('features 含 mono / c# 时 isMono=true', async () => {
    const proj = await makeProject('mono', '[config]\nfeatures=["c#","4.6"]\n');
    const entry = await addProject(proj);
    expect(entry.isMono).toBe(true);
  });
});

describe('removeProject / updateProject / markLaunched', () => {
  it('removeProject 按 id 移除', async () => {
    const proj = await makeProject('a', BASIC_PROJECT);
    const entry = await addProject(proj);
    await removeProject(entry.id);
    expect(await listProjects()).toEqual([]);
  });

  it('removeProject 不存在的 id 不报错', async () => {
    await expect(removeProject('no-such-id')).resolves.toBeUndefined();
  });

  it('updateProject 修改字段并返回最新值', async () => {
    const proj = await makeProject('upd', BASIC_PROJECT);
    const e = await addProject(proj);
    const updated = await updateProject(e.id, { name: 'renamed', isMono: true });
    expect(updated.name).toBe('renamed');
    expect(updated.isMono).toBe(true);
    // 列表里也是新值
    const list = await listProjects();
    expect(list[0].name).toBe('renamed');
  });

  it('updateProject 不存在的 id 抛错', async () => {
    await expect(updateProject('missing', { name: 'x' })).rejects.toThrow();
  });

  it('markLaunched 增加 launchCount 并写 lastOpenedAt', async () => {
    const proj = await makeProject('launch', BASIC_PROJECT);
    const e = await addProject(proj);
    await markLaunched(e.id);
    await markLaunched(e.id);
    const list = await listProjects();
    expect(list[0].launchCount).toBe(2);
    expect(list[0].lastOpenedAt).toBeDefined();
    expect(new Date(list[0].lastOpenedAt!).getTime()).toBeGreaterThan(0);
  });

  it('markLaunched 不存在的 id 静默忽略', async () => {
    await expect(markLaunched('missing')).resolves.toBeUndefined();
  });
});
