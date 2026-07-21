import { test, expect } from "@playwright/test";

/**
 * Critical-path smoke tests. These assert the app boots, the key public routes
 * render, the store/reservation surfaces are present, and the admin area is gated.
 * They are intentionally tolerant of copy changes (brand terms, not exact strings).
 */

test("homepage renders with the brand", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBeLessThan(400);
  await expect(page.locator("body")).toContainText(/Taccalite|Norcineria/i);
});

test("key public routes respond OK", async ({ page }) => {
  for (const path of ["/negozi", "/porchetta", "/blog", "/negozio", "/prenotazioni", "/account", "/privacy", "/cookie"]) {
    const res = await page.goto(path);
    expect(res, `no response for ${path}`).not.toBeNull();
    expect(res!.status(), `status for ${path}`).toBeLessThan(400);
  }
});

test("reservation page shows a form", async ({ page }) => {
  await page.goto("/prenotazioni");
  await expect(page.locator("form")).toHaveCount(1, { timeout: 10_000 }).catch(async () => {
    // At least one form must exist even if there are several.
    await expect(page.locator("form").first()).toBeVisible();
  });
  await expect(page.locator("input, textarea, select").first()).toBeVisible();
});

test("account page exposes the login form when logged out", async ({ page }) => {
  await page.goto("/account");
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
});

test("admin area redirects to login when unauthenticated", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
});

test("sitemap and robots are served", async ({ request }) => {
  expect((await request.get("/sitemap.xml")).status()).toBeLessThan(400);
  expect((await request.get("/robots.txt")).status()).toBeLessThan(400);
  expect((await request.get("/api/health")).status()).toBe(200);
});
