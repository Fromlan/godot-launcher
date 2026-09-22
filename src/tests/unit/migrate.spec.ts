import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import {
  readJsonSafe,
  writeJsonAtomic,
  injectSchemaVersion
} from '../../main/utils/migrate';

let tmp: string;

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), 'gl-mig-' + Math.random().toString(36).slice(2));
  await fs.mkdir(tmp, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('readJsonSafe', () => {
  it('文件不存在返回 null', async () => {
    const r = await readJsonSafe<{ a: number }>(path.join(tmp, 'absent.json'));
    expect(r).toBeNull();
  });

  it('解析成功的 JSON 原样返回', async () => {
    const file = path.join(tmp, 'ok.json');
    await fs.writeFile(file, JSON.stringify({ a: 1, b: ['x', 'y'] }));
    const r = await readJsonSafe<{ a: number; b: string[] }>(file);
    expect(r).toEqual({ a: 1, b: ['x', 'y'] });
  });

  it('解析失败时备份为 .bak.<ts> 并返回 null', async () => {
    const file = path.join(tmp, 'bad.json');
    await fs.writeFile(file, '{not valid');
    const r = await readJsonSafe<unknown>(file);
    expect(r).toBeNull();
    const bak = (await fs.readdir(tmp)).find((n) => n.startsWith('bad.json.bak.'));
    expect(bak).toBeDefined();
    // 原文件被 rename 到 .bak,内容原样保留
    expect(await fs.readFile(path.join(tmp, bak!), 'utf-8')).toBe('{not valid');
  });

  it('解析失败时备份过程本身失败也不抛错(返回 null)', async () => {
    const file = path.join(tmp, 'bad2.json');
    await fs.writeFile(file, '{nope');
    // 把目录设成只读文件,rename 必然失败
    const blocker = path.join(tmp, 'blocker');
    await fs.writeFile(blocker, 'x');
    // 让 file 指向 blocker(只读文件,rename 会 EEXIST)
    const r = await readJsonSafe<unknown>(blocker + '/bad.json');
    expect(r).toBeNull();
  });

  it('非 ENOENT 读错误返回 null', async () => {
    // 把 tmp 替换成 blocker(无法 stat 文件,得到 EACCES/ENOTDIR)
    const blocker = path.join(tmp, 'blocker');
    await fs.writeFile(blocker, 'x');
    const r = await readJsonSafe<unknown>(path.join(blocker, 'in.json'));
    expect(r).toBeNull();
  });
});

describe('writeJsonAtomic', () => {
  it('写入文件后内容是 pretty JSON', async () => {
    const file = path.join(tmp, 'a', 'b', 'x.json');
    await writeJsonAtomic(file, { a: 1, list: [1, 2, 3] });
    const text = await fs.readFile(file, 'utf-8');
    expect(JSON.parse(text)).toEqual({ a: 1, list: [1, 2, 3] });
    expect(text).toContain('\n');
  });

  it('覆盖已有文件', async () => {
    const file = path.join(tmp, 'x.json');
    await writeJsonAtomic(file, { v: 1 });
    await writeJsonAtomic(file, { v: 2 });
    expect(JSON.parse(await fs.readFile(file, 'utf-8'))).toEqual({ v: 2 });
  });

  it('崩溃时不会出现半写状态(临时文件不残留)', async () => {
    const file = path.join(tmp, 'y.json');
    await writeJsonAtomic(file, { v: 1 });
    const tmpFile = file + '.tmp';
    expect(await fs.stat(tmpFile).catch(() => null)).toBeNull();
  });
});

describe('injectSchemaVersion', () => {
  it('null → { schemaVersion: target }', () => {
    expect(injectSchemaVersion(null, 1)).toEqual({ schemaVersion: 1 });
  });

  it('缺字段时注入 schemaVersion', () => {
    expect(injectSchemaVersion({ a: 1 }, 2)).toEqual({ a: 1, schemaVersion: 2 });
  });

  it('已有 schemaVersion 时保留旧值', () => {
    const v = { schemaVersion: 5, a: 1 } as { schemaVersion: number; a: number };
    expect(injectSchemaVersion(v, 1)).toEqual({ schemaVersion: 5, a: 1 });
    expect(v.schemaVersion).toBe(5);
  });

  it('非数字 schemaVersion(坏数据) 替换为 target', () => {
    const v = { schemaVersion: 'oops', a: 1 } as unknown as { schemaVersion?: unknown; a: number };
    expect(injectSchemaVersion(v as object, 3)).toEqual({ schemaVersion: 3, a: 1 });
  });

  it('返回类型保持原对象字段', () => {
    const r = injectSchemaVersion({ name: 'foo', count: 7 }, 4);
    expect(r).toEqual({ name: 'foo', count: 7, schemaVersion: 4 });
  });
});
