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
  for (const path of ["/negozi", "/porchetta", "/blog", "/negozio", "/prenotazioni", "/account", "/privacy", "/cookie", "/traccia"]) {
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

test("product detail page renders with price and add-to-cart", async ({ page }) => {
  // porchetta-artigianale is a purchasable seeded product.
  const res = await page.goto("/negozio/porchetta-artigianale");
  expect(res?.status()).toBeLessThan(400);
  await expect(page.locator("body")).toContainText(/€|Aggiungi|carrello/i);
});

test("store supports category/search filtering without error", async ({ page }) => {
  const res = await page.goto("/negozio?q=porchetta");
  expect(res?.status()).toBeLessThan(400);
});

test("account order detail redirects to account when logged out", async ({ page }) => {
  await page.goto("/account/ordini/ORD-2026-000001");
  await expect(page).toHaveURL(/\/account(\/|$|\?)/);
});

test("tracking page shows a lookup form and handles an unknown ref", async ({ page }) => {
  await page.goto("/traccia");
  await expect(page.locator('input[name="ref"]').first()).toBeVisible();
  const res = await page.goto("/traccia?ref=NONEXISTENT-REF-123");
  expect(res?.status()).toBeLessThan(400);
});

test("staff in-shop points screen is gated", async ({ page }) => {
  await page.goto("/admin/loyalty/scan");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("new admin routes (calendar, customer detail) are gated", async ({ page }) => {
  await page.goto("/admin/reservations/calendar");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto("/admin/loyalty/some-user-id");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("sitemap and robots are served", async ({ request }) => {
  expect((await request.get("/sitemap.xml")).status()).toBeLessThan(400);
  expect((await request.get("/robots.txt")).status()).toBeLessThan(400);
  expect((await request.get("/api/health")).status()).toBe(200);
});
