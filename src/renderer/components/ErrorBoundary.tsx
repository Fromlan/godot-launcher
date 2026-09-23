import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 全局渲染错误边界。
 * - 任一子树渲染时抛错 → 渲染 fallback UI(暗色卡片 + 错误堆栈折叠 + 复制 / 刷新按钮)
 * - 不阻断 UI 整体可用性,避免单页 bug 导致整个白屏
 * - 当前只 console.error,不上报远程服务(plan §F 默认)
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleCopy = (): void => {
    const { error } = this.state;
    if (!error) return;
    const text = `Error: ${error.message}\nStack:\n${error.stack || ''}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        this.fallbackCopy(text);
      });
    } else {
      this.fallbackCopy(text);
    }
  };

  private fallbackCopy(text: string): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    document.body.removeChild(ta);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;
    const { error } = this.state;
    return (
      <div className="app-shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ maxWidth: 560, padding: 24 }}>
          <div className="card-title" style={{ color: 'var(--gd-danger)' }}>
            <span>出错了</span>
          </div>
          <div className="card-subtitle" style={{ marginBottom: 16 }}>
            渲染层捕获到一个未处理的错误。下方堆栈已折叠,需要可点开查看。
          </div>
          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--gd-text-dim)', fontSize: 12 }}>
              查看错误详情
            </summary>
            <pre style={{
              marginTop: 8,
              padding: 12,
              background: 'var(--gd-bg-2)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 240,
              overflow: 'auto'
            }}>
              {error?.message ?? ''}
              {error?.stack ? '\n' + error.stack : ''}
            </pre>
          </details>
          <div className="card-actions">
            <button className="btn" onClick={this.handleCopy}>复制错误</button>
            <button className="btn btn-primary" onClick={this.handleReload}>刷新页面</button>
          </div>
        </div>
      </div>
    );
  }
}