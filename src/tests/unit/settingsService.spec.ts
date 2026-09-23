import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

// Mock electron's app.setLoginItemSettings so setSettings(...) 不去改注册表
vi.mock('electron', () => ({
  app: {
    setLoginItemSettings: vi.fn(),
    getLoginItemSettings: () => ({ openAtLogin: false }),
    // 模拟打包后,setAutoLaunch 才会真正写入注册表
    isPackaged: true
  }
}));

import { getSettings, setSettings, setDefaultVersion } from '../../main/services/settingsService';
import { DEFAULT_APP_CONFIG } from '../../shared/types/settings';

let tmp: string;

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), 'gl-cfg-' + Math.random().toString(36).slice(2));
  await fs.mkdir(tmp, { recursive: true });
  process.env.GL_DATA_DIR = tmp;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('settingsService', () => {
  it('首次读取返回默认配置', async () => {
    const cfg = await getSettings();
    expect(cfg).toEqual(DEFAULT_APP_CONFIG);
  });

  it('setSettings 合并 patch 并持久化', async () => {
    const next = await setSettings({ closeToTray: false, defaultLaunchArgs: ['--verbose'] });
    expect(next.closeToTray).toBe(false);
    expect(next.defaultLaunchArgs).toEqual(['--verbose']);
    expect(next.theme).toBe('godot-dark');

    // 再次读取应拿到持久化的版本
    const reread = await getSettings();
    expect(reread.closeToTray).toBe(false);
    expect(reread.defaultLaunchArgs).toEqual(['--verbose']);
  });

  it('缺字段时填默认值(向后兼容老 manifest)', async () => {
    const file = path.join(tmp, 'config.json');
    await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, defaultVersionId: 'abc' }));
    const cfg = await getSettings();
    expect(cfg.defaultVersionId).toBe('abc');
    expect(cfg.closeToTray).toBe(DEFAULT_APP_CONFIG.closeToTray);
    expect(cfg.theme).toBe('godot-dark');
  });

  it('损坏 manifest 自动备份并返回默认', async () => {
    const file = path.join(tmp, 'config.json');
    await fs.writeFile(file, '{nope');
    const cfg = await getSettings();
    expect(cfg).toEqual(DEFAULT_APP_CONFIG);
    const bak = (await fs.readdir(tmp)).find((n) => n.startsWith('config.json.bak.'));
    expect(bak).toBeDefined();
  });

  it('setSettings 不存在的字段不写盘', async () => {
    await setSettings({ defaultVersionId: 'v1' });
    const file = path.join(tmp, 'config.json');
    const text = await fs.readFile(file, 'utf-8');
    expect(text).toContain('"defaultVersionId": "v1"');
    // schemaVersion 必须存在(写入器注入)
    expect(text).toContain('"schemaVersion":');
  });

  it('setDefaultVersion 等价于 setSettings({ defaultVersionId })', async () => {
    await setDefaultVersion('xyz');
    const cfg = await getSettings();
    expect(cfg.defaultVersionId).toBe('xyz');
  });

  it('setDefaultVersion(undefined) 清空默认版本', async () => {
    await setDefaultVersion('xyz');
    await setDefaultVersion(undefined);
    const cfg = await getSettings();
    expect(cfg.defaultVersionId).toBeUndefined();
  });

  it('autoLaunch 变化时调用 setLoginItemSettings', async () => {
    const { app } = await import('electron');
    await setSettings({ autoLaunch: true });
    expect((app.setLoginItemSettings as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    const last = (app.setLoginItemSettings as ReturnType<typeof vi.fn>).mock.calls.slice(-1)[0][0];
    expect(last.openAtLogin).toBe(true);
  });

  it('autoLaunch 未变化时不调用 setLoginItemSettings', async () => {
    const { app } = await import('electron');
    (app.setLoginItemSettings as ReturnType<typeof vi.fn>).mockClear();
    await setSettings({ closeToTray: false });
    expect((app.setLoginItemSettings as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('setSettings 抛错时不阻断 save(setAutoLaunch 失败只 warn)', async () => {
    const { app } = await import('electron');
    (app.setLoginItemSettings as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reg write failed');
    });
    await expect(setSettings({ autoLaunch: true })).resolves.toBeDefined();
  });
});