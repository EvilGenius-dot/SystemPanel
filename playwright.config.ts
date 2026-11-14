import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: 'validation/playwright',
  use: { baseURL: 'http://127.0.0.1:1420', channel: process.env.CI ? undefined : 'chrome', viewport: { width: 440, height: 800 }, reducedMotion: 'reduce', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:1420', reuseExistingServer: !process.env.CI },
});
