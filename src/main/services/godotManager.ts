import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fetch } from 'undici';
import { GODOT_DEFAULT_ARGS, GODOT_EXE_NAMES } from '../../shared/constants/godot';
import { sortReleases } from './godotReleaseSource';
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
import { unzip } from '../utils/unzip';
import { createLogger } from '../utils/logger';

const log = createLogger('godot-manager');

type ProgressCallback = (progress: DownloadProgress) => void;

async function readManifest(): Promise<GodotVersion[]> {
  try {
    const buf = await fs.readFile(getVersionsManifestPath(), 'utf-8');
    return JSON.parse(buf) as GodotVersion[];
  } catch {
    return [];
  }
}

async function writeManifest(versions: GodotVersion[]): Promise<void> {
  await ensureDir(getUserDataDir());
  await fs.writeFile(getVersionsManifestPath(), JSON.stringify(versions, null, 2), 'utf-8');
}

/**
 * 在解压目录中定位 Godot 可执行文件
 * - mono:文件名包含 _mono
 * - 否则 Godot_v4.exe / Godot.exe
 */
export function resolveExecutable(installPath: string, channel: 'stable' | 'mono'): string | null {
  // 简化版:实际上我们解压得到的是单一顶层目录,installPath 即顶层目录
  const exeCandidates = channel === 'mono' ? ['Godot_v4_mono.exe', 'Godot_mono.exe'] : [GODOT_EXE_NAMES.win64, 'Godot.exe'];
  // 注意:Godot 4.x 实际文件名通常是 Godot_v4.exe(无 _mono 后缀,区别在内容)
  // 我们以 channel 为准:稳定版找 Godot_v4.exe,mono 版也找 Godot_v4.exe(因 Godot 官方 4 mono 命名相同)
  // 为兼容老版本,仍优先尝试 mono 后缀
  const list = channel === 'mono' ? ['Godot_v4_mono.exe', 'Godot_mono.exe', GODOT_EXE_NAMES.win64, 'Godot.exe'] : [GODOT_EXE_NAMES.win64, 'Godot.exe'];
  for (const name of list) {
    const candidate = path.join(installPath, name);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('node:fs').accessSync(candidate);
      return candidate;
    } catch {
      // 继续
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void exeCandidates;
  return null;
}

/** 列出已安装版本 */
export async function listInstalled(): Promise<GodotVersion[]> {
  const manifest = await readManifest();
  // 重新计算每个版本的 sizeBytes 与 executablePath,以反映磁盘真实状态
  const live: GodotVersion[] = [];
  for (const v of manifest) {
    try {
      const stat = await fs.stat(v.installPath);
      if (!stat.isDirectory()) continue;
      // 优先使用 manifest 里记录的 executablePath(用户可能选了非标准名 exe)
      let exe: string | null = null;
      if (v.executablePath) {
        try { await fs.access(v.executablePath); exe = v.executablePath; } catch {}
      }
      // fallback:按 channel 推断标准文件名
      if (!exe) exe = resolveExecutable(v.installPath, v.channel);
      if (!exe) continue;
      const size = await dirSize(v.installPath);
      live.push({ ...v, executablePath: exe, sizeBytes: size });
    } catch {
      // 目录不存在,跳过
    }
  }
  if (live.length !== manifest.length) await writeManifest(live);
  // 按版本号降序,缓存与运行时一致
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

  // 若已存在则直接返回
  const existing = await listInstalled();
  const found = existing.find((v) => v.id === versionId);
  if (found) {
    onProgress?.({ tag, channel, platform: 'win64', receivedBytes: found.sizeBytes, totalBytes: found.sizeBytes, percent: 100, phase: 'done' });
    return found;
  }

  await ensureDir(getVersionsDir());
  const tmpZip = path.join(getVersionsDir(), `${versionId}.zip.part`);
  await ensureDir(path.dirname(tmpZip));

  // 下载
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
  emit({ phase: 'downloading', percent: 0 });

  const res = await fetch(release.downloadUrl, { headers: { 'User-Agent': 'godot-launcher' } });
  if (!res.ok || !res.body) throw new Error(`download failed ${res.status}`);
  const fileOut = (await fs.open(tmpZip, 'w')).createWriteStream();
  let received = 0;
  const total = Number(res.headers.get('content-length')) || release.sizeBytes;
  for await (const chunk of res.body as unknown as AsyncIterable<Buffer>) {
    received += chunk.length;
    fileOut.write(chunk);
    emit({ phase: 'downloading', receivedBytes: received, totalBytes: total, percent: Math.round((received / total) * 100) });
  }
  await new Promise<void>((resolve, reject) => {
    fileOut.end((err: unknown) => (err ? reject(err) : resolve()));
  });

  // 解压
  emit({ phase: 'extracting', receivedBytes: received, totalBytes: total, percent: 100, message: '准备解压...' });
  await ensureDir(installPath);

  // 解压心跳:每 ~600ms emit 一次进度,避免前端看起来像卡死
  let lastTickAt = 0;
  const extractStart = Date.now();
  try {
    await unzip(tmpZip, installPath, {
      stripTopLevel: true,
      onProgress: (info) => {
        const now = Date.now();
        if (now - lastTickAt > 600) {
          lastTickAt = now;
          const totalDisp = info.total > 0 ? (info.index + '/' + info.total) : ('' + info.index);
          emit({
            phase: 'extracting',
            receivedBytes: info.bytesProcessed,
            totalBytes: info.bytesProcessed,
            percent: info.total > 0 ? Math.min(99, Math.round((info.index / info.total) * 100)) : 99,
            message: '解压中 ' + totalDisp + ' (' + info.entryName + ')'
          });
        }
      }
    });
    log.info('unzip finished in', Date.now() - extractStart, 'ms');
  } catch (err) {
    log.error('unzip failed', err);
    throw err;
  } finally {
    await fs.unlink(tmpZip).catch(() => {});
  }

  // 解析可执行文件
  const exe = resolveExecutable(installPath, channel);
  if (!exe) throw new Error('未找到 Godot 可执行文件,zip 内容异常');

  const installed: GodotVersion = {
    id: versionId,
    tag,
    label: release.label,
    channel,
    platform: 'win64',
    installPath,
    executablePath: exe,
    sizeBytes: await dirSize(installPath),
    installedAt: new Date().toISOString()
  };

  const manifest = await readManifest();
  const next = manifest.filter((v) => v.id !== installed.id).concat(installed);
  await writeManifest(next);

  emit({ phase: 'done', receivedBytes: installed.sizeBytes, totalBytes: installed.sizeBytes, percent: 100 });
  return installed;
}

/** 删除已安装版本 */


export interface ImportExistingArgs {
  /** 用户选择的 Godot.exe 绝对路径 */
  executablePath: string;
}

/**
 * 从父目录名推断 tag + channel(支持 Godot_v4.6.2-stable_win64 等常见命名)
 * 失败时回退到基于文件名的简单推断
 */
function parseFromFolderName(name: string): { tag: string; channel: 'stable' | 'mono' } | null {
  // 常见形态:
  //   Godot_v4.6.2-stable_win64
  //   Godot_v4.6.2-stable_mono_win64
  //   Godot_v4.7-dev6_win64
  //   Godot_v4.6.2-stable
  const lower = name.toLowerCase();
  const channel: 'stable' | 'mono' = lower.includes('mono') ? 'mono' : 'stable';
  // 抽取版本号与后缀:Godot_vX.Y.Z-suffix 或 Godot_vX.Y-suffix
  const m = /godot[_-]?v?(\d+\.\d+(?:\.\d+)?)(?:[-_]([a-z0-9]+))?/i.exec(name);
  if (!m) return null;
  const ver = m[1];
  const suffix = m[2] || '';
  // tag 形如 4.6.2-stable 或 4.8-dev6
  const tag = suffix ? (ver + '-' + suffix) : ver;
  return { tag, channel };
}

/**
 * 导入一个本地已存在的 Godot 编辑器(不下载)。
 * 自动从父目录名推断 tag 与 channel,并校验 .exe 文件存在。
 * 若 id 已在清单中,返回原记录而不重复登记。
 */
export async function importExisting(args: ImportExistingArgs): Promise<GodotVersion> {
  const exe = path.resolve(args.executablePath);
  const stat = await fs.stat(exe).catch(() => null);
  if (!stat || !stat.isFile()) throw new Error('不是有效的文件: ' + exe);
  if (path.extname(exe).toLowerCase() !== '.exe') throw new Error('请选择 Godot .exe 文件');

  const fileName = path.basename(exe);
  const parentDir = path.dirname(exe);
  const parentName = path.basename(parentDir);

  // 优先从父目录名推断,失败则用文件名
  let inferred = parseFromFolderName(parentName);
  if (!inferred) inferred = parseFromFolderName(fileName);
  if (!inferred) {
    // 兜底:用 parentName 作为 tag
    inferred = { tag: parentName.replace(/^Godot[_-]?v?/i, '') || parentName, channel: fileName.toLowerCase().includes('mono') ? 'mono' : 'stable' };
  }

  const id = makeVersionId(inferred.tag, inferred.channel, 'win64');
  const label = inferred.tag;

  // 已存在则返回原记录
  const manifest = await readManifest();
  const existed = manifest.find((v) => v.id === id);
  if (existed) {
    // 但要更新 installPath/executablePath(用户可能换了个目录)
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

/** 删除已安装版本 */
/** 删除已安装版本 */
export async function removeVersion(versionId: string): Promise<void> {
  const manifest = await readManifest();
  const target = manifest.find((v) => v.id === versionId);
  if (!target) return;
  await fs.rm(target.installPath, { recursive: true, force: true });
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
  child.stdout?.pipe(writeStream);
  child.stderr?.pipe(writeStream);
  child.on('exit', (code) => {
    writeStream.write(`\n[exit code=${code ?? 'null'}]\n`);
    writeStream.end();
  });
  if (options.detached) child.unref();

  return { logFile, pid: child.pid ?? null };
}


/**
 * 对已安装版本按版本号降序排序(stable 优先于 mono,稳定版优先于 dev/rc)。
 * 复用 godotReleaseSource.compareReleases 的语义。
 */
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
