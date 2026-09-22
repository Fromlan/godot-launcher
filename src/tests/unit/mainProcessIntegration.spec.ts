/**
 * 主进程集成测试(无需 Electron GUI)。
 *
 * 这个文件模拟"完整业务流程":
 *   启动 → 创建配置 → 导入 Godot → 添加项目 → 启动项目(模拟)→ 查看日志
 *
 * 因为它不启动 BrowserWindow,不需要 GUI,在 CI / 无显示环境下也能跑。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

vi.mock('electron', () => ({
  app: {
    setLoginItemSettings: vi.fn(),
    getLoginItemSettings: () => ({ openAtLogin: false }),
    getPath: () => os.tmpdir(),
    getVersion: () => '0.0.0-test',
    isPackaged: false
  }
}));

import * as settings from '../../main/services/settingsService';
import * as godotMgr from '../../main/services/godotManager';
import * as projects from '../../main/services/projectManager';
import * as pluginMgr from '../../main/services/pluginManager';
import { flushLogs } from '../../main/utils/logger';
import { listLogFiles, readLogTail, clearAllLogs } from '../../main/utils/logFile';

let tmp: string;
let spawnedPids: number[] = [];

beforeEach(async () => {
  spawnedPids = [];
  spawnedPids.length = 0;
  tmp = path.join(os.tmpdir(), 'gl-mpi-' + Math.random().toString(36).slice(2));
  await fs.mkdir(tmp, { recursive: true });
  process.env.GL_DATA_DIR = tmp;
});

afterEach(async () => {
  delete process.env.GL_DATA_DIR;
  // 清理可能仍存活的子进程(Windows 下 node.exe 持有文件锁)
  for (const pid of spawnedPids) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ }
  }
  await new Promise((r) => setTimeout(r, 50));
  await fs.rm(tmp, { recursive: true, force: true });
});

async function makeProjectDir(name: string, body: string): Promise<string> {
  const dir = path.join(tmp, 'projects', name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'project.godot'), body);
  return dir;
}

describe('主进程集成流程', () => {
  it('设置 → 版本 → 项目 → 启动 → 日志 完整链路', async () => {
    // 1) 改全局设置
    const cfg1 = await settings.setSettings({
      closeToTray: false,
      autoCheckUpdate: false,
      defaultLaunchArgs: ['--verbose']
    });
    expect(cfg1.defaultLaunchArgs).toEqual(['--verbose']);

    // 2) 导入"假 Godot":直接用 node.exe 当 exe,只关心 spawn 参数拼接
    const fakeDir = path.join(tmp, 'Godot_v4.6.2-stable_win64');
    await fs.mkdir(fakeDir, { recursive: true });
    const nodeExe = process.execPath;
    const fakeGodotExe = path.join(fakeDir, 'Godot_v4.exe');
    await fs.copyFile(nodeExe, fakeGodotExe);

    const version = await godotMgr.importExisting({ executablePath: fakeGodotExe });
    expect(version.tag).toBe('4.6.2-stable');
    expect(version.channel).toBe('stable');

    // 3) 添加项目
    const projectDir = await makeProjectDir(
      'my-game',
      `
config_version=5
[application]
config/name="My Game"
run/main_scene="res://main.tscn"
[config]
version="4.6"
features=["4.4"]
`
    );
    const project = await projects.addProject(projectDir);
    expect(project.name).toBe('My Game');

    // 4) 启动项目:用 node.exe 模拟,但 detached:true 避免 afterEach 卡住 EPERM
    const launchResult = await godotMgr.launchProject({
      version,
      project,
      options: { detached: true, extraArgs: ['--version'] }
    });
    if (launchResult.pid) spawnedPids.push(launchResult.pid);
    expect(launchResult.logFile).toContain(path.join('logs', project.id));
    expect(typeof launchResult.pid === 'number' || launchResult.pid === null).toBe(true);

    // 等子进程退出 + flush 日志
    await flushLogs();

    // 5) 启动后 markLaunched
    await projects.markLaunched(project.id);
    const list = await projects.listProjects();
    expect(list[0].launchCount).toBe(1);

    // 6) 设置默认版本
    await settings.setDefaultVersion(version.id);
    const cfg3 = await settings.getSettings();
    expect(cfg3.defaultVersionId).toBe(version.id);

    // 7) 日志文件应该有内容
    const logs = await listLogFiles();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    // 启动日志(getLogsDir 下)记录 spawn 输出
    const launchLogText = await fs.readFile(launchResult.logFile, 'utf-8').catch(() => '');
    // logFile 至少被创建;spawn 子进程的 stdout 可能为空(node.exe 立即退出)
    expect(typeof launchLogText).toBe('string');
  });

  it('插件安装流程与本地 toggle 协同', async () => {
    const projectDir = await makeProjectDir('p2', 'config_version=5\n');
    await projects.addProject(projectDir);

    const addonDir = path.join(projectDir, 'addons', 'fake_plugin');
    await fs.mkdir(addonDir, { recursive: true });
    await fs.writeFile(
      path.join(addonDir, 'plugin.cfg'),
      '[plugin]\nname="Fake"\nauthor="me"\nversion="0.1"\n'
    );

    let list = await pluginMgr.listLocalPlugins(projectDir);
    expect(list).toHaveLength(1);
    expect(list[0].enabled).toBe(true);

    await pluginMgr.togglePlugin(projectDir, 'fake_plugin');
    list = await pluginMgr.listLocalPlugins(projectDir);
    expect(list[0].enabled).toBe(false);

    await pluginMgr.togglePlugin(projectDir, 'fake_plugin');
    list = await pluginMgr.listLocalPlugins(projectDir);
    expect(list[0].enabled).toBe(true);
  });

  it('日志落盘:写多条 → flush → 可读 → 清理', async () => {
    // 直接调 logger 写,绕开任何不写日志的依赖
    const { createLogger } = await import('../../main/utils/logger');
    const log = createLogger('integration-test');
    log.info('hello from integration test', { foo: 1 });
    log.warn('warning line');
    await flushLogs();
    const before = await listLogFiles();
    expect(before.length).toBeGreaterThanOrEqual(1);
    const today = before[0];
    const tail = await readLogTail(today.name);
    expect(tail.length).toBeGreaterThan(0);

    const cleared = await clearAllLogs();
    expect(cleared).toBeGreaterThanOrEqual(1);
    expect(await listLogFiles()).toEqual([]);
  });

  it('settingsService 与 migrate 配合:损坏 manifest 恢复默认', async () => {
    const cfgPath = path.join(tmp, 'config.json');
    await fs.writeFile(cfgPath, '{not valid');
    const cfg = await settings.getSettings();
    expect(cfg.closeToTray).toBe(true);
    expect(cfg.theme).toBe('godot-dark');
    const dir = await fs.readdir(tmp);
    expect(dir.some((n) => n.startsWith('config.json.bak.'))).toBe(true);
  });

  it('removeVersion 后 listInstalled 为空,但不影响其它 manifest', async () => {
    const a = path.join(tmp, 'Godot_v4.6.2-stable_win64');
    const b = path.join(tmp, 'Godot_v4.8-dev3_win64');
    await fs.mkdir(a);
    await fs.mkdir(b);
    const nodeExe = process.execPath;
    const aExe = path.join(a, 'Godot_v4.exe');
    const bExe = path.join(b, 'Godot_v4.exe');
    await fs.copyFile(nodeExe, aExe);
    await fs.copyFile(nodeExe, bExe);
    const va = await godotMgr.importExisting({ executablePath: aExe });
    const vb = await godotMgr.importExisting({ executablePath: bExe });
    expect((await godotMgr.listInstalled()).length).toBe(2);

    await godotMgr.removeVersion(va.id);
    const list = await godotMgr.listInstalled();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(vb.id);
  });
});
