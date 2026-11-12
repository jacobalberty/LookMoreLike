import { defineConfig, devices } from '@playwright/test'

// End-to-end tests drive a real beenfard (BEENFARD_BIN) through a small
// reverse proxy that serves dist/ (npm run build first). See e2e/stack.ts.
// SCREENSHOT_DIR=docs/screenshots also writes a screenshot of each screen.
const screenshots = !!process.env.SCREENSHOT_DIR

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        // Screenshots a person will see are taken at twice the pixel density.
        deviceScaleFactor: screenshots ? 2 : 1,
      },
    },
  ],
})
