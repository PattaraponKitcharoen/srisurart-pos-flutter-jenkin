import { defineConfig } from '@playwright/test';

// Lab 05 — API end-to-end suite against the stack in docker-compose.e2e.yml.
// Headless by construction: every spec drives the HTTP API through `request`, no browser.
export default defineConfig({
  testDir: './tests',
  // One shop, provisioned once by the `setup` project, is shared by the specs; they
  // run one at a time so their stock and product counts cannot interleave.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ['list'],
    ['junit', { outputFile: 'results/junit.xml' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.API_BASE_URL ?? 'http://127.0.0.1:3000',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    { name: 'api', testMatch: /.*\.spec\.ts/, dependencies: ['setup'] },
  ],
});
