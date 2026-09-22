import { describe, it, expect } from 'vitest';
import { toIpc } from '../../main/ipc/result';

describe('toIpc', () => {
  it('同步成功返回 { ok: true, data }', async () => {
    const r = await toIpc(() => 42);
    expect(r).toEqual({ ok: true, data: 42 });
  });

  it('async 成功', async () => {
    const r = await toIpc(async () => {
      await new Promise((res) => setTimeout(res, 5));
      return { items: [1, 2, 3] };
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ items: [1, 2, 3] });
  });

  it('同步抛错返回 { ok: false, error }', async () => {
    const r = await toIpc(() => {
      throw new Error('boom');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('Error');
      expect(r.error.detail).toBe('boom');
    }
  });

  it('异步抛错同上', async () => {
    const r = await toIpc(async () => {
      throw new TypeError('bad type');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('TypeError');
      expect(r.error.detail).toBe('bad type');
    }
  });

  it('裸值抛非 Error 也兼容', async () => {
    const r = await toIpc(() => {
        throw 'string error';
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.detail).toBe('string error');
    }
  });

  it('Error 无 message 时 detail 用 String(err)', async () => {
    const r = await toIpc(() => {
      const e = new Error();
      throw e;
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.detail).toBeTruthy();
    }
  });
});
