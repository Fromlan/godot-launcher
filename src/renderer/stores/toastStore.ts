import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  remove: (id: number) => void;
}

let idCounter = 1;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (kind, message) => {
    const id = idCounter++;
    set({ toasts: [...get().toasts, { id, kind, message }] });
    setTimeout(() => get().remove(id), 4500);
  },
  remove: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
}));

export const toast = {
  info: (m: string) => useToastStore.getState().push('info', m),
  success: (m: string) => useToastStore.getState().push('success', m),
  warning: (m: string) => useToastStore.getState().push('warning', m),
  error: (m: string) => useToastStore.getState().push('error', m)
};
