import { app, dialog, BrowserWindow } from 'electron';
import { createMainWindow, getMainWindow, setQuitting } from './window';
import { initIpc } from './ipc';
import { createTray, refreshTrayMenu } from './tray';
import { checkForUpdate } from './updater';
import { getAutoLaunch, setAutoLaunch } from './autoLaunch';
import { getSettings } from './services/settingsService';
import { ensureDir, getUserDataDir, getVersionsDir } from './utils/path';
import { createLogger, flushLogs } from './utils/logger';
import { ensureLogDir, purgeOldLogs } from './utils/logFile';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const log = createLogger('main');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = getMainWindow();
    if (w) {
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
    }
  });
}

/**
 * 启动时清理 versions/*.zip.part 残留。
 * - .zip.part:下载未完成的临时文件
 * - 超过 24h 视为孤儿(进程崩溃 / 用户强制退出 留下)
 */
async function cleanupOrphanZipParts(): Promise<void> {
  const versionsDir = getVersionsDir();
  try {
    await fs.mkdir(versionsDir, { recursive: true });
  } catch { /* ignore */ }
  let entries: string[];
  try {
    entries = await fs.readdir(versionsDir);
    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    for (const name of entries) {
      if (!name.endsWith('.zip.part')) continue;
      const file = path.join(versionsDir, name);
      try {
        const stat = await fs.stat(file);
        if (now - stat.mtimeMs > ONE_DAY_MS) {
          await fs.unlink(file);
          log.info('cleanup orphan zip.part', name);
        }
      } catch (err) {
        log.warn('cleanup zip.part failed', name, err);
      }
    }
  } catch (err) {
    log.warn('cleanup orphan zip parts failed', err);
  }
}

// 单实例已上锁;开始主流程
app.whenReady().then(async () => {
  try {
    // 初始化 IPC
    initIpc(() => getMainWindow());

    // 静默启动?(命令 --hidden)
    const startHidden = process.argv.includes('--hidden');

    // 创窗
    createMainWindow();
    if (!startHidden) {
      getMainWindow()?.show();
    }

    // 数据目录就绪
    await ensureDir(getUserDataDir());
    // 日志目录就绪 + 清理超龄日志
    await ensureLogDir();
    const purged = await purgeOldLogs();
    if (purged > 0) log.info('purged old log files', purged);

    // 清理未完成下载残留
    await cleanupOrphanZipParts();

    // 托盘
    await createTray(() => getMainWindow());
    // 同步托盘菜单(项目可能已变更)
    await refreshTrayMenu(() => getMainWindow());

    // 自动更新
    const cfg = await getSettings();
    if (cfg.autoCheckUpdate && app.isPackaged) {
      checkForUpdate().catch((err) => log.warn('auto check update', err));
    }

    // 持久化开机自启设置
    const real = getAutoLaunch();
    if (real !== cfg.autoLaunch) {
      setAutoLaunch(cfg.autoLaunch);
    }
  } catch (err) {
    log.error('startup error', err);
    dialog.showErrorBox('启动失败', String((err as Error).message || err));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', (e) => {
  setQuitting(true);
  // 异步刷盘;主进程退出前同步等待,避免丢最后几行
  e.preventDefault();
  flushLogs()
    .catch((err) => log.warn('flushLogs on quit failed', err))
    .finally(() => app.exit(0));
});

app.on('window-all-closed', () => {
  // Windows / Linux:保持在托盘运行,不退出
  // macOS:遵循退出惯例
  if (process.platform === 'darwin') {
    app.quit();
  }
});

