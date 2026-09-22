import type { IpcResult } from '../../shared/types/ipc';

/** 包装 Promise → IpcResult */
export async function toIpc<T>(fn: () => Promise<T> | T): Promise<IpcResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    const e = err as Error;
    return {
      ok: false,
      error: {
        code: e.name || 'UNKNOWN',
        detail: e.message || String(err)
      }
    };
  }
}
