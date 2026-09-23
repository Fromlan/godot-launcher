import { app } from 'electron';
import { createLogger } from './utils/logger';

const log = createLogger('auto-launch');

/**
 * 设置开机自启。仅在打包后生效,避免开发模式污染 Windows 注册表。
 * - openAtLogin: true → 写入
 * - openAtLogin: false → 移除
 * - args: ['--hidden'] 配合 main/index.ts 的 --hidden 启动参数,实现"以托盘方式开机"
 */
export function setAutoLaunch(openAtLogin: boolean): void {
  if (!app.isPackaged) {
    log.info('setAutoLaunch skipped (dev mode, app.isPackaged=false)', openAtLogin);
    return;
  }
  log.info('setAutoLaunch', openAtLogin);
  app.setLoginItemSettings({
    openAtLogin,
    openAsHidden: true,
    args: ['--hidden']
  });
}

export function getAutoLaunch(): boolean {
  if (!app.isPackaged) return false;
  return app.getLoginItemSettings().openAtLogin;
}