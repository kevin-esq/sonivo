import { defineConfig, devices } from '@playwright/test'

/**
 * Full-stack E2E against real React → API → PostgreSQL.
 * Prerequisites: Postgres up, migrations applied, API on 5171, Vite on 5173
 * (CI starts these; locally see README).
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // The API (5171) is external (started by the developer/CI). Playwright owns
  // the Vite dev server so the suite is self-contained locally; in CI the
  // already-running server is reused.
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    cwd: '../web/sonivo-web',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: process.env.SONIVO_E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
