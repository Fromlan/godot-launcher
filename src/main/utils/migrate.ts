import { promises as fs } from 'node:fs';
import { createLogger } from './logger';

const log = createLogger('migrate');

/**
 * 安全读取 JSON 文件:
 * - 文件不存在 → 返回 null
 * - 解析失败 → 备份为 .bak.<ts> 后返回 null
 * - 解析成功 → 返回数据
 */
export async function readJsonSafe<T>(path: string): Promise<T | null> {
  let text: string;
  try {
    text = await fs.readFile(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    log.warn('read failed', path, err);
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const bak = `${path}.bak.${ts}`;
    try {
      await fs.rename(path, bak);
      log.warn('manifest corrupted, backed up', { path, bak, err });
    } catch (renameErr) {
      log.error('failed to back up corrupted manifest', path, renameErr);
    }
    return null;
  }
}

/**
 * 原子写入 JSON 文件:写临时文件再 rename,避免崩溃时半写状态。
 */
export async function writeJsonAtomic<T>(path: string, data: T): Promise<void> {
  const dir = path.replace(/[\\/][^\\/]*$/, '');
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, path);
}

/**
 * 给 manifest 对象注入 schemaVersion=1(若缺失)。
 * 已存在则保留旧版本号(由后续迁移函数处理)。
 */
export function injectSchemaVersion<T extends object>(
  obj: T | null,
  target: number
): T & { schemaVersion: number } {
  if (obj === null) return { schemaVersion: target } as T & { schemaVersion: number };
  if (typeof (obj as { schemaVersion?: unknown }).schemaVersion !== 'number') {
    return { ...(obj as Record<string, unknown>), schemaVersion: target } as T & { schemaVersion: number };
  }
  return obj as T & { schemaVersion: number };
}

