import React, { useMemo, useState } from 'react';
import type { GodotVersion, ReleaseInfo, DownloadProgress } from '../../shared/types/godot';
import { useApiQuery, useApiEvent } from '../hooks/useApi';
import { toast } from '../stores/toastStore';
import Modal from '../components/Modal';

function formatSize(bytes: number): string {
  if (!bytes) return '未知';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(1)} ${units[u]}`;
}

/** 按 tag 把 stable / mono 聚合到同一卡片 */
export interface VersionGroup {
  tag: string;
  label: string;
  /** 任一通道为 prerelease(dev/rc/beta/alpha)即视为 true */
  prerelease: boolean;
  publishedAt: string;
  stable?: ReleaseInfo;
  mono?: ReleaseInfo;
}

export function groupReleases(list: ReleaseInfo[]): VersionGroup[] {
  const map = new Map<string, VersionGroup>();
  for (const r of list) {
    let g = map.get(r.tag);
    if (!g) {
      g = { tag: r.tag, label: r.label, prerelease: false, publishedAt: r.publishedAt };
      map.set(r.tag, g);
    }
    // 任一通道为 prerelease,整组视为 dev/prerelease
    g.prerelease = g.prerelease || r.prerelease;
    if (r.channel === 'stable') g.stable = r;
    else if (r.channel === 'mono') g.mono = r;
  }
  return Array.from(map.values());
}

/** 判断 group 是否属于稳定版类型(prerelease=false 即视为 stable) */
export function isStableGroup(g: VersionGroup): boolean {
  return !g.prerelease;
}

export default function Versions() {
  const installed = useApiQuery<GodotVersion[]>(() => window.api.versions.list(), []);
  const releasesQ = useApiQuery<{ releases: ReleaseInfo[]; cachedAt: string | null; stale: boolean }>(
    () => window.api.versions.releases(),
    []
  );
  const [downloads, setDownloads] = useState<Record<string, DownloadProgress>>({});
  const [confirmRemove, setConfirmRemove] = useState<GodotVersion | null>(null);
  const [filter, setFilter] = useState('');
  // 筛选"版本类型":稳定版 / 开发版(原 channel 筛选已下沉到下载按钮上的 channel tag)
  const [showStable, setShowStable] = useState(true);
  const [showDev, setShowDev] = useState(false);

  useApiEvent<DownloadProgress>('versions:download-progress', (p) => {
    setDownloads((cur) => ({ ...cur, [`${p.tag}-${p.channel}`]: p }));
    if (p.phase === 'done') {
      toast.success(`下载完成: ${p.tag} (${p.channel})`);
      installed.refresh();
    } else if (p.phase === 'error') {
      toast.error(`下载失败: ${p.message || '未知错误'}`);
    }
  });

  const settings = useApiQuery(() => window.api.system.getSettings(), []);

  const setDefault = async (id: string) => {
    const res = await window.api.versions.setDefault({ versionId: id });
    if (res.ok) {
      toast.success('已设为默认版本');
      settings.refresh();
    } else {
      toast.error('设置失败: ' + res.error.detail);
    }
  };

  const remove = async (v: GodotVersion) => {
    const res = await window.api.versions.remove({ versionId: v.id });
    if (res.ok) {
      toast.success(`已移除 ${v.label}`);
      installed.refresh();
      settings.refresh();
    } else {
      toast.error('移除失败: ' + res.error.detail);
    }
    setConfirmRemove(null);
  };

  const importExisting = async () => {
    try {
      if (!window.api?.versions?.importExisting) {
        toast.error('导入 API 未就绪,请重启应用');
        return;
      }
      const res = await window.api.versions.importExisting();
      if (res.ok) {
        toast.success('已导入 ' + res.data.label + (res.data.channel === 'mono' ? ' (mono)' : ''));
        installed.refresh();
        settings.refresh();
      } else {
        toast.error('导入失败: ' + (res.error.detail || res.error.code));
      }
    } catch (err) {
      toast.error('导入异常: ' + ((err as Error)?.message || String(err)));
    }
  };

  const download = async (r: ReleaseInfo) => {
    const key = `${r.tag}-${r.channel}`;
    setDownloads((cur) => ({
      ...cur,
      [key]: { tag: r.tag, channel: r.channel, platform: r.platform, receivedBytes: 0, totalBytes: r.sizeBytes, percent: 0, phase: 'downloading' }
    }));
    const res = await window.api.versions.download({ tag: r.tag, channel: r.channel });
    if (!res.ok) {
      toast.error('启动下载失败: ' + res.error.detail);
      setDownloads((cur) => {
        const next = { ...cur };
        delete next[key];
        return next;
      });
    }
  };

  /** 聚合 + 过滤(按版本类型 stable / dev + 关键词) */
  const groupedReleases = useMemo(() => {
    const list = releasesQ.data?.releases || [];
    const groups = groupReleases(list);
    return groups
      .filter((g) => {
        const stable = isStableGroup(g);
        if (stable && !showStable) return false;
        if (!stable && !showDev) return false;
        return true;
      })
      .filter((g) => {
        if (!filter) return true;
        const kw = filter.toLowerCase();
        return g.tag.toLowerCase().includes(kw) || g.label.toLowerCase().includes(kw);
      })
      .slice(0, 50);
  }, [releasesQ.data, filter, showDev, showStable]);

  const installedIds = new Set((installed.data || []).map((v) => `${v.tag}-${v.channel}`));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Engine</div>
          <div className="page-title">Godot 版本管理</div>
          <div className="page-subtitle">下载并管理多个 Godot 编辑器版本</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={importExisting}>导入已有</button>
          <button className="btn" onClick={() => releasesQ.refresh()}>刷新列表</button>
        </div>
      </div>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, color: 'var(--gd-text-dim)', margin: '0 0 12px' }}>已安装 ({installed.data?.length || 0})</h3>
        {installed.loading ? (
          <div className="empty"><div className="spinner" /></div>
        ) : (installed.data?.length ?? 0) === 0 ? (
          <div className="empty">
            <div className="empty-art"><span>◇</span></div>
            <div className="empty-title">尚未安装任何 Godot 版本</div>
            <div>请在下方列表中选择一个版本下载</div>
          </div>
        ) : (
          <div className="card-grid">
            {installed.data!.map((v) => (
              <div className="card" key={v.id}>
                <div className="card-title">
                  <span>{v.label}</span>
                  <span className={`tag ${v.channel === 'mono' ? 'tag-primary' : 'tag-success'}`}>{v.channel}</span>
                  {settings.data?.defaultVersionId === v.id && <span className="tag tag-primary">默认</span>}
                </div>
                <div className="card-subtitle">{v.installPath}</div>
                <div className="card-meta">
                  <span>{formatSize(v.sizeBytes)}</span>
                  <span>{new Date(v.installedAt).toLocaleDateString()}</span>
                </div>
                <div className="card-actions">
                  {settings.data?.defaultVersionId !== v.id && (
                    <button className="btn" onClick={() => setDefault(v.id)}>设为默认</button>
                  )}
                  <button className="btn btn-danger" onClick={() => setConfirmRemove(v)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 style={{ fontSize: 14, color: 'var(--gd-text-dim)', margin: '0 0 12px' }}>可用版本</h3>
        <div className="toolbar">
          <input
            className="input"
            style={{ maxWidth: 280 }}
            placeholder="搜索 tag 或版本名..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, color: 'var(--gd-text-dim)' }}>
            <input type="checkbox" checked={showStable} onChange={(e) => setShowStable(e.target.checked)} /> stable 版本
          </label>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, color: 'var(--gd-text-dim)' }}>
            <input type="checkbox" checked={showDev} onChange={(e) => setShowDev(e.target.checked)} /> dev 版本
          </label>
        </div>

        {releasesQ.loading ? (
          <div className="empty"><div className="spinner" /></div>
        ) : groupedReleases.length === 0 ? (
          <div className="empty">
            <div className="empty-art"><span>◎</span></div>
            <div className="empty-title">没有匹配的版本</div>
            <div>尝试调整勾选或清空搜索条件</div>
          </div>
        ) : (
          <div className="card-grid">
            {groupedReleases.map((g) => {
              const stableInstalled = installedIds.has(`${g.tag}-stable`);
              const monoInstalled = installedIds.has(`${g.tag}-mono`);
              const stableProgress = downloads[`${g.tag}-stable`];
              const monoProgress = downloads[`${g.tag}-mono`];
              const size = Math.max(g.stable?.sizeBytes ?? 0, g.mono?.sizeBytes ?? 0);
              const channels = [g.stable ? 'stable' : null, g.mono ? 'mono' : null].filter(Boolean);
              return (
                <div className="card" key={g.tag}>
                  <div className="card-title">
                    <span>{g.label}</span>
                    {g.prerelease && <span className="tag tag-warning">preview</span>}
                    {channels.map((c) => (
                      <span key={c} className={`tag ${c === 'mono' ? 'tag-primary' : 'tag-success'}`}>{c}</span>
                    ))}
                  </div>
                  <div className="card-subtitle">{g.tag} · win64</div>
                  <div className="card-meta">
                    <span>{formatSize(size)}</span>
                    <span>{new Date(g.publishedAt).toLocaleDateString()}</span>
                  </div>
                  {(stableProgress && stableProgress.phase !== 'done') && (
                    <ProgressBar p={stableProgress} label="stable" />
                  )}
                  {(monoProgress && monoProgress.phase !== 'done') && (
                    <ProgressBar p={monoProgress} label="mono" />
                  )}
                  <div className="card-actions">
                    {g.stable && (
                      <button
                        className="btn btn-primary"
                        onClick={() => download(g.stable!)}
                        disabled={!!stableProgress && stableProgress.phase !== 'done' && stableProgress.phase !== 'error'}
                        title={stableInstalled ? '重新下载 stable 通道' : '下载 stable 通道'}
                      >
                        {stableInstalled ? '重下 stable' : '下载 stable'}
                      </button>
                    )}
                    {g.mono && (
                      <button
                        className="btn"
                        onClick={() => download(g.mono!)}
                        disabled={!!monoProgress && monoProgress.phase !== 'done' && monoProgress.phase !== 'error'}
                        title={monoInstalled ? '重新下载 mono 通道' : '下载 mono 通道'}
                      >
                        {monoInstalled ? '重下 mono' : '下载 mono'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        open={!!confirmRemove}
        title="删除 Godot 版本"
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => confirmRemove && remove(confirmRemove)}
        confirmLabel="删除"
      >
        <p>确认删除 <strong>{confirmRemove?.label}</strong> 吗?该操作不可撤销。</p>
      </Modal>
    </div>
  );
}

function ProgressBar({ p, label }: { p: DownloadProgress; label: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--gd-text-muted)', marginBottom: 2 }}>
        <span>{label}</span>
        <span>{p.phase === 'downloading' && `${p.percent}%`}{p.phase === 'extracting' && '解压中...'}{p.phase === 'error' && (p.message || '失败')}</span>
      </div>
      <div className="progress"><div className="progress-fill" style={{ width: `${p.percent}%` }} /></div>
    </div>
  );
}
