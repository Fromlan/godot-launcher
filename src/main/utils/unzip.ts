import yauzl from 'yauzl';
import { promises as fsp, createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

export interface UnzipOptions {
  stripTopLevel?: boolean;
  onProgress?: (info: { entryName: string; index: number; total: number; bytesProcessed: number }) => void;
  totalEntries?: number;
  timeoutMs?: number;
}

export interface UnzipStats {
  entryIndex: number;
  bytesProcessed: number;
  total: number;
}

export function unzip(zipPath: string, destDir: string, opts: UnzipOptions = {}): Promise<UnzipStats> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const stats: UnzipStats = { entryIndex: 0, bytesProcessed: 0, total: 0 };
  let timeoutHandle: NodeJS.Timeout | undefined;

  const work = new Promise<UnzipStats>((resolve, reject) => {
    let settled = false;
    const settleReject = (err: Error) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(err);
    };
    const settleResolve = (s: UnzipStats) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve(s);
    };

    timeoutHandle = setTimeout(() => {
      settleReject(new Error('解压超时 (' + Math.round(timeoutMs / 1000) + 's),zip 可能损坏或被防病毒软件阻塞'));
    }, timeoutMs);

    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err || !zip) {
        return settleReject(err || new Error('open zip failed'));
      }

      let commonPrefix: string | null = null;
      zip.on('error', (e) => settleReject(e instanceof Error ? e : new Error(String(e))));

      zip.on('entry', (entry: yauzl.Entry) => {
        if (settled) return;
        if (commonPrefix === null && opts.stripTopLevel) {
          const firstSlash = entry.fileName.indexOf('/');
          if (firstSlash > 0) commonPrefix = entry.fileName.slice(0, firstSlash + 1);
          else commonPrefix = '';
        }

        let rel = entry.fileName;
        if (opts.stripTopLevel && commonPrefix && rel.startsWith(commonPrefix)) {
          rel = rel.slice(commonPrefix.length);
          if (!rel) {
            zip.readEntry();
            return;
          }
        }
        const target = path.join(destDir, rel);

        if (/\/$/.test(entry.fileName)) {
          fsp
            .mkdir(target, { recursive: true })
            .then(() => zip.readEntry())
            .catch((e) => settleReject(e instanceof Error ? e : new Error(String(e))));
          return;
        }

        handleFile(zip, entry, target)
          .then((bytes) => {
            stats.bytesProcessed += bytes;
            stats.entryIndex += 1;
            opts.onProgress?.({
              entryName: entry.fileName,
              index: stats.entryIndex,
              total: opts.totalEntries ?? 0,
              bytesProcessed: stats.bytesProcessed
            });
            zip.readEntry();
          })
          .catch((e) => settleReject(e instanceof Error ? e : new Error(String(e))));
      });

      zip.on('end', () => settleResolve(stats));
      zip.readEntry();
    });
  });

  return work.catch(async (err): Promise<UnzipStats> => {
    try {
      await fsp.rm(destDir, { recursive: true, force: true });
    } catch {}
    throw err;
  });
}

async function handleFile(zip: yauzl.ZipFile, entry: yauzl.Entry, target: string): Promise<number> {
  const rs: NodeJS.ReadableStream = await new Promise((resolve, reject) => {
    zip.openReadStream(entry, (rsErr, stream) => {
      if (rsErr || !stream) reject(rsErr || new Error('open read stream failed for ' + entry.fileName));
      else resolve(stream);
    });
  });

  await fsp.mkdir(path.dirname(target), { recursive: true });

  const out = createWriteStream(target);
  let written = 0;
  rs.on('data', (chunk: Buffer | string) => {
    written += chunk.length;
  });
  await pipeline(rs as unknown as NodeJS.ReadStream, out);

  return entry.uncompressedSize && entry.uncompressedSize > 0 ? entry.uncompressedSize : written;
}
