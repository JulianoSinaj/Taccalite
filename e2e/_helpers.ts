import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { E2E_ADMIN } from "../playwright.config";

/**
 * Shared machinery for the specs that submit real forms.
 *
 * Not a `.spec.ts`, so Playwright's default `testMatch` never collects it as a
 * suite. It exists so `forms.spec.ts` and `admin-forms.spec.ts` cannot drift on
 * the two assertions that are easy to get subtly, silently wrong — see
 * `expectRowExists` below.
 */

/**
 * Unique per run: the E2E database persists across runs (`reuseExistingServer`),
 * so a fixed name collides with the previous run's row on the second execution
 * and the failure looks like a broken uniqueness rule rather than a stale DB.
 *
 * The random suffix matters as much as the clock: specs run in parallel workers,
 * each of which imports this module separately, and `Date.now()` is coarse
 * enough that two workers starting together get the same millisecond.
 */
export const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * A stable pseudo-random integer in `[0, mod)`, derived from `RUN`.
 *
 * Some fixtures have to be unique on a *natural* key, not just on a name: the
 * app refuses a second pickup window starting at the same time on the same day,
 * and a closure overlapping one already recorded. Both refusals are correct, and
 * both made a rerun fail against the previous run's own data — the E2E database
 * is reused. Deriving the day and the hour from the run id spreads reruns out
 * instead of hard-coding a slot that is free exactly once.
 */
export function runInt(salt: string, mod: number): number {
  let h = 2166136261;
  for (const ch of `${salt}:${RUN}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.abs(h) % mod;
}

/**
 * The signed-in admin's cookies, cached for the lifetime of this worker process.
 *
 * `/api/auth/login` allows **10 attempts per minute per IP**, and `TRUST_PROXY`
 * is off in the E2E environment — so `clientIp()` is a constant and every worker
 * shares one bucket. One `login()` per admin test therefore starts returning 429
 * around the eleventh, and the failure surfaces as a login that never redirects,
 * which reads as broken auth rather than as the rate limiter doing its job.
 *
 * Caching per worker turns fourteen logins into one or two. It is also closer to
 * how the gestionale is really used: a shopkeeper signs in once a day.
 */
let cachedCookies: Parameters<BrowserContext["addCookies"]>[0] | null = null;

/** Sign in as the throwaway admin the E2E database is seeded with. */
export async function login(page: Page) {
  if (cachedCookies) {
    await page.context().addCookies(cachedCookies);
    await page.goto("/admin");
    // Still valid: the layout renders instead of the 307 to the login page.
    if (!/\/admin\/login/.test(page.url())) return;
    cachedCookies = null;
  }

  await page.goto("/admin/login");
  await page.fill('input[type="text"]', E2E_ADMIN.username);
  await page.fill('input[type="password"]', E2E_ADMIN.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 30_000 });
  cachedCookies = await page.context().cookies();
}

/** Put the first purchasable seeded product in the cart, through the UI. */
export async function addToCart(page: Page) {
  await page.goto("/negozio/ciauscolo-igp");
  await page.getByRole("button", { name: /aggiungi/i }).first().click();
  // The cart lives in localStorage; wait for it to actually hold a line.
  await expect
    .poll(async () => page.evaluate(() => (window.localStorage.getItem("taccalite-cart") ?? "").length), {
      timeout: 15_000,
    })
    .toBeGreaterThan(2);
}

/**
 * Place a pickup order through the storefront and return its `ORD-…` number.
 *
 * Several admin tests need an order to act on. Creating one through the UI each
 * time — rather than reaching for seed data — keeps them independent of which
 * other spec has run and of what the seed happens to contain.
 */
export async function placePickupOrder(
  page: Page,
  customer: string,
  email: string,
  /**
   * Which payment method to tick. Left alone by default, which takes whatever
   * the checkout preselects — under `next dev` with no Stripe keys that is card
   * in **simulate mode**, so the order comes back already `paid`. Pass
   * `in_store` when the test needs an order that still owes money.
   */
  paymentMethod?: "in_store" | "on_delivery" | "card",
): Promise<string> {
  await addToCart(page);
  await page.goto("/checkout");
  await page.fill('input[name="name"]', customer);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="phone"]', "3391234567");
  if (paymentMethod) {
    const radio = page.locator(`input[name="paymentMethod"][value="${paymentMethod}"]`);
    await expect(radio, `the checkout does not offer ${paymentMethod}`).toBeVisible({ timeout: 20_000 });
    await radio.check();
  }
  await choosePickupSlotIfRequired(page);
  await page.getByRole("button", { name: /conferma ordine|paga/i }).first().click();
  await expect(page).toHaveURL(/\/checkout\/success\?order=ORD-/, { timeout: 30_000 });
  return new URL(page.url()).searchParams.get("order")!;
}

/**
 * Assert a record exists by finding the **row link that opens it**, not by
 * searching the page text.
 *
 * `/admin/products?q=<name>` echoes the search term back into the filter chip
 * and the search box, so `toContainText(name)` passes on an empty result set.
 * That is not hypothetical: written that way, the product test went green
 * against the very bug it was added to catch.
 */
export async function expectRowExists(page: Page, listPath: string, name: string) {
  await page.goto(`${listPath}?q=${encodeURIComponent(name)}`);
  const row = page
    .locator(`a[href^="${listPath}/"]`)
    .filter({ hasText: name })
    .filter({ hasNotText: /^nuovo/i });
  await expect(row.first(), `no row linking to a saved "${name}"`).toBeVisible({ timeout: 20_000 });
}

/**
 * Open the record whose row link matches `name` on a list page, and return once
 * its detail page has loaded.
 *
 * Same trap as `expectRowExists`: the href filter is what proves the row is a
 * real result rather than the query echoed back.
 */
export async function openRow(page: Page, listPath: string, name: string) {
  await page.goto(`${listPath}?q=${encodeURIComponent(name)}`);
  const row = page
    .locator(`a[href^="${listPath}/"]`)
    .filter({ hasText: name })
    .filter({ hasNotText: /^nuovo/i });
  await expect(row.first(), `no row linking to a saved "${name}"`).toBeVisible({ timeout: 20_000 });
  await row.first().click();
  await expect(page).toHaveURL(new RegExp(`${listPath}/[A-Za-z0-9_-]+`), { timeout: 20_000 });
}

/**
 * The id-shaped detail links on a list page — the "open this record" anchors,
 * with the `+ Nuovo …` button excluded.
 *
 * `a[href^="/admin/orders/"]` also matches `/admin/orders/new`, which is the
 * first such link on every list, so an unfiltered `.first()` reliably opens the
 * create form instead of the record under test.
 */
export function detailLinks(page: Page, listPath: string): Locator {
  return page.locator(`a[href^="${listPath}/"]:not([href$="/new"])`);
}

/**
 * Assert a filtered list actually returned the record, for the lists whose rows
 * carry no name-bearing link of their own (users, discounts).
 *
 * `expectRowExists` is the better assertion where it applies. Where it does not,
 * the empty-state sentence is the guard against the same trap: a list that found
 * nothing prints "Nessun … corrisponde ai filtri", so requiring its *absence*
 * alongside the name makes the query-echo false positive impossible.
 */
export async function expectListMatch(page: Page, url: string, needle: string, emptyPattern: RegExp) {
  await page.goto(url);
  await expect(page.locator("body"), `the filtered list is empty, so "${needle}" was never saved`).not.toContainText(
    emptyPattern,
    { timeout: 20_000 },
  );
  await expect(page.locator("body")).toContainText(needle, { timeout: 20_000 });
}

/**
 * Expand a `<details>` disclosure by the text of its `<summary>`.
 *
 * Several admin forms — a new pickup window, a new delivery zone, a new
 * campaign — live behind one. A test that fills fields without opening it first
 * silently addresses a *different* form further up the page, because the ids
 * repeat per row.
 */
export async function openDisclosure(page: Page, summaryText: RegExp) {
  const summary = page.locator("summary").filter({ hasText: summaryText }).first();
  await expect(summary).toBeVisible({ timeout: 20_000 });
  const alreadyOpen = await summary.evaluate((el) => !!el.closest("details")?.open);
  if (!alreadyOpen) await summary.click();
  await expect
    .poll(async () => summary.evaluate((el) => !!el.closest("details")?.open), { timeout: 10_000 })
    .toBe(true);
}

/**
 * Zod's own messages are English. Any of them reaching an operator means a field
 * is mis-specified — that is exactly how the checkout failure presented, and how
 * the unticked-checkbox failure presented in the gestionale ("expected
 * nonoptional, received undefined").
 */
export async function expectNoRawSchemaError(page: Page) {
  await expect(page.locator("body")).not.toContainText(/Invalid input|expected string|nonoptional|Required/i);
}

/**
 * Submit a form and wait until the action has genuinely settled, then assert it
 * did not fail.
 *
 * `ActionForm` publishes every result through `toast(result)` — success or
 * failure, on every submission — and `Toasts` gives an error `role="alert"` and
 * a success `role="status"`. So "a toast exists, or the page navigated" is a
 * real completion signal, which a fixed `waitForTimeout` is not: on a cold
 * `next dev` the first hit on a route compiles it, and the sleep that is
 * comfortable on the second run is short on the first.
 *
 * The failure assertion is deliberately separate from "the record exists": an
 * action that is *refused* leaves the DB untouched, so a spec that only looks
 * for a new row reports "not found" and buries the reason the app already
 * printed on screen.
 */
export async function submitAndSettle(page: Page, submit: Locator) {
  const before = page.url();
  // `[data-toast]`, not `[role="status"]`: the list skeletons and the dashboard
  // `loading.tsx` also carry that role and are on screen during the very
  // navigation a submit triggers, so polling the role reports "settled" before
  // the action has run.
  //
  // And a *new* toast, not any toast: the previous action's confirmation is
  // still on screen for several seconds, so "a toast exists" was satisfied
  // before this submission had answered — which made the check silently
  // vacuous for every test that saves twice.
  const idsOf = () => page.locator("[data-toast-id]").evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-toast-id")!),
  );
  const seen = new Set(await idsOf());

  await submit.click();

  // A guarded control (Rimborsa, Elimina, Sospendi tutte) does not submit on the
  // first click: `PendingButton` intercepts it and mounts a <dialog>, because
  // `window.confirm` is suppressed outright once a user ticks "prevent
  // additional dialogs" — which would turn a guarded action unguarded. Confirm
  // it here so callers do not each reimplement the two-step. The dialog's own
  // confirm button echoes the trigger's label, so it is addressed by position
  // (Annulla first) rather than by name.
  const dialog = page.locator("dialog[open]");
  if (await dialog.count()) {
    await dialog.locator("button").last().click();
  }

  await expect
    .poll(async () => page.url() !== before || (await idsOf()).some((id) => !seen.has(id)), {
      timeout: 60_000,
    })
    .toBe(true);

  const errors = page.locator('[data-toast="error"]');
  if (await errors.count()) {
    expect(await errors.first().innerText(), "the action was refused").toBe("");
  }
  await expect(page.locator("[data-field-error]")).toHaveCount(0);
  await expectNoRawSchemaError(page);
}

/**
 * Pick a pickup window at the checkout, when the shop has any.
 *
 * Not optional politeness: **as soon as one active window exists, choosing a
 * time becomes mandatory** and the submit button goes disabled, relabelled
 * "Scegli un orario di ritiro." So a suite that creates a window in one test
 * silently breaks every checkout in every other one — which is exactly what
 * happened, and it would have broken `forms.spec.ts` too. Handling both
 * configurations here keeps the order specs honest whether or not the shop has
 * been configured.
 *
 * The control is the app's own `SelectField`, not a native `<select>`, so there
 * is nothing to `selectOption`: open the panel and take the first free option.
 */
export async function choosePickupSlotIfRequired(page: Page) {
  const picker = page.locator("#pickupSlot");
  if (!(await picker.count())) return;
  await picker.click();
  const options = page.locator(".pop-option:not([data-blocked])");
  await expect(options.first(), "a pickup window is required but none is selectable").toBeVisible({
    timeout: 20_000,
  });
  await options.first().click();
}
