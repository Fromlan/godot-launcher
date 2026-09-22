import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/versions', label: '版本管理', icon: '\u25C8' },
  { to: '/projects', label: '项目管理', icon: '\u25A3' },
  { to: '/plugins', label: '插件管理', icon: '\u25C9' },
  { to: '/settings', label: '设置', icon: '\u2699' }
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-mark">G</div>
          <div>
            <div className="sidebar-title">Godot Launcher</div>
            <div className="sidebar-subtitle">v0.1.0</div>
          </div>
        </div>
      </div>
      <nav>
        {navItems.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
            <span className="sidebar-link-icon">{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-foot-row">
          <span>状态</span>
          <strong>在线</strong>
        </div>
        <div className="sidebar-foot-row">
          <span>主题</span>
          <strong>Godot Dark</strong>
        </div>
      </div>
    </aside>
  );
}
