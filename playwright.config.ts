import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration for the SignMaster React + Vite app.
 *
 * Chromium is the primary (and only) browser for now; the Firefox/WebKit
 * cross-browser matrix described in ARCHITECTURE.md is intentionally deferred.
 * Desktop (~1280px) and mobile (~375px) viewports mirror the `xl` and `xs`
 * breakpoints from tailwind.config.js and the responsive testing guidance in
 * ARCHITECTURE.md.
 */

const PORT = 4200
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
