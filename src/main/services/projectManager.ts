import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ProjectEntry, ProjectMeta } from '../../shared/types/project';
import { getProjectsManifestPath } from '../utils/path';
import { readJsonSafe, writeJsonAtomic, injectSchemaVersion } from '../utils/migrate';
import { SCHEMA_VERSION } from '../../shared/constants/schema';

type StoredProject = ProjectEntry & { schemaVersion: number };

async function readManifest(): Promise<ProjectEntry[]> {
  const stored = await readJsonSafe<StoredProject[]>(getProjectsManifestPath());
  if (!stored) return [];
  return stored.map((p) => {
    const migrated = injectSchemaVersion(p, SCHEMA_VERSION);
    const { schemaVersion: _sv, ...rest } = migrated;
    return rest as ProjectEntry;
  });
}

async function writeManifest(list: ProjectEntry[]): Promise<void> {
  const payload: StoredProject[] = list.map((p) => ({ schemaVersion: SCHEMA_VERSION, ...p }));
  await writeJsonAtomic(getProjectsManifestPath(), payload);
}

/**
 * 极简 project.godot 解析器
 * 仅提取我们关心的字段,不追求完整 INI 解析
 */
export async function parseProjectGodot(projectPath: string): Promise<ProjectMeta> {
  const filePath = path.join(projectPath, 'project.godot');
  const text = await fs.readFile(filePath, 'utf-8');
  const lines = text.split(/\r?\n/);
  let section = '';
  const data: Record<string, Record<string, string>> = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    const sectionMatch = /^\[(.+)\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1];
      data[section] = data[section] || {};
      continue;
    }
    const kv = /^([^=]+)=(.*)$/.exec(line);
    if (kv && section) {
      const key = kv[1].trim();
      let value = kv[2].trim();
      // 去掉首尾引号
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      data[section][key] = value;
    }
  }
  const config = data['config'] || {};
  const app = data['application'] || {};
  const featuresRaw = config['features'] || '';
  // 去掉数组外层的 [ ] 和引号
  const features = featuresRaw
    .replace(/^[[^\]]+\]/g, '')
    .replace(/\[|\]|"|'/g, '')
    .split(/[ ,]+/)
    .filter(Boolean);
  return {
    configVersion: config['version'] || '',
    isMono: features.includes('mono') || features.includes('c#'),
    name: app['config/name'],
    mainScene: app['run/main_scene']
  };
}

function genId(): string {
  return crypto.randomUUID();
}

/** 列出已登记项目 */
export async function listProjects(): Promise<ProjectEntry[]> {
  return readManifest();
}

/** 添加项目(自动解析 project.godot) */
export async function addProject(projectPath: string): Promise<ProjectEntry> {
  const abs = path.resolve(projectPath);
  const projectFile = path.join(abs, 'project.godot');
  try {
    const stat = await fs.stat(projectFile);
    if (!stat.isFile()) throw new Error('project.godot 不是文件');
  } catch {
    throw new Error('未找到 project.godot,请选择项目根目录');
  }
  const meta = await parseProjectGodot(abs);
  const entry: ProjectEntry = {
    id: genId(),
    path: abs,
    name: meta.name || path.basename(abs),
    godotVersion: meta.configVersion,
    isMono: meta.isMono,
    addedAt: new Date().toISOString(),
    launchCount: 0
  };
  const list = await readManifest();
  // 重复 path 直接返回已有
  const dup = list.find((p) => p.path === abs);
  if (dup) return dup;
  await writeManifest([...list, entry]);
  return entry;
}

/** 移除项目 */
export async function removeProject(id: string): Promise<void> {
  const list = await readManifest();
  await writeManifest(list.filter((p) => p.id !== id));
}

/** 更新项目字段 */
export async function updateProject(id: string, patch: Partial<ProjectEntry>): Promise<ProjectEntry> {
  const list = await readManifest();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error('项目不存在');
  const updated = { ...list[idx], ...patch };
  const next = [...list];
  next[idx] = updated;
  await writeManifest(next);
  return updated;
}

/** 标记项目最近启动 */
export async function markLaunched(id: string): Promise<void> {
  const list = await readManifest();
  const target = list.find((p) => p.id === id);
  if (!target) return;
  target.lastOpenedAt = new Date().toISOString();
  target.launchCount = (target.launchCount || 0) + 1;
  await writeManifest(list);
}

/** 在资源管理器中打开项目根目录 */
export function recommendVersion(meta: ProjectMeta): string | undefined {
  const m = /^(\d+\.\d+)/.exec(meta.configVersion || '');
  return m ? m[1] : undefined;
}

export async function revealInExplorer(projectPath: string): Promise<void> {
  const target = path.resolve(projectPath);
  // Windows 用 explorer.exe;其他平台 spawn 平台命令即可(占位)
  const cmd = process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
  spawn(cmd, [target], { detached: true, stdio: 'ignore' }).unref();
}

