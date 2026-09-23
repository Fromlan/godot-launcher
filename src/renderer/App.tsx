import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ToastHost from './components/ToastHost';
import ErrorBoundary from './components/ErrorBoundary';

/**
 * 路由懒加载:每个页面独立 chunk,初次加载只下载 Versions 页。
 * 切页时按需拉取对应 chunk,Vite/Rollup 自动拆包。
 */
const Versions = lazy(() => import('./pages/Versions'));
const Projects = lazy(() => import('./pages/Projects'));
const Plugins = lazy(() => import('./pages/Plugins'));
const Settings = lazy(() => import('./pages/Settings'));

/** 全局快捷键:
 *   Ctrl/Cmd + 1..4 切换页
 *   Ctrl/Cmd + L     跳到设置页(便于查看日志)
 */
function useKeyboardShortcuts(): null {
  const nav = useNavigate();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // 在输入框中不抢焦点
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === '1') { e.preventDefault(); nav('/versions'); }
      else if (k === '2') { e.preventDefault(); nav('/projects'); }
      else if (k === '3') { e.preventDefault(); nav('/plugins'); }
      else if (k === '4') { e.preventDefault(); nav('/settings'); }
      else if (k === 'l') { e.preventDefault(); nav('/settings'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nav]);
  return null;
}

function PageFallback(): React.ReactElement {
  return (
    <div className="empty">
      <div className="spinner" />
    </div>
  );
}

export default function App(): React.ReactElement {
  useKeyboardShortcuts();
  return (
    <ErrorBoundary>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/versions" replace />} />
              <Route path="/versions" element={<Versions />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/plugins" element={<Plugins />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/versions" replace />} />
            </Routes>
          </Suspense>
        </main>
        <ToastHost />
      </div>
    </ErrorBoundary>
  );
}