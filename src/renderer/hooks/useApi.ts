import { useEffect, useState, useCallback } from 'react';
import type { IpcResult, IpcEvent } from '../../shared/types/ipc';

/** 通用 data fetching hook */
export function useApiQuery<T>(fetcher: () => Promise<IpcResult<T>>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetcher();
    if (res.ok) setData(res.data);
    else setError(res.error.detail || res.error.code);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error, refresh, setData };
}

/** 监听主进程推送事件 */
export function useApiEvent<T>(event: IpcEvent, handler: (payload: T) => void) {
  useEffect(() => {
    const off = window.api.on(event, (p) => handler(p as T));
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}
