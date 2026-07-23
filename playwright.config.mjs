import { defineConfig, devices } from '@playwright/test';

const desktopTests = /^(?!.*mobile).*\.spec\.mjs$/;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
  projects: [
    { name: 'chromium', testMatch: desktopTests, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testMatch: desktopTests, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testMatch: desktopTests, use: { ...devices['Desktop Safari'] } },
    {
      name: 'mobile-chrome',
      testMatch: /mobile\.spec\.mjs$/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-safari',
      testMatch: /mobile\.spec\.mjs$/,
      use: { ...devices['iPhone 14'] },
    },
  ],
});
