import { Tray, Menu, app, nativeImage, BrowserWindow } from 'electron';
import { listProjects } from './services/projectManager';
import { checkForUpdate } from './updater';
import { IPC_EVENTS } from '../shared/types/ipc';
import { createLogger } from './utils/logger';

const log = createLogger('tray');

let tray: Tray | null = null;
let cachedMenu: Menu | null = null;

type GetWindow = () => BrowserWindow | null;

/**
 * 构造 1x1 透明图标,作为 tray 图标的占位实现。
 * 真实图标待 v0.3 图标 PR 引入 resources/tray.ico 后切换。
 */
function placeholderIcon(): Electron.NativeImage {
  return nativeImage.createEmpty();
}

/**
 * 同步构建"最近项目"占位子菜单,避免首帧闪烁。
 * 随后异步填充真实数据后通过 setContextMenu 覆盖。
 */
async function buildRecentSubmenu(): Promise<Electron.MenuItemConstructorOptions[]> {
  try {
    const all = await listProjects();
    const recents = all
      .sort((a, b) => (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || ''))
      .slice(0, 5);
    if (recents.length === 0) return [{ label: '暂无最近项目', enabled: false }];
    return recents.map((p) => ({
      label: p.name,
      click: () => {
        const win = BrowserWindow.getAllWindows()[0];
        win?.show();
        win?.webContents.send(IPC_EVENTS.trayNavigateTo, { page: 'projects', projectId: p.id });
      }
    }));
  } catch (err) {
    log.warn('load recent projects failed', err);
    return [{ label: '暂无最近项目', enabled: false }];
  }
}

type MenuSegment = 'show' | 'recent-sep' | 'recent' | 'sys-sep' | 'update' | 'exit-sep' | 'exit';

/**
 * Named-segments 模式构造菜单,避免按 index 切片。
 */
function buildTemplate(recentItems: Electron.MenuItemConstructorOptions[]): Menu {
  const segments: Record<MenuSegment, Electron.MenuItemConstructorOptions> = {
    show: {
      label: '显示主窗口',
      click: () => BrowserWindow.getAllWindows()[0]?.show()
    },
    'recent-sep': { type: 'separator' },
    recent: { label: '最近项目', submenu: recentItems },
    'sys-sep': { type: 'separator' },
    update: {
      label: '检查更新',
      click: () => {
        checkForUpdate().catch((err) => log.warn('manual check update', err));
      }
    },
    'exit-sep': { type: 'separator' },
    exit: {
      label: '退出',
      click: () => app.quit()
    }
  };
  return Menu.buildFromTemplate([
    segments.show,
    segments['recent-sep'],
    segments.recent,
    segments['sys-sep'],
    segments.update,
    segments['exit-sep'],
    segments.exit
  ]);
}

/**
 * 构造最终菜单(阻塞最近项目 IO)。
 */
async function buildMenuAsync(): Promise<Menu> {
  const recent = await buildRecentSubmenu();
  return buildTemplate(recent);
}

export async function createTray(getWindow: GetWindow): Promise<Tray | null> {
  void getWindow;
  if (tray) return tray;
  try {
    tray = new Tray(placeholderIcon());
  } catch (err) {
    log.warn('Tray create failed, continue without tray', err);
    tray = null;
    return null;
  }
  tray.setToolTip('Godot Launcher');
  // 先用占位菜单,避免首帧"无菜单"
  cachedMenu = buildTemplate([{ label: '加载中...', enabled: false }]);
  tray.setContextMenu(cachedMenu);
  // 异步构建并替换
  buildMenuAsync()
    .then((menu) => {
      cachedMenu = menu;
      if (tray && !tray.isDestroyed()) tray.setContextMenu(menu);
    })
    .catch((err) => log.warn('build tray menu failed', err));

  tray.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      if (win.isVisible()) win.hide();
      else win.show();
    } else {
      win?.show();
    }
  });
  tray.on('double-click', () => BrowserWindow.getAllWindows()[0]?.show());
  return tray;
}

export async function refreshTrayMenu(_getWindow: GetWindow): Promise<void> {
  void _getWindow;
  if (!tray || tray.isDestroyed()) return;
  try {
    const menu = await buildMenuAsync();
    cachedMenu = menu;
    tray.setContextMenu(menu);
  } catch (err) {
    log.warn('refresh tray menu failed', err);
    if (cachedMenu) tray.setContextMenu(cachedMenu);
  }
}
