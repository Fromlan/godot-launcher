import { BrowserWindow, app, shell } from 'electron';
import path from 'node:path';
import { createLogger } from './utils/logger';

const log = createLogger('window');

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function setQuitting(v: boolean): void {
  isQuitting = v;
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#1E1E1E',
    autoHideMenuBar: true,
    title: 'Godot Launcher',
    webPreferences: {
      // 当前文件位于 dist-main/main/window.js;preload 在 ../../dist-preload/preload/index.js;renderer 在 ../../dist-renderer/index.html
      preload: path.join(__dirname, '../../dist-preload/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  if (devUrl) {
    mainWindow.loadURL(devUrl).catch((err) => log.error('loadURL failed', err));
  } else {
    // 打包后 dist-main/main/index.js 加载 dist-renderer/index.html
    const indexHtml = path.join(__dirname, '../../dist-renderer/index.html');
    mainWindow.loadFile(indexHtml).catch((err) => log.error('loadFile failed', err));
  }

  mainWindow.on('close', (e) => {
    const cfg = app.getLoginItemSettings();
    void cfg;
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

