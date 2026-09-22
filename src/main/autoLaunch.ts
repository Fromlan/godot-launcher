import { app } from 'electron';
import { createLogger } from './utils/logger';

const log = createLogger('auto-launch');

export function setAutoLaunch(openAtLogin: boolean): void {
  log.info('setAutoLaunch', openAtLogin);
  app.setLoginItemSettings({
    openAtLogin,
    openAsHidden: true,
    args: ['--hidden']
  });
}

export function getAutoLaunch(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}
