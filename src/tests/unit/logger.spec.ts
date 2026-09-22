import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import {
  createLogger,
  flushLogs,
  _resetLogQueueForTest
} from '../../main/utils/logger';
import { todayFileName, clearAllLogs } from '../../main/utils/logFile';

let tmp: string;

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), 'gl-lgr-' + Math.random().toString(36).slice(2));
  process.env.GL_DATA_DIR = tmp;
  await fs.mkdir(tmp, { recursive: true });
  _resetLogQueueForTest();
});

afterEach(async () => {
  delete process.env.GL_LOG_LEVEL;
  delete process.env.GL_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
  _resetLogQueueForTest();
});

async function readTodayLog(): Promise<string> {
  const file = path.join(tmp, 'logs', todayFileName());
  return fs.readFile(file, 'utf-8').catch(() => '');
}

describe('createLogger', () => {
  it('提供 debug/info/warn/error 四档', () => {
    const log = createLogger('test');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('默认 info 级别:debug 被过滤,info 写入', async () => {
    delete process.env.GL_LOG_LEVEL;
    _resetLogQueueForTest();
    const log = createLogger('scope');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.debug('hidden');
    log.info('shown');
    log.warn('warn-msg');
    log.error('err-msg');
    await flushLogs();
    const content = await readTodayLog();
    expect(content).not.toContain('hidden');
    expect(content).toContain('[info][scope] shown');
    expect(content).toContain('[warn][scope] warn-msg');
    expect(content).toContain('[error][scope] err-msg');
    spy.mockRestore();
    errSpy.mockRestore();
  });

  it('GL_LOG_LEVEL=debug 时全级别都写入', async () => {
    process.env.GL_LOG_LEVEL = 'debug';
    _resetLogQueueForTest();
    const log = createLogger('d');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.debug('d-msg');
    log.info('i-msg');
    await flushLogs();
    const content = await readTodayLog();
    expect(content).toContain('[debug][d] d-msg');
    expect(content).toContain('[info][d] i-msg');
    spy.mockRestore();
  });

  it('GL_LOG_LEVEL=error 时仅 error 写入', async () => {
    process.env.GL_LOG_LEVEL = 'error';
    _resetLogQueueForTest();
    const log = createLogger('e');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.info('nope');
    log.warn('nope');
    log.error('keep');
    await flushLogs();
    const content = await readTodayLog();
    expect(content).not.toContain('nope');
    expect(content).toContain('[error][e] keep');
    spy.mockRestore();
    errSpy.mockRestore();
  });

  it('非法 GL_LOG_LEVEL 视为 info', async () => {
    process.env.GL_LOG_LEVEL = 'garbage';
    _resetLogQueueForTest();
    const log = createLogger('g');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.debug('hidden');
    log.info('shown');
    await flushLogs();
    const content = await readTodayLog();
    expect(content).not.toContain('hidden');
    expect(content).toContain('[info][g] shown');
    spy.mockRestore();
  });

  it('行首包含 ISO 时间戳', async () => {
    delete process.env.GL_LOG_LEVEL;
    _resetLogQueueForTest();
    const log = createLogger('ts');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.info('time-test');
    await flushLogs();
    const content = await readTodayLog();
    expect(content).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z /);
    spy.mockRestore();
  });

  it('多个 args 用空格 join', async () => {
    process.env.GL_LOG_LEVEL = 'debug';
    _resetLogQueueForTest();
    const log = createLogger('m');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.debug('a', 1, true, null);
    await flushLogs();
    const content = await readTodayLog();
    expect(content).toContain('[debug][m] a 1 true null');
    spy.mockRestore();
  });

  it('Error 对象输出 stack 或 message', async () => {
    process.env.GL_LOG_LEVEL = 'debug';
    _resetLogQueueForTest();
    const log = createLogger('err');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = new Error('boom');
    log.error(err);
    await flushLogs();
    const content = await readTodayLog();
    expect(content).toContain('[error][err]');
    expect(content).toContain('boom');
    spy.mockRestore();
  });

  it('对象会被 JSON 序列化', async () => {
    process.env.GL_LOG_LEVEL = 'debug';
    _resetLogQueueForTest();
    const log = createLogger('obj');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.info({ foo: 1, bar: 'x' });
    await flushLogs();
    const content = await readTodayLog();
    expect(content).toContain('[info][obj] {');
    expect(content).toContain('"foo":1');
    spy.mockRestore();
  });

  it('环状引用对象降级为 String()', async () => {
    process.env.GL_LOG_LEVEL = 'debug';
    _resetLogQueueForTest();
    const log = createLogger('cyc');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    log.info(a);
    await flushLogs();
    const content = await readTodayLog();
    expect(content).toContain('[info][cyc]');
    expect(content.length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('控制台输出也被镜像', async () => {
    delete process.env.GL_LOG_LEVEL;
    _resetLogQueueForTest();
    const log = createLogger('mirror');
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    log.info('mirrored');
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toContain('[godot-launcher][info][mirror]');
    spy.mockRestore();
  });

  it('控制台输出分级别映射 warn->console.warn', async () => {
    delete process.env.GL_LOG_LEVEL;
    _resetLogQueueForTest();
    const log = createLogger('lvl');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.warn('w');
    log.error('e');
    expect(warnSpy).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('info 在控制台走 console.info', async () => {
    delete process.env.GL_LOG_LEVEL;
    _resetLogQueueForTest();
    const log = createLogger('d2');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.info('i');
    expect(infoSpy).toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    infoSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe('flushLogs', () => {
  it('等待队列内全部写完后再返回', async () => {
    process.env.GL_LOG_LEVEL = 'debug';
    _resetLogQueueForTest();
    const log = createLogger('flush');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    for (let i = 0; i < 20; i++) log.debug('msg-' + i);
    await flushLogs();
    const content = await readTodayLog();
    for (let i = 0; i < 20; i++) {
      expect(content).toContain('msg-' + i);
    }
    spy.mockRestore();
  });

  it('空队列时立即 resolve', async () => {
    _resetLogQueueForTest();
    const t0 = Date.now();
    await flushLogs();
    expect(Date.now() - t0).toBeLessThan(50);
  });

  it('_resetLogQueueForTest 后后续写入不会因旧 promise 残留', async () => {
    _resetLogQueueForTest();
    process.env.GL_LOG_LEVEL = 'debug';
    const log = createLogger('rst');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.debug('first');
    _resetLogQueueForTest();
    log.debug('second');
    await flushLogs();
    const content = await readTodayLog();
    expect(content).toContain('first');
    expect(content).toContain('second');
    spy.mockRestore();
  });
});

describe('scope 隔离', () => {
  it('不同 scope 互不影响日志内容', async () => {
    process.env.GL_LOG_LEVEL = 'debug';
    _resetLogQueueForTest();
    const a = createLogger('alpha');
    const b = createLogger('beta');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    a.info('from-a');
    b.info('from-b');
    await flushLogs();
    const content = await readTodayLog();
    expect(content).toContain('[info][alpha] from-a');
    expect(content).toContain('[info][beta] from-b');
    spy.mockRestore();
  });
});

describe('与 clearAllLogs 集成', () => {
  it('写后清空,flush 后内容为空', async () => {
    process.env.GL_LOG_LEVEL = 'debug';
    _resetLogQueueForTest();
    const log = createLogger('cl');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.debug('will-be-cleared');
    await flushLogs();
    const cleared = await clearAllLogs();
    expect(cleared).toBeGreaterThanOrEqual(1);
    const content = await readTodayLog();
    expect(content).toBe('');
    spy.mockRestore();
  });
});
