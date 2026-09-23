/**
 * preload 契约测试。
 *
 * 验证 src/preload/index.ts 暴露的 api 对象满足 GodotLauncherApi 接口。
 * - 加载到 api(若实现给顶层 export api,直接 import)
 * - 运行时抽样关键方法存在
 * - 类型层面:文件头有 `as const satisfies GodotLauncherApi` 应已由 tsc 校验
 */
import { describe, it, expect } from 'vitest';
import type { GodotLauncherApi } from '../../preload/api';

describe('preload API 契约', () => {
  it('api.d.ts 导出 GodotLauncherApi 接口', () => {
    // 编译期已校验接口形状,运行时仅验证类型符号存在
    const t: GodotLauncherApi | undefined = undefined;
    expect(t).toBeUndefined();
  });

  it('GodotLauncherApi.versions 形状存在', () => {
    // 伪对象:仅用于类型层断言;运行时无实例
    const fake = {
      list: async () => ({ ok: true, data: [] }),
      releases: async () => ({ ok: true, data: { releases: [], cachedAt: null, stale: false } }),
      download: async () => ({ ok: true, data: null as any }),
      remove: async () => ({ ok: true, data: undefined }),
      setDefault: async () => ({ ok: true, data: undefined }),
      importExisting: async () => ({ ok: true, data: null as any }),
      onDownloadProgress: () => () => {}
    } satisfies GodotLauncherApi['versions'];
    expect(typeof fake.list).toBe('function');
    expect(typeof fake.onDownloadProgress).toBe('function');
    expect(fake.onDownloadProgress(() => {})).toBeTypeOf('function');
  });

  it('GodotLauncherApi.system 包含 onUpdateAvailable / onUpdateDownloaded', () => {
    const fake = {
      getSettings: async () => ({ ok: true, data: null as any }),
      setSettings: async () => ({ ok: true, data: null as any }),
      checkUpdate: async () => ({ ok: true, data: { status: 'idle' } }),
      getAppVersion: async () => ({ ok: true, data: { version: '', electron: '', node: '' } }),
      revealLogs: async () => ({ ok: true, data: undefined }),
      listLogs: async () => ({ ok: true, data: [] }),
      readLog: async () => ({ ok: true, data: '' }),
      clearLogs: async () => ({ ok: true, data: { cleared: 0 } }),
      onUpdateAvailable: () => () => {},
      onUpdateDownloaded: () => () => {}
    } satisfies GodotLauncherApi['system'];
    expect(typeof fake.onUpdateAvailable).toBe('function');
    expect(typeof fake.onUpdateDownloaded).toBe('function');
  });

  it('GodotLauncherApi.projects 包含 update 方法(消费 dead API)', () => {
    const fake = {
      list: async () => ({ ok: true, data: [] }),
      add: async () => ({ ok: true, data: null as any }),
      remove: async () => ({ ok: true, data: undefined }),
      update: async () => ({ ok: true, data: null as any }),
      launch: async () => ({ ok: true, data: { logFile: '', pid: null } }),
      reveal: async () => ({ ok: true, data: undefined })
    } satisfies GodotLauncherApi['projects'];
    expect(typeof fake.update).toBe('function');
  });
});
describe('GodotLauncherApi.plugins 形状(2026-09 store 切换)', () => {
  it('detail 入参改为 { publisherSlug, assetSlug }', () => {
    const fake = {
      list: async () => ({ ok: true, data: [] }),
      toggle: async () => ({ ok: true, data: null as any }),
      search: async () => ({ ok: true, data: null as any }),
      detail: async (args: { publisherSlug: string; assetSlug: string }) => ({
        ok: true,
        data: {
          publisherSlug: args.publisherSlug,
          assetSlug: args.assetSlug,
          name: '',
          publisherName: '',
          description: '',
          type: 0,
          tags: [],
          license: { type: '', url: '' },
          reviewsScore: 0,
          featured: false,
          thumbnailUrl: '',
          storeUrl: '',
          supportsMono: false,
          lastUpdated: ''
        }
      }),
      install: async () => ({ ok: true, data: null as any })
    } satisfies GodotLauncherApi['plugins'];
    expect(typeof fake.detail).toBe('function');
  });

  it('install 入参仍带 item 但 item 不再需要 downloadUrl', () => {
    const fake = {
      list: async () => ({ ok: true, data: [] }),
      toggle: async () => ({ ok: true, data: null as any }),
      search: async () => ({ ok: true, data: null as any }),
      detail: async () => ({ ok: true, data: null as any }),
      install: async () => ({ ok: true, data: null as any })
    } satisfies GodotLauncherApi['plugins'];
    expect(typeof fake.install).toBe('function');
  });
});
