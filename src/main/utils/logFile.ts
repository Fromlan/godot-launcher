import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getLogsDir } from './path';

/** 单个日志文件上限(达到后 rotate) */
export const MAX_FILE_BYTES = 1 * 1024 * 1024;

/** 每天保留的滚动文件数(.1.log / .2.log ...) */
export const MAX_FILES_PER_DAY = 5;

/** 文件保留天数(超过则清理) */
export const MAX_LOG_AGE_DAYS = 30;

/** 文件名最大读取字节(防止一次性读入爆炸) */
export const MAX_TAIL_BYTES = 256 * 1024;

/** yyyy-mm-dd 日期键 */
export function todayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** 当前激活日志文件完整名(按日期切分) */
export function todayFileName(d: Date = new Date()): string {
  return `app-${todayKey(d)}.log`;
}

/** 获取日志目录(可被 path.ts 的 GL_DATA_DIR / APPDATA / ~/.godot-launcher 覆盖) */
export async function ensureLogDir(): Promise<string> {
  const dir = getLogsDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function getLogDirSync(): string {
  return getLogsDir();
}

/** 若当前日期日志超过 MAX_FILE_BYTES,把 .log -> .1.log,.1.log -> .2.log ... */
async function rotateIfNeeded(file: string): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return;
  }
  if (stat.size < MAX_FILE_BYTES) return;
  const dir = path.dirname(file);
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  for (let i = MAX_FILES_PER_DAY - 1; i >= 1; i--) {
    const from = path.join(dir, `${base}.${i}${ext}`);
    const to = path.join(dir, `${base}.${i + 1}${ext}`);
    try {
      await fs.access(from);
      if (i === MAX_FILES_PER_DAY - 1) {
        await fs.unlink(from);
      } else {
        await fs.rename(from, to);
      }
    } catch { /* skip */ }
  }
  try { await fs.rename(file, path.join(dir, `${base}.1${ext}`)); } catch { /* skip */ }
}

/**
 * 追加一行日志(自动按需 rotate)。
 * 不抛错:失败仅写 stderr;调用方无需 try/catch。
 */
export async function appendLog(content: string): Promise<void> {
  try {
    const dir = await ensureLogDir();
    const file = path.join(dir, todayFileName());
    await rotateIfNeeded(file);
    await fs.appendFile(file, content, "utf-8");
  } catch (err) {
    process.stderr.write(`[logger] failed to append log: ${(err as Error).message}\n`);
  }
}

/** 清理超过 MAX_LOG_AGE_DAYS 的日志文件。返回清理数量 */
export async function purgeOldLogs(now: Date = new Date()): Promise<number> {
  let dir: string;
  try {
    dir = await ensureLogDir();
  } catch {
    return 0;
  }
  let purged = 0;
  const cutoff = now.getTime() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return 0;
  }
  for (const name of entries) {
    if (!name.startsWith("app-") || !name.endsWith(".log")) continue;
    const file = path.join(dir, name);
    try {
      const stat = await fs.stat(file);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(file);
        purged++;
      }
    } catch { /* skip */ }
  }
  return purged;
}

export interface LogFileEntry {
  name: string;
  sizeBytes: number;
  mtimeMs: number;
}

/** 列出所有日志文件(按 mtime 倒序) */
export async function listLogFiles(): Promise<LogFileEntry[]> {
  let dir: string;
  try {
    dir = await ensureLogDir();
  } catch {
    return [];
  }
  const out: LogFileEntry[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  for (const name of entries) {
    if (!name.startsWith("app-") || !name.endsWith(".log")) continue;
    const file = path.join(dir, name);
    try {
      const stat = await fs.stat(file);
      out.push({ name, sizeBytes: stat.size, mtimeMs: stat.mtimeMs });
    } catch { /* skip */ }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * 读取日志文件尾部内容(最多 maxBytes 字节)。
 * 安全校验:name 必须以 app- 开头、以 .log 结尾,且不含路径分隔符。
 */
export async function readLogTail(name: string, maxBytes: number = MAX_TAIL_BYTES): Promise<string> {
  if (!isSafeName(name)) return "";
  let dir: string;
  try {
    dir = await ensureLogDir();
  } catch {
    return "";
  }
  const file = path.join(dir, name);
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return "";
  }
  if (!stat.isFile()) return "";
  const start = Math.max(0, stat.size - maxBytes);
  const fh = await fs.open(file, "r");
  try {
    const len = stat.size - start;
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, start);
    return buf.toString("utf-8");
  } finally {
    await fh.close();
  }
}

function isSafeName(name: string): boolean {
  if (!name || name.length === 0 || name.length > 128) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.startsWith(".")) return false;
  return /^app-[\w.-]+\.log$/.test(name);
}

/** 清空所有日志文件。返回清理数量 */
export async function clearAllLogs(): Promise<number> {
  let dir: string;
  try {
    dir = await ensureLogDir();
  } catch {
    return 0;
  }
  let cleared = 0;
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return 0;
  }
  for (const name of entries) {
    if (!name.startsWith("app-") || !name.endsWith(".log")) continue;
    try {
      await fs.unlink(path.join(dir, name));
      cleared++;
    } catch { /* skip */ }
  }
  return cleared;
}
