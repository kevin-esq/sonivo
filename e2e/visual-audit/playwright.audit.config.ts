import { defineConfig, devices } from '@playwright/test'

/**
 * Visual/UX audit harness (FASE 2 of the UI/UX audit).
 *
 * Separate from e2e/playwright.config.ts on purpose: this suite is NOT a
 * regression gate and must not run in CI. It navigates every flow, captures
 * screenshots at three viewports and collects a11y + layout evidence into
 * `../.visual-audit/<project>/`.
 *
 * Prerequisites: Postgres up, API on 5171 with `Auth__EnableTestHook=true`,
 * web build served on 5173 (see README.md in this folder).
 */
const OUT = 'audit-output'

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: `${OUT}/results.json` }]],
  outputDir: `${OUT}/artifacts`,
  use: {
    baseURL: process.env.SONIVO_E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    locale: 'es-ES',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 834, height: 1112 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
})
