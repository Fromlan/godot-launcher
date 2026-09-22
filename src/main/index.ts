import { app, dialog, BrowserWindow } from 'electron';
import { createMainWindow, getMainWindow, setQuitting } from './window';
import { initIpc } from './ipc';
import { createTray, refreshTrayMenu } from './tray';
import { checkForUpdate } from './updater';
import { getAutoLaunch } from './autoLaunch';
import { getSettings } from './services/settingsService';
import { ensureDir } from './utils/path';
import { createLogger } from './utils/logger';

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

    // 托盘
    createTray(() => getMainWindow());

    // 同步数据目录
    const { getUserDataDir } = await import('./utils/path');
    await ensureDir(getUserDataDir());

    // 同步托盘菜单(项目可能已变更)
    refreshTrayMenu(() => getMainWindow());

    // 自动更新
    const cfg = await getSettings();
    if (cfg.autoCheckUpdate && app.isPackaged) {
      checkForUpdate().catch((err) => log.warn('auto check update', err));
    }

    // 持久化开机自启设置
    const real = getAutoLaunch();
    if (real !== cfg.autoLaunch) {
      const { setAutoLaunch } = await import('./autoLaunch');
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

app.on('before-quit', () => {
  setQuitting(true);
});

app.on('window-all-closed', () => {
  // Windows 下保持在托盘运行,不退出
  // macOS 退出惯例:process.platform !== 'darwin'
});
