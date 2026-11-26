import { defineConfig, devices } from '@playwright/test'

const port = 4180
const baseURL = `http://127.0.0.1:${String(port)}/vue-wysiwyg/`
const isCi = Boolean(process.env['CI'])

export default defineConfig({
  testDir: './e2e',
  testMatch: /demo(-site)?\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  reporter: isCi ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run demo:build && npm run demo:preview -- --host 127.0.0.1',
    url: baseURL,
    reuseExistingServer: !isCi,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 120_000,
  },
})
