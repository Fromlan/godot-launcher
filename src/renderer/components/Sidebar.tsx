import React from 'react';
import { NavLink } from 'react-router-dom';
import logoUrl from '../assets/logo.png';
import Icon, { type IconName } from './Icon';

/**
 * 侧栏导航 —— 用真 SVG 图标(替代之前的 Unicode 字符)。
 * 选型:at-icons 中语义最贴近的 4 个:
 * - 版本管理  → atom  (Godot 引擎核心图元)
 * - 项目管理  → folder
 * - 插件管理  → cog    (语义类似 about-extensions)
 * - 设置      → wrench (扳手,与 cog 区分)
 */
const navItems: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/versions', label: '版本管理', icon: 'atom' },
  { to: '/projects', label: '项目管理', icon: 'folder' },
  { to: '/plugins',  label: '插件管理', icon: 'cog' },
  { to: '/settings', label: '设置',     icon: 'wrench' }
];

export default function Sidebar(): React.ReactElement {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <img className="sidebar-mark" src={logoUrl} alt="Godot Launcher logo" />
          <div>
            <div className="sidebar-title">Godot Launcher</div>
            <div className="sidebar-subtitle">v0.1.0</div>
          </div>
        </div>
      </div>
      <nav>
        {navItems.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
          >
            <span className="sidebar-link-icon"><Icon name={n.icon} /></span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-foot-row">
          <span className="sidebar-foot-label">
            <span className="status-dot" aria-hidden />状态
          </span>
          <strong>在线</strong>
        </div>
        <div className="sidebar-foot-row">
          <span className="sidebar-foot-label">
            <Icon name="palette" size={12} className="icon-dim" />主题
          </span>
          <strong>Godot Dark</strong>
        </div>
      </div>
    </aside>
  );
}
