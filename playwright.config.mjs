import { defineConfig, devices } from '@playwright/test';

// Phase 0 prototype verification — drives the static HTML at
// /prototype/iframe-test/parent.html across chromium, firefox, webkit.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 8000',
    port: 8000,
    reuseExistingServer: true,
    timeout: 10000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
