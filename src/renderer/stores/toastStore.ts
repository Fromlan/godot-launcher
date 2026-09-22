import { create } from 'zustand';

export type ToastKind = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** 剩余时长(ms);-1 表示常驻(需手动关闭) */
  remaining: number;
  /** 是否被 hover 暂停倒计时 */
  paused: boolean;
}

interface ToastStore {
  toasts: Toast[];
  push: (kind: ToastKind, message: string, opts?: { durationMs?: number; sticky?: boolean }) => void;
  remove: (id: number) => void;
  pause: (id: number) => void;
  resume: (id: number) => void;
}

/** 默认 4.5s */
const DEFAULT_DURATION = 4500;
/** 同时显示的最大数;超出后最早的会被挤掉 */
const MAX_TOASTS = 6;
/** 倒计时 tick 间隔 */
const TICK_MS = 250;

let idCounter = 1;
let ticker: ReturnType<typeof setInterval> | null = null;

export const useToastStore = create<ToastStore>((set, get) => {
  return {
    toasts: [],
    push: (kind, message, opts) => {
      const sticky = opts?.sticky === true;
      const duration = opts?.durationMs ?? DEFAULT_DURATION;
      const id = idCounter++;
      const toast: Toast = {
        id,
        kind,
        message,
        remaining: sticky ? -1 : duration,
        paused: false
      };
      const cur = get().toasts;
      const trimmed = cur.length >= MAX_TOASTS ? cur.slice(cur.length - MAX_TOASTS + 1) : cur;
      set({ toasts: [...trimmed, toast] });
      ensureTicker(set, get);
    },
    remove: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
    pause: (id) => set({ toasts: get().toasts.map((t) => (t.id === id ? { ...t, paused: true } : t)) }),
    resume: (id) => set({ toasts: get().toasts.map((t) => (t.id === id ? { ...t, paused: false } : t)) })
  };
});

function ensureTicker(set, get): void {
  if (ticker) return;
  ticker = setInterval(() => {
    const cur = get().toasts;
    const next: Toast[] = [];
    let changed = false;
    for (const t of cur) {
      if (t.remaining < 0 || t.paused) {
        next.push(t);
        continue;
      }
      const r = t.remaining - TICK_MS;
      if (r <= 0) {
        changed = true;
        continue;
      }
      if (r !== t.remaining) changed = true;
      next.push({ ...t, remaining: r });
    }
    if (changed) set({ toasts: next });
  }, TICK_MS);
}

export const toast = {
  info: (m: string, opts?: { durationMs?: number; sticky?: boolean }) =>
    useToastStore.getState().push("info", m, opts),
  success: (m: string, opts?: { durationMs?: number; sticky?: boolean }) =>
    useToastStore.getState().push("success", m, opts),
  warning: (m: string, opts?: { durationMs?: number; sticky?: boolean }) =>
    useToastStore.getState().push("warning", m, opts),
  error: (m: string, opts?: { durationMs?: number; sticky?: boolean }) =>
    useToastStore.getState().push("error", m, opts),
  /** sticky error:不自动消失,需手动关闭 */
  stickyError: (m: string) => useToastStore.getState().push("error", m, { sticky: true })
};