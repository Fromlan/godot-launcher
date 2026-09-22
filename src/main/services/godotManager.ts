import { promises as fs } from 'node:fs';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fetch } from 'undici';
import { unzip } from '../utils/unzip';
import { readJsonSafe, writeJsonAtomic, injectSchemaVersion } from '../utils/migrate';
import { SCHEMA_VERSION } from '../../shared/constants/schema';
import { sortReleases } from './godotReleaseSource';
import { GODOT_DEFAULT_ARGS, GODOT_EXE_NAMES } from '../../shared/constants/godot';
import type { GodotVersion, ReleaseInfo, DownloadProgress } from '../../shared/types/godot';
import type { ProjectEntry, LaunchOptions } from '../../shared/types/project';
import {
  ensureDir,
  getVersionsDir,
  getVersionsManifestPath,
  getLogsDir,
  getUserDataDir,
  makeVersionId,
  dirSize
} from '../utils/path';
import { createLogger } from '../utils/logger';

const log = createLogger('godot-manager');

type ProgressCallback = (progress: DownloadProgress) => void;
type StoredVersion = GodotVersion & { schemaVersion: number };

async function readManifest(): Promise<GodotVersion[]> {
  const stored = await readJsonSafe<StoredVersion[]>(getVersionsManifestPath());
  if (!stored) return [];
  return stored.map((v) => {
    const migrated = injectSchemaVersion(v, SCHEMA_VERSION);
    const { schemaVersion: _sv, ...rest } = migrated;
    return rest as GodotVersion;
  });
}

async function writeManifest(versions: GodotVersion[]): Promise<void> {
  await ensureDir(getUserDataDir());
  const payload: StoredVersion[] = versions.map((v) => ({ schemaVersion: SCHEMA_VERSION, ...v }));
  await writeJsonAtomic(getVersionsManifestPath(), payload);
}

/** 定位 Godot 可执行文件;兼容老版本命名 */
export function resolveExecutable(installPath: string, channel: 'stable' | 'mono'): string | null {
  const list = channel === 'mono'
    ? ['Godot_v4_mono.exe', 'Godot_mono.exe', GODOT_EXE_NAMES.win64, 'Godot.exe']
    : [GODOT_EXE_NAMES.win64, 'Godot.exe'];
  for (const name of list) {
    const candidate = path.join(installPath, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** 列出已安装版本 */
export async function listInstalled(): Promise<GodotVersion[]> {
  const manifest = await readManifest();
  const live: GodotVersion[] = [];
  for (const v of manifest) {
    try {
      const stat = await fs.stat(v.installPath);
      if (!stat.isDirectory()) continue;
      let exe: string | null = null;
      if (v.executablePath) {
        try { await fs.access(v.executablePath); exe = v.executablePath; } catch {}
      }
      if (!exe) exe = resolveExecutable(v.installPath, v.channel);
      if (!exe) continue;
      const size = await dirSize(v.installPath);
      live.push({ ...v, executablePath: exe, sizeBytes: size });
    } catch {
      // 目录不存在,跳过
    }
  }
  if (live.length !== manifest.length) await writeManifest(live);
  return sortInstalled(live);
}

interface DownloadArgs {
  tag: string;
  channel: 'stable' | 'mono';
  release: ReleaseInfo;
  onProgress?: ProgressCallback;
}

/** 下载并安装一个 Godot 版本 */
export async function downloadAndInstall(args: DownloadArgs): Promise<GodotVersion> {
  const { tag, channel, release, onProgress } = args;
  const versionId = makeVersionId(tag, channel, 'win64');
  const installPath = path.join(getVersionsDir(), versionId);
  const tmpZip = path.join(getVersionsDir(), `${versionId}.zip.part`);

  // 已存在则直接返回
  const existing = await listInstalled();
  const found = existing.find((v) => v.id === versionId);
  if (found) {
    onProgress?.({ tag, channel, platform: 'win64', receivedBytes: found.sizeBytes, totalBytes: found.sizeBytes, percent: 100, phase: 'done' });
    return found;
  }

  await ensureDir(getVersionsDir());
  await ensureDir(path.dirname(tmpZip));

  // 下载前清理残留 .zip.part(防止上次中断留下)
  try { await fs.unlink(tmpZip); } catch { /* ignore */ }

  const emit = (p: Partial<DownloadProgress> & Pick<DownloadProgress, 'phase'>) => {
    onProgress?.({
      tag,
      channel,
      platform: 'win64',
      receivedBytes: p.receivedBytes ?? 0,
      totalBytes: p.totalBytes ?? release.sizeBytes,
      percent: p.percent ?? 0,
      phase: p.phase,
      message: p.message
    });
  };

  // 下载
  emit({ phase: 'downloading', percent: 0 });
  const res = await fetch(release.downloadUrl, { headers: { 'User-Agent': 'godot-launcher' } });
  if (!res.ok || !res.body) throw new Error(`download failed ${res.status}`);
  const total = Number(res.headers.get('content-length') || release.sizeBytes) || release.sizeBytes;
  let received = 0;
  const fileHandle = await fs.open(tmpZip, 'w');
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Buffer>) {
      await fileHandle.write(chunk);
      received += chunk.length;
      const percent = total > 0 ? Math.min(99, Math.floor((received / total) * 100)) : 0;
      emit({ phase: 'downloading', receivedBytes: received, totalBytes: total, percent });
    }
  } finally {
    await fileHandle.close();
  }

  // 解压
  emit({ phase: 'extracting', percent: 100 });
  await unzip(tmpZip, installPath, { stripTopLevel: true });
  // 删除临时 zip
  try { await fs.unlink(tmpZip); } catch { /* ignore */ }

  // 定位 exe
  const exe = resolveExecutable(installPath, channel);
  if (!exe) throw new Error('解压完成但未找到 Godot .exe,请检查 zip 内容');

  // 写 manifest
  const version: GodotVersion = {
    id: versionId,
    tag,
    label: release.label || tag,
    channel,
    platform: 'win64',
    installPath,
    executablePath: exe,
    sizeBytes: await dirSize(installPath),
    installedAt: new Date().toISOString()
  };
  const next2 = [...existing, version];
  await writeManifest(next2);
  emit({ phase: 'done', percent: 100, receivedBytes: version.sizeBytes, totalBytes: version.sizeBytes });
  return version;
}

interface ImportExistingArgs {
  executablePath: string;
}

/** 从文件名 / 父目录名解析 tag 和 channel */
function parseFromFolderName(name: string): { tag: string; channel: 'stable' | 'mono' } | null {
  const lower = name.toLowerCase();
  const channel: 'stable' | 'mono' = lower.includes('mono') ? 'mono' : 'stable';
  const m = /godot[_-]?v?(\d+\.\d+(?:\.\d+)?)(?:[-_]([a-z0-9]+))?/i.exec(name);
  if (!m) return null;
  const ver = m[1];
  const suffix = m[2] || '';
  const tag = suffix ? ver + '-' + suffix : ver;
  return { tag, channel };
}

/** 导入本地已存在的 Godot 编辑器(不下载) */
export async function importExisting(args: ImportExistingArgs): Promise<GodotVersion> {
  const exe = path.resolve(args.executablePath);
  const stat = await fs.stat(exe).catch(() => null);
  if (!stat || !stat.isFile()) throw new Error('不是有效的文件: ' + exe);
  if (path.extname(exe).toLowerCase() !== '.exe') throw new Error('请选择 Godot .exe 文件');

  const fileName = path.basename(exe);
  const parentDir = path.dirname(exe);
  const parentName = path.basename(parentDir);

  let inferred = parseFromFolderName(parentName);
  if (!inferred) inferred = parseFromFolderName(fileName);
  if (!inferred) {
    inferred = { tag: parentName.replace(/^Godot[_-]?v?/i, '') || parentName, channel: fileName.toLowerCase().includes('mono') ? 'mono' : 'stable' };
  }

  const id = makeVersionId(inferred.tag, inferred.channel, 'win64');
  const label = inferred.tag;

  const manifest = await readManifest();
  const existed = manifest.find((v) => v.id === id);
  if (existed) {
    const refreshed = { ...existed, installPath: parentDir, executablePath: exe };
    const next = manifest.map((v) => (v.id === id ? refreshed : v));
    await writeManifest(next);
    return refreshed;
  }

  const version: GodotVersion = {
    id,
    tag: inferred.tag,
    label,
    channel: inferred.channel,
    platform: 'win64',
    installPath: parentDir,
    executablePath: exe,
    sizeBytes: await dirSize(parentDir),
    installedAt: new Date().toISOString()
  };
  await writeManifest([...manifest, version]);
  return version;
}

/** 删除已安装版本(含 .zip / .zip.part 残留清理) */
export async function removeVersion(versionId: string): Promise<void> {
  const manifest = await readManifest();
  const target = manifest.find((v) => v.id === versionId);
  if (!target) return;
  // 1. 删除解压目录
  await fs.rm(target.installPath, { recursive: true, force: true });
  // 2. 清理可能的 .zip / .zip.part 残留(理论上 .part 已被下载流程清理,但兜底)
  const versionsDir = getVersionsDir();
  for (const suffix of ['', '.zip', '.zip.part']) {
    try {
      await fs.unlink(path.join(versionsDir, versionId + suffix));
    } catch { /* ignore */ }
  }
  // 3. 从 manifest 移除
  await writeManifest(manifest.filter((v) => v.id !== versionId));
}

interface LaunchContext {
  version?: GodotVersion;
  project: ProjectEntry;
  options: LaunchOptions;
}

/** 启动 Godot 打开项目 */
export async function launchProject(ctx: LaunchContext): Promise<{ logFile: string; pid: number | null }> {
  const { version, project, options } = ctx;
  if (!version) throw new Error('未指定 Godot 版本');
  const args = [...GODOT_DEFAULT_ARGS];
  args.push('--path', project.path);
  const extras = options.extraArgs ?? [];
  for (const a of extras) {
    if (a.trim()) args.push(a);
  }
  log.info('spawn godot', version.executablePath, args);

  await ensureDir(getLogsDir());
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(getLogsDir(), `${project.id}-${ts}.log`);

  const child = spawn(version.executablePath, args, {
    detached: options.detached ?? true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false
  });

  const writeStream = (await fs.open(logFile, 'w')).createWriteStream();
  let streamEnded = false;
  const safeEnd = () => {
    if (streamEnded) return;
    streamEnded = true;
    writeStream.end();
  };
  writeStream.on('error', (err) => log.warn('launchProject writeStream error', err));
  child.on('exit', (code) => {
    writeStream.write(`\n[exit code=${code ?? 'null'}]\n`, safeEnd);
  });
  if (options.detached) child.unref();

  return { logFile, pid: child.pid ?? null };
}

/** 对已安装版本按版本号降序排序(stable 优先于 mono) */
export function sortInstalled(list: GodotVersion[]): GodotVersion[] {
  const asReleases = list.map((v) => ({
    tag: v.tag,
    label: v.label,
    channel: v.channel,
    platform: v.platform,
    downloadUrl: '',
    sizeBytes: v.sizeBytes,
    prerelease: false,
    publishedAt: v.installedAt
  }));
  const sorted = sortReleases(asReleases);
  const map = new Map(list.map((v) => [v.tag + '|' + v.channel + '|' + v.platform, v]));
  return sorted
    .map((r) => map.get(r.tag + '|' + r.channel + '|' + r.platform))
    .filter((v): v is GodotVersion => !!v);
}
