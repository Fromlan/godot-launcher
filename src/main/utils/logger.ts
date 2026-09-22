import { LOG_PREFIX } from '../../shared/constants/paths';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function emit(level: Level, scope: string, args: unknown[]) {
  const threshold = LEVELS[(process.env.GL_LOG_LEVEL as Level) || 'info'];
  if (LEVELS[level] < threshold) return;
  const tag = `${LOG_PREFIX}[${level}][${scope}]`;
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](tag, ...args);
}

export function createLogger(scope: string) {
  return {
    debug: (...args: unknown[]) => emit('debug', scope, args),
    info: (...args: unknown[]) => emit('info', scope, args),
    warn: (...args: unknown[]) => emit('warn', scope, args),
    error: (...args: unknown[]) => emit('error', scope, args)
  };
}
