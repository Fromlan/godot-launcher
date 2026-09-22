import { LOG_PREFIX } from '../../shared/constants/paths';
import { appendLog } from './logFile';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * 写入队列(保证顺序)。
 * 链式 promise,每次 enqueue 都接到前一个的尾巴上。
 */
let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(line: string): void {
  writeQueue = writeQueue.then(() => appendLog(line));
}

/** 等待所有挂起的日志写完(进程退出前调用) */
export async function flushLogs(): Promise<void> {
  await writeQueue;
}

/**
 * 把任意值安全地转为字符串。
 * - Error -> stack(或 message)
 * - 其它非字符串 -> JSON.stringify,失败回退 String(v)
 */
function safeStringify(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (v instanceof Error) return v.stack || v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function readLevel(): LogLevel {
  const raw = (process.env.GL_LOG_LEVEL || 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return 'info';
}

function emit(level: LogLevel, scope: string, args: unknown[]): void {
  const threshold = LEVELS[readLevel()];
  if (LEVELS[level] < threshold) return;
  const tag = `${LOG_PREFIX}[${level}][${scope}]`;
  // 控制台镜像(开发期诊断)
  console[level === 'debug' ? 'log' : level](tag, ...args);
  // 文件落盘(异步队列)
  const ts = new Date().toISOString();
  const parts = args.map(safeStringify).join(' ');
  enqueueWrite(`${ts} ${tag} ${parts}\n`);
}

export function createLogger(scope: string) {
  return {
    debug: (...args: unknown[]) => emit('debug', scope, args),
    info: (...args: unknown[]) => emit('info', scope, args),
    warn: (...args: unknown[]) => emit('warn', scope, args),
    error: (...args: unknown[]) => emit('error', scope, args)
  };
}

/** 仅用于测试:重置队列(避免遗留 promise 影响隔离) */
export function _resetLogQueueForTest(): void {
  writeQueue = Promise.resolve();
}

/** 仅用于测试:导出当前队列快照(诊断) */
export function _getLogQueueSnapshot(): Promise<void> {
  return writeQueue;
}
