import { Tray, Menu, app, nativeImage, BrowserWindow } from 'electron';
import path from 'node:path';
import { IPC_EVENTS } from '../shared/types/ipc';
import { listProjects } from './services/projectManager';
import { checkForUpdate } from './updater';
import { createLogger } from './utils/logger';

const log = createLogger('tray');

let tray: Tray | null = null;

function emptyIcon(): Electron.NativeImage {
  // 使用程序内置 1x1 透明图(避免依赖外部资源)
  return nativeImage.createEmpty();
}

function buildMenu(getWindow: () => BrowserWindow | null): Menu {
  const recentPromise = listProjects()
    .then((all) => all.sort((a, b) => (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || '')).slice(0, 5))
    .catch(() => [] as Awaited<ReturnType<typeof listProjects>>);

  const recentItems: Promise<Electron.MenuItemConstructorOptions[]> = recentPromise.then((recents) =>
    recents.length === 0
      ? [{ label: '暂无最近项目', enabled: false }]
      : recents.map((p) => ({
          label: p.name,
          click: () => {
            const w = getWindow();
            w?.show();
            w?.webContents.send(IPC_EVENTS.trayNavigateTo, { page: 'projects', projectId: p.id });
          }
        }))
  );

  const baseItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '显示主窗口',
      click: () => getWindow()?.show()
    },
    { type: 'separator' },
    {
      label: '最近项目',
      submenu: [] as Electron.MenuItemConstructorOptions[]
    },
    { type: 'separator' },
    {
      label: '检查更新',
      click: async () => {
        try {
          await checkForUpdate();
        } catch (err) {
          log.warn('manual check update', err);
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ];

  // 同步构建菜单(为了避免在异步里构建后菜单空),先用一个占位
  const menu = Menu.buildFromTemplate(baseItems);
  recentItems.then((items) => {
    const real = Menu.buildFromTemplate([
      baseItems[0],
      baseItems[1],
      { label: '最近项目', submenu: items },
      ...baseItems.slice(3)
    ]);
    tray?.setContextMenu(real);
  });
  return menu;
}

export function createTray(getWindow: () => BrowserWindow | null): Tray {
  if (tray) return tray;
  try {
    tray = new Tray(emptyIcon());
  } catch {
    // 某些环境下(无图形会话)创建失败,跳过
    log.warn('Tray create failed, continue without tray');
    tray = null;
    return tray as unknown as Tray;
  }
  tray.setToolTip('Godot Launcher');
  tray.setContextMenu(buildMenu(getWindow));
  tray.on('click', () => {
    const w = getWindow();
    if (w && !w.isDestroyed()) {
      w.isVisible() ? w.hide() : w.show();
    } else {
      getWindow()?.show();
    }
  });
  tray.on('double-click', () => getWindow()?.show());
  void path;
  return tray;
}

export function refreshTrayMenu(getWindow: () => BrowserWindow | null): void {
  if (!tray) return;
  tray.setContextMenu(buildMenu(getWindow));
}
