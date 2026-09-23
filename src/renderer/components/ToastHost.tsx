import React from 'react';
import { useToastStore } from '../stores/toastStore';
import Icon, { type IconName } from './Icon';

function iconNameFor(kind: string): IconName {
  if (kind === 'success') return 'check';
  if (kind === 'error')   return 'cross';
  if (kind === 'warning') return 'lightning';
  return 'info-circle';
}

function ProgressBar({ remaining, sticky, paused }: { remaining: number; sticky: boolean; paused: boolean }) {
  if (sticky) return null;
  // remaining 单位 ms;映射到 0..1(相对于默认 4500)
  const ratio = Math.max(0, Math.min(1, remaining / 4500));
  return (
    <div className="toast-progress" aria-hidden>
      <div
        className="toast-progress-fill"
        style={{ transform: 'scaleX(' + ratio + ')', animationPlayState: paused ? 'paused' : 'running' }}
      />
    </div>
  );
}

export default function ToastHost(): React.ReactElement {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);
  const pause = useToastStore((s) => s.pause);
  const resume = useToastStore((s) => s.resume);
  return (
    <div className="toast-host" role="region" aria-label="通知">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={'toast toast-' + t.kind + (t.remaining < 0 ? ' toast-sticky' : '')}
          role={t.kind === 'error' ? 'alert' : 'status'}
          onMouseEnter={() => pause(t.id)}
          onMouseLeave={() => resume(t.id)}
          onFocus={() => pause(t.id)}
          onBlur={() => resume(t.id)}
        >
          <span className="toast-icon" aria-hidden><Icon name={iconNameFor(t.kind)} /></span>
          <span className="toast-message">{t.message}</span>
          <button
            className="toast-close"
            aria-label="关闭通知"
            onClick={() => remove(t.id)}
          >
            {'×'}
          </button>
          <ProgressBar remaining={t.remaining} sticky={t.remaining < 0} paused={t.paused} />
        </div>
      ))}
    </div>
  );
}
