import React, { useEffect, useMemo, useState } from 'react';
import type { ProjectEntry } from '../../shared/types/project';
import {
  ASSET_TYPE_LABEL,
  FEATURED_TAGS,
  type AssetLibSearchResult,
  type AssetLibItem,
  type AssetTag
} from '../../shared/types/plugin';
import { useApiQuery } from '../hooks/useApi';
import { toast } from '../stores/toastStore';
import Icon from '../components/Icon';

const TAG_LABELS: Record<string, string> = {
  '2d': '2D',
  '3d': '3D',
  audio: '音频',
  template: '模板',
  vfx: '特效'
};

const FALLBACK_THUMB =
  'https://store.godotengine.org/static/images/share-image.webp';

function formatShortDate(iso: string): string {
  if (!iso) return '';
  return iso.replace(/-/g, '.').slice(0, 10);
}

function chipsFor(item: AssetLibItem, max: number = 5): AssetTag[] {
  return item.tags.slice(0, max);
}

function itemKey(it: AssetLibItem): string {
  return it.publisherSlug + '/' + it.assetSlug;
}

function openExternal(url: string): void {
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    /* ignore */
  }
}

function StatusDot({ score }: { score: number }): React.ReactElement {
  const s = Math.max(0, Math.min(100, score));
  const color = s >= 30 ? 'var(--gd-success)' : s >= 10 ? 'var(--gd-warning)' : 'var(--gd-text-muted)';
  return (
    <span style={{ color }} title={'社区评分 ' + s}>
      ★ {s}
    </span>
  );
}

export default function Plugins() {
  const projects = useApiQuery<ProjectEntry[]>(() => window.api.projects.list(), []);
  const [selectedProject, setSelectedProject] = useState<string>('');
  useEffect(() => {
    if (!selectedProject && projects.data && projects.data.length > 0) {
      setSelectedProject(projects.data[0].id);
    }
  }, [projects.data, selectedProject]);
  return (
    <div className="plugins-shell">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Toolchain</div>
          <div className="page-title">插件管理</div>
          <div className="page-subtitle">本地启用/禁用 · Godot Asset Store 资源池</div>
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
          <div className="empty-art">
            <Icon name="folder" />
          </div>
          <div className="empty-title">请先登记一个项目</div>
          <div>在「项目管理」页添加至少一个项目</div>
        </div>
      )}
    </div>
  );
}

function ProjectPluginView({ projectId }: { projectId: string }) {
  const local = useApiQuery<Array<any>>(
    () => window.api.plugins.list({ projectId }),
    [projectId]
  );
  const projects = useApiQuery<ProjectEntry[]>(() => window.api.projects.list(), []);
  const project = projects.data?.find((p) => p.id === projectId);
  const projectGodotVersion = project?.godotVersion;

  const [keyword, setKeyword] = useState('');
  const [activeTag, setActiveTag] = useState<string | undefined>(undefined);
  const [includeUnpublished, setIncludeUnpublished] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [sort, setSort] = useState<'relevance' | 'updated' | 'rating'>('updated');

  const queryDeps = useMemo(
    () => [projectId, keyword, activeTag, includeUnpublished, sort, projectGodotVersion, page] as const,
    [projectId, keyword, activeTag, includeUnpublished, sort, projectGodotVersion, page]
  );

  const search = useApiQuery<AssetLibSearchResult>(
    () =>
      // 新 store 的 tags= filter 权重低;把 activeTag 当 keyword fallback 一起传。
      window.api.plugins.search({
        keyword: [keyword, activeTag].filter(Boolean).join(' ').trim(),
        page,
        pageSize,
        tag: activeTag,
        godotVersion: projectGodotVersion,
        sort,
        requireRelease: !includeUnpublished
      }),
    Array.from(queryDeps)
  );
  const [installingKey, setInstallingKey] = useState<string | null>(null);

  const toggle = async (name: string) => {
    const res = await window.api.plugins.toggle({ projectId, pluginName: name });
    if (res.ok) {
      toast.success((res.data.enabled ? '启用' : '禁用') + '了 ' + name);
      local.refresh();
    } else {
      toast.error('切换失败: ' + res.error.detail);
    }
  };

  const install = async (item: AssetLibItem) => {
    const key = itemKey(item);
    setInstallingKey(key);
    const res = await window.api.plugins.install({ projectId, item });
    setInstallingKey(null);
    if (res.ok) {
      toast.success('已安装 ' + item.name);
      local.refresh();
    } else {
      toast.error('安装失败: ' + (res.error.detail || res.error.code || '未知错误'));
    }
  };

  const emptyResults =
    !search.loading && (search.data?.items.length ?? 0) === 0 && (keyword || activeTag);
  const hasResults = !search.loading && !search.error && (search.data?.items.length ?? 0) > 0;
  const localCount = local.data?.length ?? 0;

  return (
    <div className="plugin-layout" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: 24, alignItems: 'stretch' }}>
      <LocalColumn
        local={local}
        localCount={localCount}
        projectGodotVersion={projectGodotVersion}
        onToggle={toggle}
      />

      <section className="plugin-col plugin-col-store" style={{ flex: "1 1 auto", minWidth: 0 }}>
        <header className="plugin-col-header">
          <h3 className="plugin-col-title">Asset Store 资源池</h3>
          <span className="plugin-col-meta">
            {search.data?.total ? search.data.total + ' 条' : '—'}
            {projectGodotVersion ? ' · 已按 Godot ' + projectGodotVersion + ' 兼容' : ''}
          </span>
        </header>

        <div className="plugin-store-toolbar">
          <div className="plugin-tag-row">
            <button
              className={'tag ' + (activeTag === undefined ? 'tag-primary' : '')}
              onClick={() => { setActiveTag(undefined); setPage(1); }}
              style={{ cursor: 'pointer', border: 'none' }}
            >
              全部
            </button>
            {FEATURED_TAGS.map((slug) => (
              <button
                key={slug}
                className={'tag ' + (activeTag === slug ? 'tag-primary' : '')}
                onClick={() => { setActiveTag(slug); setPage(1); }}
                style={{ cursor: 'pointer', border: 'none' }}
              >
                {TAG_LABELS[slug] || slug}
              </button>
            ))}
          </div>
          <div className="plugin-search-row">
            <input
              className="input"
              placeholder="搜索资源..."
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
            />
            <select
              className="select"
              value={sort}
              onChange={(e) => { setSort(e.target.value as any); setPage(1); }}
              style={{ width: 130, flexShrink: 0 }}
              title="排序"
            >
              <option value="relevance">相关度</option>
              <option value="updated">最新发布</option>
              <option value="rating">高评分</option>
            </select>
            <label className="plugin-check" title="含尚未发布 release 的 demo 资源">
              <input
                type="checkbox"
                checked={includeUnpublished}
                onChange={(e) => { setIncludeUnpublished(e.target.checked); setPage(1); }}
              />
              含未发布
            </label>
          </div>
        </div>

        <div className="plugin-store-list">
          {search.loading ? (
            <div className="empty">
              <div className="spinner" />
            </div>
          ) : search.error ? (
            <div className="empty plugin-store-error">
              <div className="empty-art">
                <Icon name="lightning" className="icon-warning" />
              </div>
              <div className="empty-title">搜索失败</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>{search.error}</div>
              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => search.refresh()}>重试</button>
              </div>
            </div>
          ) : emptyResults ? (
            <div className="empty">
              <div className="empty-art">
                <Icon name="cog" />
              </div>
              <div className="empty-title">没有匹配的资源</div>
              <div>试着清空搜索词或切换 5 个分类;或勾选「含未发布」</div>
            </div>
          ) : (
            <>
              <div className="asset-list">
                {(search.data?.items || []).map((it) => (
                  <AssetCard
                    key={itemKey(it)}
                    item={it}
                    installing={installingKey === itemKey(it)}
                    onInstall={install}
                  />
                ))}
              </div>
              <div className="plugin-pagination">
                <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  上一页
                </button>
                <span className="plugin-pagination-info">
                  第 <strong>{page}</strong> 页 · 共 {search.data?.total ?? '—'} 条
                </span>
                <button
                  className="btn"
                  disabled={(search.data?.items.length ?? 0) < pageSize}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

interface LocalColumnProps {
  local: ReturnType<typeof useApiQuery<any>>;
  localCount: number;
  projectGodotVersion?: string;
  onToggle: (name: string) => Promise<void>;
}
function LocalColumn({ local, localCount, projectGodotVersion, onToggle }: LocalColumnProps) {
  const enabledCount = (local.data || []).filter((p: any) => p.enabled).length;
  return (
    <section className="plugin-col plugin-col-local" style={{ flex: "0 1 320px", minWidth: 280, maxWidth: 420 }}>
      <header className="plugin-col-header">
        <h3 className="plugin-col-title">本地插件</h3>
        <span className="plugin-col-meta">
          {localCount} 个 · 启用 {enabledCount}
          {projectGodotVersion ? ' · Godot ' + projectGodotVersion : ''}
        </span>
      </header>
      {local.loading ? (
        <div className="empty">
          <div className="spinner" />
        </div>
      ) : localCount === 0 ? (
        <div className="empty">
          <div className="empty-art">
            <Icon name="cog" />
          </div>
          <div className="empty-title">该项目无插件</div>
          <div>从右侧 AssetLib 安装,或手动把 addons/ 复制进项目根目录</div>
        </div>
      ) : (
        <div className="local-list">
          {(local.data || []).map((p: any) => (
            <article key={p.name} className={'local-card ' + (p.enabled ? 'is-on' : 'is-off')}>
              <header className="local-card-head">
                <h4 className="local-card-title">{p.displayName || p.name}</h4>
                <span className={'tag ' + (p.enabled ? 'tag-success' : 'tag-warning')}>
                  {p.enabled ? '启用' : '禁用'}
                </span>
              </header>
              <div className="local-card-meta">
                <span className="mono">v{p.version || '0.0.0'}</span>
                {p.author && <span>· {p.author}</span>}
              </div>
              {p.description && (
                <p className="local-card-desc">{p.description}</p>
              )}
              <footer className="local-card-foot">
                <code className="local-card-path" title={p.path}>{p.path}</code>
                <button className="btn btn-ghost" onClick={() => onToggle(p.name)}>
                  {p.enabled ? '禁用' : '启用'}
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AssetCard({
  item,
  installing,
  onInstall
}: {
  item: AssetLibItem;
  installing: boolean;
  onInstall: (item: AssetLibItem) => void | Promise<void>;
}): React.ReactElement {
  const typeClass = item.type === 1 ? 'tag-warning' : 'tag';
  const typeLabel = ASSET_TYPE_LABEL[item.type] || '其他';
  return (
    <article className="asset-card">
      <div className="asset-thumb-wrap">
        <img
          className="asset-thumb"
          src={item.thumbnailUrl || FALLBACK_THUMB}
          alt={item.name}
          loading="lazy"
          onError={(e) => {
            const t = e.target as HTMLImageElement;
            if (t.src !== FALLBACK_THUMB) t.src = FALLBACK_THUMB;
          }}
        />
        {item.featured && <span className="asset-thumb-badge tag tag-success">精选</span>}
      </div>
      <div className="asset-body">
        <div className="asset-head">
          <h4 className="asset-title" title={item.name}>{item.name}</h4>
          <div className="asset-head-meta">
            {item.supportsMono && <span className="tag tag-primary">mono</span>}
            <span className={'tag ' + typeClass}>{typeLabel}</span>
          </div>
        </div>
        <div className="asset-meta">
          <span className="asset-publisher" title={item.publisherName}>
            {item.publisherName || '未知作者'}
          </span>
          {item.license.type && <span className="asset-license">{item.license.type}</span>}
          <StatusDot score={item.reviewsScore} />
          {item.lastUpdated && <span className="asset-date">{formatShortDate(item.lastUpdated)}</span>}
        </div>
        {chipsFor(item).length > 0 && (
          <div className="asset-tags">
            {chipsFor(item).map((t) => (
              <span
                key={t.slug}
                className={'tag ' + (t.featured ? 'tag-primary' : '')}
                title={t.slug}
              >
                {t.displayName}
              </span>
            ))}
          </div>
        )}
        {item.description && (
          <p className="asset-desc">
            {item.description.length > 220 ? item.description.slice(0, 220) + '…' : item.description}
          </p>
        )}
        <div className="asset-actions">
          <button
            className="btn btn-primary"
            disabled={installing}
            onClick={() => onInstall(item)}
          >
            {installing ? '安装中…' : '安装到项目'}
          </button>
          {item.sourceUrl && (
            <button
              className="btn"
              onClick={() => openExternal(item.sourceUrl!)}
              title="查看源码仓库"
            >
              源码
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => openExternal(item.storeUrl)}
            title="在新标签打开商店页"
          >
            商店页 ↗
          </button>
        </div>
      </div>
    </article>
  );
}
