import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';

/**
 * Smoke 测试:启动应用,等待首屏,确认主 UI 出现。
 *
 * 运行前提:
 *   1. 先构建:`npm run build` 生成 dist-main / dist-preload / dist-renderer
 *   2. 需要一个真实的桌面环境(Windows / macOS / Linux+X server)
 *      - CI / sandboxed 环境若没有 GUI,Playwright 启动 Electron 会失败
 *      - 此时建议跳过本测试,改用 `npm run test:unit` 覆盖主进程逻辑
 *
 * 启动命令:`npm run test:e2e`(本目录)
 */
test('应用启动并渲染主界面', async () => {
  test.skip(
    !!process.env.CI && process.platform === 'win32' && !process.env.DISPLAY && !process.env.GL_E2E_FORCE,
    '当前环境无可用图形会话,跳过 E2E 启动。设置 GL_E2E_FORCE=1 强制运行。'
  );

  const app = await electron.launch({
    args: [
      path.resolve(__dirname, '../../../dist-main/index.js'),
      '--no-sandbox',
      '--disable-gpu'
    ],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      // 测试期间避免使用真实 APPDATA,用临时目录隔离
      GL_DATA_DIR: path.join(os.tmpdir(), 'gl-e2e-' + Date.now())
    },
    timeout: 30_000
  });
  try {
    const window = await app.firstWindow({ timeout: 20_000 });
    await window.waitForLoadState('domcontentloaded', { timeout: 10_000 });
    await expect(window.locator('.sidebar-title')).toContainText('Godot Launcher');
    await expect(window.locator('.sidebar-link')).toHaveCount(4);
  } finally {
    await app.close();
  }
});
