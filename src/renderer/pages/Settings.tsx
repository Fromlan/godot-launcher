import React, { useState, useEffect } from 'react';
import Icon from '../components/Icon';
import type { AppConfig } from '../../shared/types/settings';
import type { LogFileInfo } from '../../shared/types/ipc';
import { useApiQuery } from '../hooks/useApi';
import { sortInstalled } from '../../shared/utils/groupReleases';
import { toast } from '../stores/toastStore';

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(1)} ${units[u]}`;
}

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
      toast.success("设置已保存");
      settings.refresh();
      setDraft({});
    } else {
      toast.error("保存失败: " + res.error.detail);
    }
  };

  const checkUpdate = async () => {
    const res = await window.api.system.checkUpdate();
    if (res.ok) {
      if (res.data.status === "available" || res.data.status === "downloaded") {
        toast.info("发现新版本,将在退出时安装");
      } else if (res.data.status === "not-available") {
        toast.success("已是最新版本");
      } else if (res.data.status === "disabled") {
        toast.info("开发模式,跳过更新检查");
      } else {
        toast.info("检查完成: " + res.data.status);
      }
    } else {
      toast.error("检查失败: " + res.error.detail);
    }
  };

  const revealLogs = () => window.api.system.revealLogs();

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Preferences</div>
          <div className="page-title">设置</div>
          <div className="page-subtitle">全局配置与系统集成 · 快捷键 <span className="kbd">Ctrl</span> + <span className="kbd">1/2/3/4</span> 切换页面</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {Object.keys(draft).length > 0 && (
            <button className="btn" onClick={() => setDraft({})}>放弃修改</button>
          )}
          <button className="btn btn-primary" onClick={save} disabled={Object.keys(draft).length === 0}>保存</button>
        </div>
      </div>

      <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 16 }}>
        <section className="card">
          <h3 style={{ fontSize: 14, margin: "0 0 12px", color: "var(--gd-text-dim)" }}>启动</h3>
          <div className="form-row">
            <label className="form-label">默认 Godot 版本</label>
            <select
              className="select"
              value={cfg.defaultVersionId || ""}
              onChange={(e) => update({ defaultVersionId: e.target.value || undefined })}
            >
              <option value="">(不指定)</option>
              {(sortInstalled(versionsQ.data || [])).map((v) => (
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
              value={(cfg.defaultLaunchArgs || []).join(" ")}
              onChange={(e) => update({ defaultLaunchArgs: e.target.value.split(/\s+/).filter(Boolean) })}
            />
            <div className="form-hint">以空格分隔,会附加到每次 godot --editor 之后</div>
          </div>
        </section>

        <section className="card">
          <h3 style={{ fontSize: 14, margin: "0 0 12px", color: "var(--gd-text-dim)" }}>系统集成</h3>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={cfg.closeToTray}
              onChange={(e) => update({ closeToTray: e.target.checked })}
            />
            <span>关闭主窗口时最小化到托盘(默认)</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={cfg.autoLaunch}
              onChange={(e) => update({ autoLaunch: e.target.checked })}
            />
            <span>开机时自动启动(以隐藏方式)</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={cfg.autoCheckUpdate}
              onChange={(e) => update({ autoCheckUpdate: e.target.checked })}
            />
            <span>启动时自动检查更新</span>
          </label>
        </section>

        <LogsSection />

        <section className="card">
          <h3 style={{ fontSize: 14, margin: "0 0 12px", color: "var(--gd-text-dim)" }}>关于</h3>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13 }}>
            <span style={{ color: "var(--gd-text-dim)" }}>应用版本</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{appVersion.data?.version || "-"}</span>
            <span style={{ color: "var(--gd-text-dim)" }}>Electron</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{appVersion.data?.electron || "-"}</span>
            <span style={{ color: "var(--gd-text-dim)" }}>Node</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{appVersion.data?.node || "-"}</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn" onClick={checkUpdate}><Icon name="refresh" size={13} />检查更新</button>
            <button className="btn" onClick={revealLogs}><Icon name="folder-open" size={13} />打开日志目录</button>
          </div>
        </section>
      </div>
    </div>
  );
}

function LogsSection() {
  const [files, setFiles] = useState<LogFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [tail, setTail] = useState<string>("");
  const [tailLoading, setTailLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const res = await window.api.system.listLogs();
    setLoading(false);
    if (res.ok) setFiles(res.data);
    else toast.error("读取日志列表失败: " + res.error.detail);
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!selected) { setTail(""); return; }
    setTailLoading(true);
    (async () => {
      const res = await window.api.system.readLog({ name: selected, maxBytes: 64 * 1024 });
      setTailLoading(false);
      if (res.ok) setTail(res.data);
      else toast.error("读取日志失败: " + res.error.detail);
    })();
  }, [selected]);

  const clearAll = async () => {
    if (!confirm("确认清空所有日志?此操作不可撤销。")) return;
    const res = await window.api.system.clearLogs();
    if (res.ok) {
      toast.success(`已清理 ${res.data.cleared} 个日志文件`);
      setSelected(null);
      refresh();
    } else {
      toast.error("清理失败: " + res.error.detail);
    }
  };

  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, margin: 0, color: "var(--gd-text-dim)" }}>日志</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={refresh} disabled={loading}><Icon name="refresh" size={13} />{loading ? "刷新中..." : "刷新"}</button>
          <button className="btn btn-danger" onClick={clearAll} disabled={files.length === 0}><Icon name="trash" size={13} />清空</button>
        </div>
      </div>
      {files.length === 0 ? (
        <div className="empty" style={{ padding: 16 }}>
          <div>暂无日志文件</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>应用启动后会按天滚动生成 app-YYYY-MM-DD.log</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12 }}>
          <ul className="log-list">
            {files.map((f) => (
              <li
                key={f.name}
                className={`log-item${selected === f.name ? " selected" : ""}`}
                onClick={() => setSelected(f.name)}
              >
                <div className="log-item-name">{f.name}</div>
                <div className="log-item-meta">{formatBytes(f.sizeBytes)} · {new Date(f.mtimeMs).toLocaleString()}</div>
              </li>
            ))}
          </ul>
          <div className="log-tail-wrap">
            {selected ? (
              <pre className="log-tail">{tailLoading ? "加载中..." : (tail || "(无内容)")}</pre>
            ) : (
              <div className="empty" style={{ padding: 16 }}>
                <div>选择左侧日志文件以查看尾部内容</div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}