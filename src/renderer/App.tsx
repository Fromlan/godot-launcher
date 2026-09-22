import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Versions from './pages/Versions';
import Projects from './pages/Projects';
import Plugins from './pages/Plugins';
import Settings from './pages/Settings';
import ToastHost from './components/ToastHost';

/** 全局快捷键:
 *   Ctrl/Cmd + 1..4 切换页
 *   Ctrl/Cmd + L     跳到设置页(便于查看日志)
 */
function useKeyboardShortcuts() {
  const nav = useNavigate();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // 在输入框中不抢焦点
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (k === "1") { e.preventDefault(); nav("/versions"); }
      else if (k === "2") { e.preventDefault(); nav("/projects"); }
      else if (k === "3") { e.preventDefault(); nav("/plugins"); }
      else if (k === "4") { e.preventDefault(); nav("/settings"); }
      else if (k === "l") { e.preventDefault(); nav("/settings"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nav]);
}

export default function App() {
  useKeyboardShortcuts();
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/versions" replace />} />
          <Route path="/versions" element={<Versions />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/plugins" element={<Plugins />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/versions" replace />} />
        </Routes>
      </main>
      <ToastHost />
    </div>
  );
}