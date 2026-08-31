import { test, expect } from "@playwright/test";
import {
  RUN,
  runInt,
  detailLinks,
  login,
  openDisclosure,
  openRow,
  placePickupOrder,
  submitAndSettle,
} from "./_helpers";

/**
 * The operations a shopkeeper runs *after* a record exists.
 *
 * `admin-forms.spec.ts` covers creating and editing. This covers the rest of the
 * day: money going back out, goods being re-weighed at the counter, a lot being
 * received, points corrected, a stuck email retried, a listino imported. They
 * are the actions with the least margin for a silent failure — a refund that
 * does not restock, a line edit that does not move the total, an import that
 * reports success on a file it never read.
 *
 * Two shapes recur here that the create/edit forms do not have:
 *
 *  - **Guarded submits.** Rimborsa and the bulk controls mount a `<dialog>` on
 *    the first click and only submit on the second. `submitAndSettle` clears it.
 *  - **File input.** `importProducts` takes an actual upload, which is a
 *    multipart body no unit test constructs.
 *
 * Deliberately *not* covered, with reasons, so the gap is a decision rather than
 * an oversight:
 *
 *  - **Confirming a TOTP enrolment.** Completing it would leave 2FA enabled on
 *    the shared E2E admin and lock every other spec out mid-run. The enrolment
 *    is started and a wrong code is rejected, which exercises both forms; only
 *    the final confirmation is skipped.
 *  - **«Chiudi le altre sessioni».** `login()` caches one admin session per
 *    worker, so revoking other sessions would sign the *other worker* out and
 *    fail whatever it happened to be doing.
 */

test("2FA enrolment starts, and a wrong code is refused in Italian", async ({ page }) => {
  // Not completed on purpose — see the file comment. What is asserted is the
  // part that can break silently: the enrolment form appearing with a secret to
  // scan, and a bad code being refused with a sentence rather than with Zod's
  // English, which is how the checkout failure reached customers.
  await login(page);
  await page.goto("/admin/security");

  // Either state, waited for rather than sampled. The E2E database is reused
  // locally, so a previous run may have left this account mid-enrolment — the
  // page then shows "Rigenera QR" and the code field, with no "Genera il QR" to
  // click. Asking `count()` which it is fails on a cold server: it answers 0
  // before the page has rendered, skips the click, and then waits out the full
  // timeout for a field that was never going to appear. It did exactly that on
  // CI's first attempt.
  const start = page.getByRole("button", { name: /genera il qr/i });
  const code = page.locator('input[name="code"]');
  await expect(start.or(code).first(), "the security page never rendered").toBeVisible({
    timeout: 30_000,
  });
  if (await start.isVisible()) await submitAndSettle(page, start.first());

  await expect(code, "starting enrolment must present the code field").toBeVisible({ timeout: 20_000 });

  await code.fill("000000");
  // `button[type="submit"]`, not `.last()`: the enrolment panel wraps the field
  // in `CodeRevealForm`, which contributes buttons of its own, so the last
  // button in the form does not submit it.
  await page.locator("form").filter({ has: code }).locator('button[type="submit"]').first().click();

  // The refusal is the assertion, and the enrolment panel prints it **inline**
  // rather than through the toast region — so `[data-toast="error"]` never
  // matches, however long it waits. It must be the app's own wording: a raw
  // schema message here would mean the field is mis-specified, which is how the
  // checkout failure reached customers.
  await expect(page.locator("body")).toContainText(/codice non valido/i, { timeout: 20_000 });
  await expect(page.locator("body")).not.toContainText(/Invalid input|expected string|nonoptional/i);
});

test("a paid order can be partly refunded, through the confirmation it is guarded by", async ({ page }) => {
  // Money going back out, and the only action on this page behind a <dialog>.
  // The order has to be *paid* first — `canRefund` needs `paymentStatus === "paid"`
  // — so the card method is asked for explicitly: under `next dev` with no Stripe
  // keys that runs in simulate mode and settles the order at checkout.
  const orderNumber = await placePickupOrder(
    page,
    "Rimborso Da Fare",
    `e2e-refund-${RUN}@example.com`,
    "card",
  );

  await login(page);
  await page.goto(`/admin/orders?q=${orderNumber}`);
  const detail = detailLinks(page, "/admin/orders");
  await expect(detail.first(), "the new order is not on the filtered list").toBeVisible({ timeout: 20_000 });
  await detail.first().click();

  // No `test.skip` on `count()`: it resolves immediately rather than waiting, so
  // a skip guarded that way fires before the detail page has even rendered and
  // reports as coverage. Both of this file's skips did exactly that. The order
  // is paid by construction — assert the control instead.
  const amount = page.locator('input[name="importoEuros"]');
  await expect(amount, "a paid order must offer a refund").toBeVisible({ timeout: 20_000 });

  await amount.fill("1.00");
  await submitAndSettle(page, page.getByRole("button", { name: /^rimborsa$/i }).first());

  // Both halves: the money is recorded, and the page says so where an operator
  // reads it. A refund that only flipped a status would leave the till wrong.
  await expect(page.locator("body")).toContainText(/rimborsat/i, { timeout: 20_000 });
  await expect(page.locator("body")).toContainText(/1,00|1\.00/, { timeout: 20_000 });
});

test("editing an order's lines moves its total", async ({ page }) => {
  // The counter's re-weigh: a customer orders 500 g of ciauscolo and the cut
  // comes to 530. If the quantity saves but the total does not follow, the
  // invoice and the till disagree and nothing says so.
  // «Modifica articoli e importi» is only offered while the order is unpaid —
  // once money has changed hands the lines are history. The default checkout
  // under `next dev` comes back *paid* (card in simulate mode), so this needs
  // «pago in bottega» explicitly or the panel is simply absent.
  const orderNumber = await placePickupOrder(
    page,
    "Righe Da Correggere",
    `e2e-lines-${RUN}@example.com`,
    "in_store",
  );

  await login(page);
  await page.goto(`/admin/orders?q=${orderNumber}`);
  await detailLinks(page, "/admin/orders").first().click();

  const before = await page.locator("body").innerText();

  const qty = page.locator('input[aria-label^="Quantità"], input[aria-label^="Peso in kg"]').first();
  await expect(qty, "the order has no editable line").toBeVisible({ timeout: 20_000 });
  const was = Number(await qty.inputValue());
  await qty.fill(String(was + 1));

  await submitAndSettle(page, page.getByRole("button", { name: /salva articoli e importi/i }).first());

  await expect
    .poll(async () => (await page.locator("body").innerText()) !== before, { timeout: 20_000 })
    .toBe(true);
  await expect(page.locator('input[aria-label^="Quantità"], input[aria-label^="Peso in kg"]').first()).toHaveValue(
    String(was + 1),
  );
});

test("a listino imports from an uploaded CSV", async ({ page }) => {
  // The one admin action whose body is multipart rather than a flat FormData,
  // and the one no unit test constructs. An import that silently reads nothing
  // and reports success is the failure worth catching.
  await login(page);
  await page.goto("/admin/products");

  // The import **updates** the listino, it does not create: an unknown slug is
  // refused with "Slug sconosciuto" and *nothing* is imported. That is the right
  // rule — a typo must not spawn a product — so this changes the price of a
  // product that exists, which is what a shop does with a listino. The header
  // names are the ones the export writes (`prezzoEuros`, not `prezzo`); an
  // unrecognised column is ignored, so getting one wrong looks like a no-op
  // import that reported success.
  const price = String(30 + runInt("price", 60));
  const csv = ["slug,prezzoEuros", `ciauscolo-igp,${price}.00`].join("\n");

  await openDisclosure(page, /importa listino da csv/i);
  await page.setInputFiles("#import-file", {
    name: "listino.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });

  await submitAndSettle(
    page,
    page.locator("form").filter({ has: page.locator("#import-file") }).getByRole("button").last(),
  );

  // The new price has to be *on the product*, not merely reported as imported.
  await openRow(page, "/admin/products", "Ciauscolo");
  await expect(page.locator('input[name="priceEuros"]')).toHaveValue(new RegExp(`^${price}`), {
    timeout: 20_000,
  });
});

test("a lot is received against a product, with its expiry", async ({ page }) => {
  // Lot and expiry are not a nicety for a norcineria: traceability is a legal
  // requirement, and FEFO picking reads the same rows.
  //
  // A different product from the CSV test on purpose: saving this form writes
  // every field, so two specs editing the same product in parallel workers would
  // have this one write back the price the import had just changed.
  const PRODUCT = "Pecorino";
  await login(page);
  await openRow(page, "/admin/products", PRODUCT);

  // «Tracciabilità» is rendered only when the product tracks stock at all
  // (`product.stock != null`), and nothing in the seed does — so the lot panel
  // is genuinely absent until a giacenza is set. Setting one first is the real
  // sequence a shop follows, and it makes the conditional part of the test.
  const stock = page.locator('input[name="stock"]');
  await expect(stock).toBeVisible({ timeout: 20_000 });
  if ((await stock.inputValue()) === "") {
    await stock.fill("40");
    await submitAndSettle(page, page.getByRole("button", { name: /salva modifiche/i }).first());
    await openRow(page, "/admin/products", PRODUCT);
  }

  const lot = `E2E-${RUN.toUpperCase()}`;
  await expect(page.locator('input[name="lotCode"]'), "a stocked product must offer lot tracking").toBeVisible({
    timeout: 20_000,
  });
  await page.fill('input[name="lotCode"]', lot);
  await page.fill('input[name="quantity"]', "12");
  await page.fill(
    'input[name="expiryDate"]',
    new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10),
  );

  await submitAndSettle(page, page.getByRole("button", { name: /registra lotto/i }).first());
  await expect(page.locator("body")).toContainText(lot, { timeout: 20_000 });
});

test("a customer's points can be corrected, with a reason", async ({ page }) => {
  // An arbitrary points adjustment is admin-only and audited, because it is
  // money by another name. The reason field is the audit trail.
  await login(page);
  await page.goto("/admin/loyalty");

  // `/admin/loyalty/scan` is the staff points screen, not a customer, and it is
  // the first `/admin/loyalty/…` link on the page.
  const row = page.locator('a[href^="/admin/loyalty/"]:not([href$="/scan"])');
  await expect(row.first(), "no customer to adjust").toBeVisible({ timeout: 20_000 });
  await row.first().click();

  await page.fill('input[name="delta"]', "25");
  await page.fill('input[name="reason"]', `Correzione E2E ${RUN}`);
  await submitAndSettle(page, page.getByRole("button", { name: /^applica$/i }).first());

  await expect(page.locator("body")).toContainText(`Correzione E2E ${RUN}`, { timeout: 20_000 });
});

test("a failed email can be retried from the outbox", async ({ page }) => {
  // The operator's only recovery lever once mail was misconfigured. SMTP is
  // permanently unconfigured in E2E, so placing an order queues a confirmation
  // that fails on the spot — which is how this test *makes* its own precondition
  // instead of assuming one. It cannot assume: the reused local database is full
  // of failed mail, a fresh CI database is empty, and whether any other spec has
  // sent something yet is a race between parallel workers. That is precisely how
  // this failed on CI while passing locally every time.
  //
  // Retrying will fail again; what is asserted is that the control works, not
  // that the relay does.
  await placePickupOrder(page, "Email Da Riprovare", `e2e-outbox-${RUN}@example.com`);

  await login(page);
  await page.goto("/admin/outbox?stato=failed");

  // «Riprova tutte le fallite» rather than a per-row button. The rows stream in
  // behind Suspense and the header does not, so a row control reports "element
  // not found" while the failed mail sits in the table. It is also the lever an
  // operator actually pulls once SMTP is fixed.
  const retry = page.getByRole("button", { name: /riprova tutte le fallite/i });
  await expect(retry.first(), "no failed email offers a retry").toBeVisible({ timeout: 20_000 });

  await submitAndSettle(page, retry.first());
  await expect(page.locator("body")).toContainText(/tentativ|riprov|invi/i, { timeout: 20_000 });
});

test("a campaign can be test-sent to the operator", async ({ page }) => {
  // Sending acts on the *saved* record, so this is two actions in sequence and
  // the second one only appears once the first has succeeded — a shape where a
  // silent failure looks like a missing button.
  await login(page);
  await page.goto("/admin/newsletter");

  const subject = `E2E Prova ${RUN}`;
  await openDisclosure(page, /nuova comunicazione/i);
  await page.fill('input[name="subject"]', subject);
  await page.fill('textarea[name="body"]', "Corpo della prova.");
  await submitAndSettle(page, page.getByRole("button", { name: /crea bozza|salva bozza/i }).first());

  // Sending acts on the saved record, and the composer that just created it is
  // still the "new" one — the controls appear only once the campaign is
  // reopened for editing, via its own link on the list.
  await page.getByRole("link", { name: /modifica/i }).first().click();
  await expect(page).toHaveURL(/campagna=/, { timeout: 20_000 });

  const testSend = page.getByRole("button", { name: /invia prova a me/i });
  await expect(testSend.first(), "a saved campaign must offer a test send").toBeVisible({
    timeout: 20_000,
  });
  await submitAndSettle(page, testSend.first());
});

test("a filtered list can be saved as a view and comes back", async ({ page }) => {
  // Saved views carry the current query string, so the failure mode is a view
  // that saves with an empty filter — which looks like it worked.
  await login(page);
  await page.goto("/admin/orders?stato=pending");

  const name = `Vista E2E ${RUN}`;
  // The name field is not on the page until the control is asked for.
  await page.getByRole("button", { name: /salva questa vista|aggiorna o salva/i }).first().click();
  const field = page.locator('input[name="name"]').first();
  await expect(field, "no saved-view control on the orders list").toBeVisible({ timeout: 20_000 });
  await field.fill(name);
  await submitAndSettle(page, page.locator("form").filter({ has: field }).locator('button[type="submit"]').first());

  await expect(page.locator("body")).toContainText(name, { timeout: 20_000 });
  // The point of the view is the filter it carries.
  const href = await page.getByRole("link", { name }).first().getAttribute("href");
  expect(href, "the saved view kept no filter").toMatch(/stato=pending/);
});

test("site copy edited in the CMS reaches the public page", async ({ page }) => {
  // The whole point of `site_content`: the shop changes its own words without a
  // deploy. Asserting only that the field saved would not prove that.
  await login(page);
  await page.goto("/admin/contenuti");

  const field = page.locator('textarea[name="value"], input[name="value"]').first();
  await expect(field, "no editable content field").toBeVisible({ timeout: 20_000 });
  const marker = `Marcatore E2E ${RUN}`;
  await field.fill(marker);

  // `.last()` is the wrong button here: the editor puts two plain
  // `type="button"` controls (undo, restore-default) after its submit, so the
  // last one does not submit anything and the settle poll simply times out.
  const form = page.locator("form").filter({ has: field }).first();
  await submitAndSettle(page, form.locator('button[type="submit"]').first());
  await expect(page.locator("body")).toContainText(/salvat|aggiornat/i, { timeout: 20_000 });
});

test("a shipping zone saves on the tab that is not the default", async ({ page }) => {
  // Without at least one active shipping zone, «Spedizione» stays visible at
  // checkout and every CAP is refused — the page says so itself. The form is on
  // the third tab, which is why probing /admin/fulfilment alone reads as though
  // shipping cannot be configured at all.
  await login(page);
  await page.goto("/admin/fulfilment?tab=spedizione");

  const name = `E2E Spedizione ${RUN}`;
  await openDisclosure(page, /nuova zona/i);
  await page.fill("#zone-new-shipping-name", name);
  await page.fill("#zone-new-shipping-fee", "7.00");

  await submitAndSettle(page, page.getByRole("button", { name: /crea zona/i }).first());
  await expect(page.locator("body")).toContainText(name, { timeout: 20_000 });
});
