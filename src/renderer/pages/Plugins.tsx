import React, { useEffect, useState } from 'react';
import type { ProjectEntry } from '../../shared/types/project';
import type { PluginEntry, AssetLibSearchResult, AssetLibItem } from '../../shared/types/plugin';
import { useApiQuery } from '../hooks/useApi';
import { toast } from '../stores/toastStore';

export default function Plugins() {
  const projects = useApiQuery<ProjectEntry[]>(() => window.api.projects.list(), []);
  const [selectedProject, setSelectedProject] = useState<string>('');

  useEffect(() => {
    if (!selectedProject && projects.data && projects.data.length > 0) {
      setSelectedProject(projects.data[0].id);
    }
  }, [projects.data, selectedProject]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Toolchain</div>
          <div className="page-title">插件管理</div>
          <div className="page-subtitle">本地启用/禁用 + 官方 AssetLib 资源池</div>
        </div>
        <select
          className="select"
          style={{ maxWidth: 320 }}
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          <option value="">选择项目...</option>
          {(projects.data || []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {selectedProject ? (
        <ProjectPluginView projectId={selectedProject} />
      ) : (
        <div className="empty">
          <div className="empty-art"><span>◉</span></div>
          <div className="empty-title">请先登记一个项目</div>
          <div>在「项目管理」页添加至少一个项目</div>
        </div>
      )}
    </div>
  );
}

function ProjectPluginView({ projectId }: { projectId: string }) {
  const local = useApiQuery<PluginEntry[]>(
    () => window.api.plugins.list({ projectId }),
    [projectId]
  );
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const search = useApiQuery<AssetLibSearchResult>(
    () => window.api.plugins.search({ keyword, page, pageSize: 12 }),
    [keyword, page]
  );
  const [installingId, setInstallingId] = useState<string | null>(null);

  const toggle = async (name: string) => {
    const res = await window.api.plugins.toggle({ projectId, pluginName: name });
    if (res.ok) {
      toast.success(`${res.data.enabled ? '启用' : '禁用'}了 ${name}`);
      local.refresh();
    } else {
      toast.error('切换失败: ' + res.error.detail);
    }
  };

  const install = async (item: AssetLibItem) => {
    setInstallingId(item.id);
    // 先获取 detail 以拿到 downloadUrl
    const detail = await window.api.plugins.detail({ id: item.id });
    if (!detail.ok) {
      toast.error('获取详情失败: ' + detail.error.detail);
      setInstallingId(null);
      return;
    }
    const res = await window.api.plugins.install({ projectId, item: detail.data });
    setInstallingId(null);
    if (res.ok) {
      toast.success(`已安装 ${item.title}`);
      local.refresh();
    } else {
      toast.error('安装失败: ' + res.error.detail);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <section>
        <h3 style={{ fontSize: 14, color: 'var(--gd-text-dim)', margin: '0 0 12px' }}>本地插件 (addons/)</h3>
        {local.loading ? (
          <div className="empty"><div className="spinner" /></div>
        ) : (local.data?.length ?? 0) === 0 ? (
          <div className="empty">
            <div className="empty-art"><span>◌</span></div>
            <div className="empty-title">该项目无插件</div>
            <div>从右侧 AssetLib 安装或自行放置到 addons/ 目录</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {local.data!.map((p) => (
              <div className="card" key={p.name} style={{ padding: 12 }}>
                <div className="card-title" style={{ fontSize: 14 }}>
                  <span>{p.displayName || p.name}</span>
                  <span className={`tag ${p.enabled ? 'tag-success' : 'tag-warning'}`}>
                    {p.enabled ? '启用' : '禁用'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginBottom: 8 }}>
                  v{p.version} · {p.author || '未知作者'}
                </div>
                {p.description && (
                  <div style={{ fontSize: 12, color: 'var(--gd-text-dim)', marginBottom: 8 }}>{p.description}</div>
                )}
                <button className="btn" onClick={() => toggle(p.name)}>
                  {p.enabled ? '禁用' : '启用'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 style={{ fontSize: 14, color: 'var(--gd-text-dim)', margin: '0 0 12px' }}>AssetLib 在线资源池</h3>
        <div className="toolbar">
          <input
            className="input"
            placeholder="搜索插件..."
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          />
        </div>
        {search.loading ? (
          <div className="empty"><div className="spinner" /></div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520, overflow: 'auto' }}>
              {(search.data?.items || []).map((it) => (
                <div className="card" key={it.id} style={{ padding: 12 }}>
                  <div className="card-title" style={{ fontSize: 14 }}>
                    <span>{it.title}</span>
                    {it.supportsMono && <span className="tag tag-primary">mono</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginBottom: 4 }}>
                    v{it.version} · {it.author}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gd-text-muted)', marginBottom: 6 }}>
                    Godot: {it.godotVersions.join(', ') || '未标注'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gd-text-dim)', marginBottom: 8, maxHeight: 40, overflow: 'hidden' }}>
                    {(it.description ?? '').slice(0, 120)}
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={installingId === it.id}
                    onClick={() => install(it)}
                  >
                    {installingId === it.id ? '安装中...' : '安装到项目'}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
              <span style={{ fontSize: 12, color: 'var(--gd-text-dim)' }}>第 {page} 页</span>
              <button className="btn" disabled={(search.data?.items.length ?? 0) < 12} onClick={() => setPage((p) => p + 1)}>下一页</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

