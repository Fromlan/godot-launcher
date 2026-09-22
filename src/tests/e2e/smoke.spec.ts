import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';

/**
 * Smoke 测试:启动应用,等待首屏,确认主 UI 出现。
 * 注意:此测试需要先 build 才能运行(`npm run build` 然后 `npm run test:e2e`)。
 */
test('应用启动并渲染主界面', async () => {
  const app = await electron.launch({
    args: [path.resolve(__dirname, '../../../dist-main/index.js')],
    env: { ...process.env, NODE_ENV: 'production' }
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await expect(window.locator('.sidebar-title')).toContainText('Godot Launcher');
  await expect(window.locator('.sidebar-link')).toHaveCount(4);
  await app.close();
});
