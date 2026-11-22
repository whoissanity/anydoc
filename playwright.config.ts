// DEV-ONLY Playwright configuration for E2E smoke + visual regression tests.
// Not mirrored to anydoc/ (deployment tree).
// Run: npx playwright test
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Pin the port explicitly: an inherited PORT env var would otherwise make Next.js
    // pick a random port that this url never sees.
    command: "npx next dev --turbopack -p 3000",
    url: "http://localhost:3000/editor",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PORT: "3000" },
  },
});
