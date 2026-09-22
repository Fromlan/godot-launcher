import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
    launchOptions: {
      args: ['--no-sandbox']
    }
  },
  projects: [
    {
      name: 'electron',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
