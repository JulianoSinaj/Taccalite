import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config. Boots the app against a throwaway seeded SQLite DB (so a
 * test run never touches dev/prod data) and drives the critical public flows.
 *
 * Run: `npm run test:e2e` (first time: `npx playwright install chromium`).
 */
/**
 * `reuseExistingServer` is on locally, so Playwright adopts whatever is already
 * answering on this port — and it does not check that the thing answering is
 * *this* app. A different Next project parked on 3100 therefore swallows the
 * whole suite: every spec runs against that site and fails on content it has
 * never heard of, which reads as 20 broken tests rather than a port clash.
 * Overridable so a machine running several apps can move the suite out of the
 * way: `E2E_PORT=3123 npm run test:e2e`.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

/** The throwaway admin the E2E database is seeded with. Imported by the specs so
 *  the credentials are stated once. Never a real deployment's admin. */
export const E2E_ADMIN = { username: "e2e-admin", password: "e2e-admin-password" };

export default defineConfig({
  testDir: "./e2e",
  // The suite runs against `next dev`, which compiles each route on first hit —
  // an admin form that navigates through three routes can spend most of a minute
  // waiting on the compiler, with nothing wrong. At the 30s default that showed
  // up as tests failing intermittently depending on which worker warmed which
  // route first. Generous here costs nothing on a green run.
  timeout: 120_000,
  expect: { timeout: 20_000 },
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
    command: `npm run db:seed && npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NODE_ENV: "development",
      DATABASE_URL: "./.pw-tmp/e2e.db",
      RUN_MIGRATIONS_ON_BOOT: "1",
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      // Pinned, not inherited. `scripts/_bootstrap-env.ts` loads `.env` now, so
      // without these the seeded admin password would be whatever the developer
      // happens to have locally — and the built-in default on CI, where no `.env`
      // exists. Set here, the value is identical in both places and the admin
      // tests below can log in. `loadEnvFile` never overwrites an existing
      // variable, so these win over `.env`.
      ADMIN_USERNAME: E2E_ADMIN.username,
      ADMIN_PASSWORD: E2E_ADMIN.password,
      // A relay that refuses instantly, so transactional mail is *attempted and
      // failed* rather than left queued.
      //
      // This is the one place local and CI diverged and it cost a red build:
      // with no SMTP_HOST at all the mailer never sends, so rows sit `queued`
      // and `/admin/outbox?stato=failed` is empty — while the developer's `.env`
      // points at a real relay with blank credentials, which rejects, so locally
      // every row is `failed`. The outbox spec passed here and failed there.
      // Port 1 gets an immediate ECONNREFUSED, so nothing waits on a timeout and
      // nothing leaves the machine.
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1",
    },
  },
});
