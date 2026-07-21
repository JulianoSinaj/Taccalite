import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config. Boots the app against a throwaway seeded SQLite DB (so a
 * test run never touches dev/prod data) and drives the critical public flows.
 *
 * Run: `npm run test:e2e` (first time: `npx playwright install chromium`).
 */
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Seed a dedicated E2E database, then start the dev server (which auto-migrates).
    command: "npm run db:seed && npm run dev -- -p 3100",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NODE_ENV: "development",
      DATABASE_URL: "./.pw-tmp/e2e.db",
      RUN_MIGRATIONS_ON_BOOT: "1",
      NEXT_PUBLIC_SITE_URL: BASE_URL,
    },
  },
});
