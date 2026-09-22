import React from 'react';
import { useToastStore } from '../stores/toastStore';

export default function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.kind}`}
          onClick={() => remove(t.id)}
          title="点击关闭"
        >
          <span style={{ flexShrink: 0, fontSize: 16, fontWeight: 700 }}>
            {t.kind === 'success' ? '\u2713' : t.kind === 'error' ? '\u2715' : t.kind === 'warning' ? '!' : '\u2139'}
          </span>
          <span style={{ flex: 1 }}>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
