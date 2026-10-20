import { defineConfig, devices } from '@playwright/test'

const e2ePortValue = process.env.SONIVO_E2E_PORT ?? '5173'
if (!/^\d{1,5}$/.test(e2ePortValue) || Number(e2ePortValue) < 1 || Number(e2ePortValue) > 65535) {
  throw new Error('SONIVO_E2E_PORT must be a valid TCP port.')
}
const e2ePort = Number(e2ePortValue)

/**
 * Full-stack E2E against real React → API → PostgreSQL.
 * Prerequisites: Postgres up, migrations applied, API on 5171, Next on 5173
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
  // the Next dev server so the suite is self-contained locally; in CI the
  // already-running server is reused.
  webServer: {
    command: `node ../../node_modules/next/dist/bin/next dev --port ${e2ePort}`,
    cwd: '../web/apps/app',
    url: `http://127.0.0.1:${e2ePort}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: process.env.SONIVO_E2E_BASE_URL ?? `http://localhost:${e2ePort}`,
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
