import React, { useState } from 'react';
import type { ProjectEntry } from '../../shared/types/project';
import type { GodotVersion } from '../../shared/types/godot';
import { useApiQuery } from '../hooks/useApi';
import { toast } from '../stores/toastStore';
import Modal from '../components/Modal';

export default function Projects() {
  const projects = useApiQuery<ProjectEntry[]>(() => window.api.projects.list(), []);
  const versions = useApiQuery<GodotVersion[]>(() => window.api.versions.list(), []);
  const settings = useApiQuery(() => window.api.system.getSettings(), []);
  const [addOpen, setAddOpen] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectEntry | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);

  const versionMap: Record<string, GodotVersion> = {};
  (versions.data || []).forEach((v) => (versionMap[v.id] = v));

  const handleAdd = async () => {
    if (!pathInput.trim()) {
      toast.warning('请填写项目路径');
      return;
    }
    setAdding(true);
    const res = await window.api.projects.add({ path: pathInput.trim() });
    setAdding(false);
    if (res.ok) {
      toast.success('已添加项目: ' + res.data.name);
      setAddOpen(false);
      setPathInput('');
      projects.refresh();
    } else {
      toast.error('添加失败: ' + res.error.detail);
    }
  };

  const launch = async (id: string) => {
    const res = await window.api.projects.launch({ id });
    if (res.ok) {
      toast.success('已启动 (pid=' + (res.data.pid ?? '?') + ')');
      projects.refresh();
    } else {
      toast.error('启动失败: ' + res.error.detail);
    }
  };

  const reveal = async (id: string) => {
    await window.api.projects.reveal({ id });
  };

  const remove = async (id: string) => {
    const res = await window.api.projects.remove({ id });
    if (res.ok) {
      toast.success('已移除项目');
      projects.refresh();
    } else {
      toast.error('移除失败: ' + res.error.detail);
    }
  };

  const openRename = (p: ProjectEntry) => {
    setRenameTarget(p);
    setRenameName(p.name);
  };

  const closeRename = () => {
    setRenameTarget(null);
    setRenameName('');
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const newName = renameName.trim();
    if (!newName) {
      toast.warning('名称不能为空');
      return;
    }
    if (newName === renameTarget.name) {
      closeRename();
      return;
    }
    setRenaming(true);
    const res = await window.api.projects.update({ id: renameTarget.id, patch: { name: newName } });
    setRenaming(false);
    if (res.ok) {
      toast.success('已重命名为 ' + res.data.name);
      projects.refresh();
      closeRename();
    } else {
      toast.error('重命名失败: ' + res.error.detail);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workspace</div>
          <div className="page-title">项目管理</div>
          <div className="page-subtitle">登记 Godot 项目并一键启动</div>
        </div>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}>+ 添加项目</button>
      </div>

      {projects.loading ? (
        <div className="empty"><div className="spinner" /></div>
      ) : (projects.data?.length ?? 0) === 0 ? (
        <div className="empty">
          <div className="empty-art"><span>▣</span></div>
          <div className="empty-title">尚未登记任何项目</div>
          <div>点击右上角按钮,填入包含 project.godot 的目录即可</div>
        </div>
      ) : (
        <div className="card-grid">
          {projects.data!.map((p) => (
            <div className="card" key={p.id}>
              <div className="card-title">
                <span>{p.name}</span>
                {p.isMono && <span className="tag tag-primary">mono</span>}
                {p.godotVersion && <span className="tag">Godot {p.godotVersion}</span>}
              </div>
              <div className="card-subtitle">{p.path}</div>
              <div className="card-meta">
                {p.lastOpenedAt ? (
                  <span>最近启动: {new Date(p.lastOpenedAt).toLocaleString()}</span>
                ) : (
                  <span style={{ color: 'var(--gd-text-muted)' }}>尚未启动</span>
                )}
                <span>启动 {p.launchCount} 次</span>
              </div>
              <div className="card-actions">
                <button className="btn btn-primary" onClick={() => launch(p.id)}>运行</button>
                <button className="btn" onClick={() => reveal(p.id)}>打开目录</button>
                <button className="btn" onClick={() => openRename(p)}>重命名</button>
                <button className="btn btn-danger" onClick={() => remove(p.id)}>移除</button>
              </div>
              {!settings.data?.defaultVersionId && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--gd-warning)' }}>
                  未设置默认 Godot 版本
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={addOpen}
        title="添加项目"
        onClose={() => setAddOpen(false)}
        onConfirm={handleAdd}
        confirmLabel={adding ? '添加中...' : '添加'}
      >
        <div className="form-row">
          <label className="form-label">项目根目录(包含 project.godot)</label>
          <input
            className="input"
            placeholder="D:\projects\my-game"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
          />
          <div className="form-hint">支持相对路径与 Windows 长路径</div>
        </div>
      </Modal>

      <Modal
        open={!!renameTarget}
        title="重命名项目"
        onClose={closeRename}
        onConfirm={confirmRename}
        confirmLabel={renaming ? '保存中...' : '保存'}
      >
        <div className="form-row">
          <label className="form-label">项目显示名</label>
          <input
            className="input"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !renaming) {
                e.preventDefault();
                void confirmRename();
              }
            }}
          />
          <div className="form-hint">仅修改显示名,不影响磁盘路径与 project.godot</div>
        </div>
      </Modal>
    </div>
  );
}