import React, { useState } from 'react';
import type { AppConfig } from '../../shared/types/settings';
import { useApiQuery } from '../hooks/useApi';
import { toast } from '../stores/toastStore';

export default function Settings() {
  const settings = useApiQuery<AppConfig>(() => window.api.system.getSettings(), []);
  const versionsQ = useApiQuery(() => window.api.versions.list(), []);
  const appVersion = useApiQuery(() => window.api.system.getAppVersion(), []);
  const [draft, setDraft] = useState<Partial<AppConfig>>({});

  if (!settings.data) {
    return <div className="empty"><div className="spinner" /></div>;
  }

  const cfg = { ...settings.data, ...draft };

  const update = (patch: Partial<AppConfig>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    const res = await window.api.system.setSettings(draft);
    if (res.ok) {
      toast.success('设置已保存');
      settings.refresh();
      setDraft({});
    } else {
      toast.error('保存失败: ' + res.error.detail);
    }
  };

  const checkUpdate = async () => {
    const res = await window.api.system.checkUpdate();
    if (res.ok) {
      if (res.data.status === 'available' || res.data.status === 'downloaded') {
        toast.info('发现新版本,将在退出时安装');
      } else if (res.data.status === 'not-available') {
        toast.success('已是最新版本');
      } else if (res.data.status === 'disabled') {
        toast.info('开发模式,跳过更新检查');
      } else {
        toast.info('检查完成: ' + res.data.status);
      }
    } else {
      toast.error('检查失败: ' + res.error.detail);
    }
  };

  const revealLogs = () => window.api.system.revealLogs();

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Preferences</div>
          <div className="page-title">设置</div>
          <div className="page-subtitle">全局配置与系统集成</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {Object.keys(draft).length > 0 && (
            <button className="btn" onClick={() => setDraft({})}>放弃修改</button>
          )}
          <button className="btn btn-primary" onClick={save} disabled={Object.keys(draft).length === 0}>保存</button>
        </div>
      </div>

      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section className="card">
          <h3 style={{ fontSize: 14, margin: '0 0 12px', color: 'var(--gd-text-dim)' }}>启动</h3>
          <div className="form-row">
            <label className="form-label">默认 Godot 版本</label>
            <select
              className="select"
              value={cfg.defaultVersionId || ''}
              onChange={(e) => update({ defaultVersionId: e.target.value || undefined })}
            >
              <option value="">(不指定)</option>
              {(versionsQ.data || []).map((v) => (
                <option key={v.id} value={v.id}>{v.label} ({v.channel})</option>
              ))}
            </select>
            <div className="form-hint">在「项目管理」中启动项目时使用的版本</div>
          </div>
          <div className="form-row">
            <label className="form-label">全局启动附加参数</label>
            <input
              className="input"
              placeholder="例如: --verbose --debug-collisions"
              value={(cfg.defaultLaunchArgs || []).join(' ')}
              onChange={(e) => update({ defaultLaunchArgs: e.target.value.split(/\s+/).filter(Boolean) })}
            />
            <div className="form-hint">以空格分隔,会附加到每次 godot --editor 之后</div>
          </div>
        </section>

        <section className="card">
          <h3 style={{ fontSize: 14, margin: '0 0 12px', color: 'var(--gd-text-dim)' }}>系统集成</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={cfg.closeToTray}
              onChange={(e) => update({ closeToTray: e.target.checked })}
            />
            <span>关闭主窗口时最小化到托盘(默认)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={cfg.autoLaunch}
              onChange={(e) => update({ autoLaunch: e.target.checked })}
            />
            <span>开机时自动启动(以隐藏方式)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={cfg.autoCheckUpdate}
              onChange={(e) => update({ autoCheckUpdate: e.target.checked })}
            />
            <span>启动时自动检查更新</span>
          </label>
        </section>

        <section className="card">
          <h3 style={{ fontSize: 14, margin: '0 0 12px', color: 'var(--gd-text-dim)' }}>关于</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 13 }}>
            <span style={{ color: 'var(--gd-text-dim)' }}>应用版本</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{appVersion.data?.version || '-'}</span>
            <span style={{ color: 'var(--gd-text-dim)' }}>Electron</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{appVersion.data?.electron || '-'}</span>
            <span style={{ color: 'var(--gd-text-dim)' }}>Node</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{appVersion.data?.node || '-'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn" onClick={checkUpdate}>检查更新</button>
            <button className="btn" onClick={revealLogs}>打开日志目录</button>
          </div>
        </section>
      </div>
    </div>
  );
}
