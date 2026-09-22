import crypto from 'node:crypto';
import { promises as fs, createReadStream } from 'node:fs';

/** 计算文件 SHA-256 */
export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/** 计算 Buffer 的 SHA-256 */
export function sha256Buffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** 计算字符串 SHA-256 */
export async function ensureNoExistingFile(p: string): Promise<void> {
  try {
    await fs.access(p);
    throw new Error(`file exists: ${p}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
}
