/**
 * autoLaunch dev 守卫测试。
 *
 * 关键不变量:
 *   - app.isPackaged === false 时,setAutoLaunch(true|false) 不应写注册表
 *   - app.isPackaged === true 时,setAutoLaunch(true|false) 正常调 setLoginItemSettings
 *   - getAutoLaunch 在 dev 模式返回 false(而不是读注册表)
 */
import { describe, it, expect as _e, beforeEach, vi } from 'vitest';

const setLoginItemSettings = vi.fn();
const getLoginItemSettings = vi.fn(() => ({
  openAtLogin: false
}));

// 用一个可变对象,可在测试中切换 isPackaged
const appState: { isPackaged: boolean } = { isPackaged: false };

vi.mock('electron', () => ({
  app: {
    setLoginItemSettings,
    getLoginItemSettings,
    get isPackaged() { return appState.isPackaged; }
  }
}));

// 注意:动态 import 必须放在 vi.mock 之后,确保 mock 已注册
const { setAutoLaunch, getAutoLaunch } = await import('../../main/autoLaunch');

describe('autoLaunch dev 守卫', () => {
  beforeEach(() => {
    setLoginItemSettings.mockClear();
    getLoginItemSettings.mockClear();
  });

  it('app.isPackaged=false 时 setAutoLaunch(true) 不调用 setLoginItemSettings', () => {
    appState.isPackaged = false;
    setAutoLaunch(true);
    _e(setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('app.isPackaged=false 时 setAutoLaunch(false) 不调用 setLoginItemSettings', () => {
    appState.isPackaged = false;
    setAutoLaunch(false);
    _e(setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('app.isPackaged=true 时 setAutoLaunch(true) 调 setLoginItemSettings,openAtLogin=true', () => {
    appState.isPackaged = true;
    setAutoLaunch(true);
    _e(setLoginItemSettings).toHaveBeenCalledTimes(1);
    _e(setLoginItemSettings.mock.calls[0][0]).toMatchObject({
      openAtLogin: true,
      openAsHidden: true,
      args: ['--hidden']
    });
  });

  it('app.isPackaged=true 时 setAutoLaunch(false) 调 setLoginItemSettings,openAtLogin=false', () => {
    appState.isPackaged = true;
    setAutoLaunch(false);
    _e(setLoginItemSettings).toHaveBeenCalledTimes(1);
    _e(setLoginItemSettings.mock.calls[0][0]).toMatchObject({
      openAtLogin: false
    });
  });

  it('app.isPackaged=false 时 getAutoLaunch 直接返回 false, 不读注册表', () => {
    appState.isPackaged = false;
    _e(getAutoLaunch()).toBe(false);
    _e(getLoginItemSettings).not.toHaveBeenCalled();
  });
});