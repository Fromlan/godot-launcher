import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ProjectEntry, ProjectMeta } from '../../shared/types/project';
import { getProjectsManifestPath, ensureDir, getUserDataDir } from '../utils/path';
import { createLogger } from '../utils/logger';

const log = createLogger('project-manager');

async function readManifest(): Promise<ProjectEntry[]> {
  try {
    const buf = await fs.readFile(getProjectsManifestPath(), 'utf-8');
    return JSON.parse(buf) as ProjectEntry[];
  } catch {
    return [];
  }
}

async function writeManifest(list: ProjectEntry[]): Promise<void> {
  await ensureDir(getUserDataDir());
  await fs.writeFile(getProjectsManifestPath(), JSON.stringify(list, null, 2), 'utf-8');
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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        value = value.slice(1, -1);
      }
      data[section][key] = value;
    }
  }
  const config = data['config'] || {};
  const app = data['application'] || {};
  const featuresRaw = config['features'] || '';
  const features = featuresRaw.replace(/^[\["']|[\]"]/g, '').split(/[ ,]+/).filter(Boolean);
  return {
    configVersion: config['version'] || '',
    isMono: features.includes('mono') || features.includes('c#'),
    name: app['config/name'],
    mainScene: app['run/main_scene']
  };
}

/** 推荐 Godot 版本:返回 configVersion 字符串(如 4.6);调用方与已安装清单匹配 */
export function recommendVersion(meta: ProjectMeta): string | undefined {
  if (!meta.configVersion) return undefined;
  const m = /(\d+\.\d+)/.exec(meta.configVersion);
  return m ? m[1] : undefined;
}

export async function addProject(projectPath: string): Promise<ProjectEntry> {
  const abs = path.resolve(projectPath);
  const exists = await fs.stat(abs).then((s) => s.isDirectory()).catch(() => false);
  if (!exists) throw new Error(`目录不存在: ${abs}`);
  const pg = path.join(abs, 'project.godot');
  try {
    await fs.access(pg);
  } catch {
    throw new Error(`该目录不含 project.godot: ${abs}`);
  }
  const meta = await parseProjectGodot(abs);
  const list = await readManifest();
  if (list.some((p) => path.resolve(p.path) === abs)) {
    throw new Error('该项目已存在');
  }
  const entry: ProjectEntry = {
    id: crypto.randomUUID(),
    path: abs,
    name: meta.name || path.basename(abs),
    godotVersion: meta.configVersion,
    isMono: meta.isMono,
    addedAt: new Date().toISOString(),
    launchCount: 0
  };
  list.push(entry);
  await writeManifest(list);
  return entry;
}

export async function removeProject(id: string): Promise<void> {
  const list = await readManifest();
  await writeManifest(list.filter((p) => p.id !== id));
}

export async function updateProject(id: string, patch: Partial<ProjectEntry>): Promise<ProjectEntry> {
  const list = await readManifest();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error('项目不存在');
  list[idx] = { ...list[idx], ...patch, id: list[idx].id };
  await writeManifest(list);
  return list[idx];
}

export async function listProjects(): Promise<ProjectEntry[]> {
  const list = await readManifest();
  // 重新读取每个项目的 project.godot,同步最新元数据(轻量)
  const enriched: ProjectEntry[] = [];
  for (const p of list) {
    try {
      const meta = await parseProjectGodot(p.path);
      enriched.push({
        ...p,
        name: meta.name || p.name,
        godotVersion: meta.configVersion,
        isMono: meta.isMono
      });
    } catch {
      enriched.push(p);
    }
  }
  return enriched;
}

export async function markLaunched(id: string): Promise<void> {
  const list = await readManifest();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], lastOpenedAt: new Date().toISOString(), launchCount: (list[idx].launchCount || 0) + 1 };
  await writeManifest(list);
}

/** 在文件管理器中显示项目 */
export async function revealInExplorer(p: string): Promise<void> {
  log.info('reveal', p);
  spawn('explorer.exe', [p], { detached: true, stdio: 'ignore' }).unref();
}
