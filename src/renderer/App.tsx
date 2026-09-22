import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Versions from './pages/Versions';
import Projects from './pages/Projects';
import Plugins from './pages/Plugins';
import Settings from './pages/Settings';
import ToastHost from './components/ToastHost';

export default function App() {
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
