import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testMatch: '*.e2e.ts',
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  use: {
    channel: !process.env.CI ? 'chrome' : undefined,
    viewport: { width: 1280, height: 720 },
  },
};
export default config;
