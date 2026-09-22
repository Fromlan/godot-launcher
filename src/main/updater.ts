import { app, BrowserWindow } from 'electron';
import { createLogger } from './utils/logger';

const log = createLogger('updater');

type UpdaterStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'disabled';

let status: UpdaterStatus = 'idle';

export function getUpdaterStatus(): UpdaterStatus {
  return status;
}

/**
 * 检查更新。开发模式下禁用(避免下载 dev 流程)。
 * 这里延迟 require electron-updater,确保仅在打包后才加载。
 */
export async function checkForUpdate(): Promise<unknown> {
  if (!app.isPackaged) {
    log.info('dev mode, skip auto update');
    status = 'disabled';
    return null;
  }
  status = 'checking';
  try {
     
    const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');
    autoUpdater.logger = {
      info: (...args: unknown[]) => log.info(...args),
      warn: (...args: unknown[]) => log.warn(...args),
      error: (...args: unknown[]) => log.error(...args),
      debug: (...args: unknown[]) => log.debug(...args)
    };
    autoUpdater.on('update-available', (info) => {
      status = 'available';
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('system:update-available', info));
    });
    autoUpdater.on('update-not-available', () => {
      status = 'not-available';
    });
    autoUpdater.on('download-progress', () => {
      status = 'downloading';
    });
    autoUpdater.on('update-downloaded', (info) => {
      status = 'downloaded';
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('system:update-downloaded', info));
    });
    autoUpdater.on('error', (err) => {
      status = 'error';
      log.warn('updater error', err);
    });
    const result = await autoUpdater.checkForUpdates();
    return result;
  } catch (err) {
    status = 'error';
    log.warn('checkForUpdate failed', err);
    throw err;
  }
}

export async function installDownloadedUpdate(): Promise<void> {
  if (!app.isPackaged) return;
   
  const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');
  autoUpdater.quitAndInstall();
}
