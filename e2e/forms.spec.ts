import { test, expect } from "@playwright/test";
import {
  RUN,
  addToCart,
  choosePickupSlotIfRequired,
  expectNoRawSchemaError,
  expectRowExists,
  login,
  placePickupOrder,
} from "./_helpers";

/**
 * Forms that are actually submitted.
 *
 * `smoke.spec.ts` checks that pages render and that the admin is gated. That is
 * not the same as checking the app *works*, and the gap was not academic: two
 * bugs that made the product unusable — nobody could place an order, nobody
 * could create a product — shipped green through 486 unit tests, 12 of these
 * specs, `tsc`, `eslint` and `next build`, and were caught only by a browser
 * actually pressing the button.
 *
 * Both were shape mismatches between what a browser submits and what the schema
 * expected, which is a class no unit test and no API-level probe can see:
 *
 *  - `FormData.get` returns **null** for an input that is not in the DOM, and the
 *    checkout only renders the address block for delivery/shipping. Zod's
 *    `.optional()` rejects an explicit null, so every pickup order 400'd.
 *  - An unticked checkbox is not submitted **at all**, so its key is absent, and
 *    the shared `checkbox` helper rejected an absent key. A new product starts
 *    with `purchasable` unticked, so it could never be saved.
 *
 * So: every test here presses a real submit button and asserts the record exists
 * afterwards. Keep it that way — a test that only fills a form proves nothing.
 */

test("checkout submits and creates a pickup order", async ({ page }) => {
  // The regression: pickup does not render the address fields, so `address` and
  // `city` arrive as null and the order was refused.
  await addToCart(page);
  await page.goto("/checkout");

  await page.fill('input[name="name"]', "Mario Rossi");
  await page.fill('input[name="email"]', `e2e-${RUN}@example.com`);
  await page.fill('input[name="phone"]', "3391234567");
  // As soon as the shop has one active pickup window, choosing a time becomes
  // mandatory and the submit button goes disabled — so this test's own outcome
  // depends on configuration another spec creates.
  await choosePickupSlotIfRequired(page);

  await page.getByRole("button", { name: /conferma ordine|paga/i }).first().click();

  await expect(page).toHaveURL(/\/checkout\/success\?order=ORD-/, { timeout: 30_000 });
  await expect(page.locator("body")).toContainText(/ORD-/);
  await expectNoRawSchemaError(page);
});

test("choosing shipping asks for an address and blocks submission until it is given", async ({ page }) => {
  // The null tolerance added for pickup must not weaken the rule beside it:
  // someone has to drive to a shipment. The guard here is client-side — the
  // submit button goes disabled and *says what is missing* — so the assertion is
  // that the customer is told, in their own language, rather than that a POST
  // is refused.
  await addToCart(page);
  await page.goto("/checkout");
  await page.fill('input[name="name"]', "Mario Rossi");
  await page.fill('input[name="email"]', `e2e-del-${RUN}@example.com`);

  const shipping = page.getByRole("button", { name: /spedizione|consegna/i }).first();
  if (!(await shipping.count())) test.skip(true, "no delivery/shipping option offered by this shop");
  await shipping.click();

  // The address block is what pickup does not render — the very fields whose
  // absence produced `null` and broke the pickup order.
  for (const field of ["address", "city", "zip"]) {
    await expect(page.locator(`input[name="${field}"]`)).toBeVisible();
  }

  const submit = page.locator('form button[type="submit"]').first();
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveText(/CAP|indirizzo|citt/i);
  await expectNoRawSchemaError(page);
});

test("reservation submits and returns a booking reference", async ({ page }) => {
  await page.goto("/prenotazioni");
  await page.fill('input[name="name"]', "Marco Testa");
  await page.fill('input[name="phone"]', "3387654321");
  await page.fill('input[name="email"]', `e2e-resv-${RUN}@example.com`).catch(() => {});

  // The day and the hour are the app's own pickers now (`components/ui/
  // DateField.tsx`, `SelectField.tsx`) rather than a native `input[type=date]`
  // and a `<select>`, so there is nothing to `fill` or `selectOption`: this is
  // the sequence a customer actually performs. It is also a stronger assertion
  // than the old one — the calendar strikes out the days the sede is shut, so
  // "a day the form will accept" is now something the UI states rather than
  // something the test discovers by trial.
  let booked = false;
  for (let attempt = 0; attempt < 5 && !booked; attempt++) {
    await page.locator("#date").click();
    const openDays = page.locator(".pop-day:not([data-blocked]):not([data-outside])");
    await expect(openDays.first()).toBeVisible();
    const available = await openDays.count();
    // Not the first: that is today, and a table an hour from now is the case
    // most likely to be refused for reasons that have nothing to do with this.
    await openDays.nth(Math.min(attempt + 1, available - 1)).click();

    await page.locator("#time").click();
    const slots = page.locator(".pop-option:not([data-blocked])");
    if (await slots.count()) {
      await slots.first().click();
      booked = true;
    } else {
      await page.keyboard.press("Escape");
    }
  }
  expect(booked).toBe(true);

  await page.getByRole("button", { name: /conferma prenotazione/i }).first().click();

  await expect(page.locator("body")).toContainText(/TAC-[A-Z0-9]+/, { timeout: 30_000 });
  await expectNoRawSchemaError(page);
});

test("registration submits and signs the customer in", async ({ page }) => {
  await page.goto("/account");
  await page.getByRole("button", { name: /registrati/i }).first().click();
  await page.fill('input[name="name"]', "Giulia Verdi");
  await page.fill('input[name="email"]', `e2e-reg-${RUN}@example.com`);
  await page.fill('input[name="password"]', "PasswordSicura123!");
  await page.getByRole("button", { name: /crea account/i }).first().click();

  await expect(page.locator("body")).toContainText(/benvenut/i, { timeout: 30_000 });
  await expectNoRawSchemaError(page);
});

test("newsletter signup submits", async ({ page }) => {
  await page.goto("/newsletter");
  await page.fill('input[type="email"]', `e2e-news-${RUN}@example.com`);
  await page.locator("form").filter({ has: page.locator('input[type="email"]') }).first()
    .getByRole("button").first().click();
  await expect(page.locator("body")).toContainText(/conferma|iscri|grazie/i, { timeout: 30_000 });
  await expectNoRawSchemaError(page);
});

test("admin saves a new product with every checkbox left untouched", async ({ page }) => {
  // The regression, stated exactly: touch no checkbox. `purchasable` and
  // `soldByWeight` start unticked, an unticked box is not submitted, and the
  // form rejected the absent keys — so this is the default path a shopkeeper
  // takes and it could not save.
  await login(page);
  await page.goto("/admin/products/new");

  const name = `E2E Prodotto ${RUN}`;
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="slug"]', `e2e-prodotto-${RUN}`);
  await page.fill('input[name="priceEuros"]', "6.90");

  await page.getByRole("button", { name: /crea prodotto|salva/i }).first().click();
  await page.waitForTimeout(2500);
  await expectNoRawSchemaError(page);

  await expectRowExists(page, "/admin/products", name);
});

test("a product ticked purchasable reaches the public shop", async ({ page }) => {
  // The other direction: ticking still works, and admin content actually lands
  // on the storefront rather than only in the admin list.
  await login(page);
  await page.goto("/admin/products/new");

  const name = `E2E Vendibile ${RUN}`;
  const slug = `e2e-vendibile-${RUN}`;
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="slug"]', slug);
  await page.fill('input[name="priceEuros"]', "7.50");
  await page.fill('input[name="unit"]', "etto").catch(() => {});
  await page.locator('input[name="purchasable"]').first().check();
  await page.getByRole("button", { name: /crea prodotto|salva/i }).first().click();
  await page.waitForTimeout(2500);
  await expectNoRawSchemaError(page);

  const res = await page.goto(`/negozio/${slug}`);
  expect(res?.status()).toBeLessThan(400);
  await expect(page.locator("body")).toContainText(name, { timeout: 20_000 });
});

test("admin saves a new category and a new news article", async ({ page }) => {
  // Same `checkbox` helper, different forms — 22 fields share it, so the failure
  // was latent everywhere an admin could leave a box unticked.
  await login(page);

  const cat = `E2E Categoria ${RUN}`;
  await page.goto("/admin/categories/new");
  await page.fill('input[name="name"]', cat);
  await page.fill('input[name="slug"]', `e2e-categoria-${RUN}`);
  await page.getByRole("button", { name: /crea|salva/i }).first().click();
  await page.waitForTimeout(2000);
  await expectNoRawSchemaError(page);
  await page.goto("/admin/categories");
  await expect(page.locator("body")).toContainText(cat, { timeout: 20_000 });

  const post = `E2E Notizia ${RUN}`;
  await page.goto("/admin/blog/new");
  await page.fill('input[name="title"]', post);
  await page.fill('input[name="slug"]', `e2e-notizia-${RUN}`);
  await page.fill('textarea[name="excerpt"]', "Sommario di prova.");
  await page.fill('textarea[name="content"]', "Corpo della notizia di prova.");
  await page.getByRole("button", { name: /crea|salva|pubblica/i }).first().click();
  await page.waitForTimeout(2000);
  await expectNoRawSchemaError(page);
  await page.goto("/admin/blog");
  await expect(page.locator("body")).toContainText(post, { timeout: 20_000 });
});

test("admin changes an order's status by hand", async ({ page }) => {
  // Depends on an order existing: create one first so the test does not rely on
  // seed data or on another spec having run.
  const orderNumber = await placePickupOrder(page, "Ordine Da Gestire", `e2e-manage-${RUN}@example.com`);

  await login(page);
  await page.goto(`/admin/orders?q=${orderNumber}`);
  await expect(page.locator("body")).toContainText(orderNumber, { timeout: 20_000 });

  // An id-shaped href: `a[href^="/admin/orders/"]` also matches
  // `/admin/orders/new`, which is the first link on the page.
  const detail = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="/admin/orders/"]')]
      .map((a) => a.getAttribute("href")!)
      .find((h) => /^\/admin\/orders\/[A-Za-z0-9_-]{12,}$/.test(h)),
  );
  expect(detail, "no order detail link on the filtered list").toBeTruthy();
  await page.goto(detail!);
  await page.selectOption('select[name="status"]', "fulfilled");
  await page.getByRole("button", { name: /aggiorna ordine|aggiorna|salva/i }).first().click();
  await page.waitForTimeout(2500);
  await expectNoRawSchemaError(page);
  await expect(page.locator("body")).toContainText(/evaso|fulfilled/i, { timeout: 20_000 });
});
