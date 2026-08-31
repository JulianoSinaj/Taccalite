import { test, expect } from "@playwright/test";
import {
  RUN,
  runInt,
  detailLinks,
  expectListMatch,
  expectRowExists,
  login,
  openDisclosure,
  openRow,
  placePickupOrder,
  submitAndSettle,
} from "./_helpers";

/**
 * The rest of the gestionale's forms, actually submitted.
 *
 * `forms.spec.ts` covers the two shapes that shipped as total blockers. This
 * file covers the surfaces they were *latent* in but nobody had driven: 120
 * server actions read a `FormData`, and nine of them were pressed by a browser.
 *
 * Three shapes are tested here, all of them invisible to a unit test:
 *
 *  1. **Unticking.** The create forms default their toggles to ticked
 *     (`?? true`), so a *new* discount, closure or zone always submits the key.
 *     The absent-key failure therefore survives on the **edit** path — untick a
 *     box that was on, and the key vanishes exactly as it did for a new product.
 *     Nothing in the suite had ever unticked anything.
 *  2. **Conditional fields.** `UserForm` renders `shopSlug` only for a staff
 *     account, `ReservationForm` renders `guests` only for a table and
 *     `quantityKg` only for porchetta, `DiscountForm` drops `value` for free
 *     shipping, and `ManualOrderForm` reveals `paidWith` only once the sale is
 *     marked paid. Each is the checkout's bug in a different form: the field
 *     that is not in the DOM is the one that breaks the submit.
 *  3. **The money path.** Registering an incasso is the action a shopkeeper
 *     performs most and the one that lands on a fiscal document.
 *
 * Every test presses a real submit button and asserts the record exists or the
 * state changed afterwards. `submitAndSettle` additionally fails on the action
 * *being refused*, so a broken form reports its own reason rather than a
 * mystery "row not found".
 */

test("unticking a toggle on an existing record actually turns it off", async ({ page }) => {
  // The half of the checkbox bug the suite never exercised. A new discount ships
  // «Attivo» ticked, so creating one proves nothing about the absent key — only
  // turning it off does, and that is the operator's ordinary way to retire a
  // code without deleting its redemption history.
  await login(page);
  const code = `E2E${RUN.replace(/-/g, "").toUpperCase()}`;

  await page.goto("/admin/discounts/new");
  await page.fill('input[name="code"]', code);
  await page.selectOption('select[name="type"]', "percent");
  await page.fill('input[name="value"]', "10");
  await submitAndSettle(page, page.getByRole("button", { name: /crea codice/i }).first());
  await expectListMatch(page, `/admin/discounts?q=${code}`, code, /nessun codice/i);

  const edit = detailLinks(page, "/admin/discounts");
  await expect(edit, "the q filter did not narrow to the new code").toHaveCount(1);
  await edit.first().click();
  // Wait for the detail page. Without this the assertions below resolve against
  // the *list*, whose per-row Attiva/Disattiva form carries a hidden input also
  // named `active` — the locator finds it instantly, so nothing waits and the
  // failure reads "Not a checkbox" instead of "you never navigated".
  await expect(page).toHaveURL(/\/admin\/discounts\/[A-Za-z0-9_-]+/, { timeout: 20_000 });

  const active = page.locator('input[type="checkbox"][name="active"]');
  await expect(active).toBeChecked();
  await active.uncheck();
  await submitAndSettle(page, page.getByRole("button", { name: /salva codice/i }).first());

  await page.goto(`/admin/discounts?q=${code}`);
  await detailLinks(page, "/admin/discounts").first().click();
  await expect(page).toHaveURL(/\/admin\/discounts\/[A-Za-z0-9_-]+/, { timeout: 20_000 });
  await expect(
    page.locator('input[type="checkbox"][name="active"]'),
    "unticking «Attivo» did not persist",
  ).not.toBeChecked();
});

test("a free-shipping code saves without the value field that type never renders", async ({ page }) => {
  // `value` is dropped from the DOM for free shipping — the same shape as the
  // checkout's missing address block, in the form an operator reaches for when
  // running a delivery promotion.
  await login(page);
  const code = `E2ESPED${RUN.replace(/-/g, "").toUpperCase()}`;

  await page.goto("/admin/discounts/new");
  await page.fill('input[name="code"]', code);
  await page.selectOption('select[name="type"]', "free_shipping");
  await expect(page.locator('input[name="value"]'), "free shipping should not ask for a value").toHaveCount(0);

  await submitAndSettle(page, page.getByRole("button", { name: /crea codice/i }).first());
  await expectListMatch(page, `/admin/discounts?q=${code}`, code, /nessun codice/i);
});

test("a customer account saves without the staff-only shop field", async ({ page }) => {
  // `shopSlug` is rendered only for role=staff. A customer account is the common
  // case and submits with the key absent entirely.
  await login(page);
  const username = `e2e.cliente.${RUN}`.replace(/-/g, ".");
  const name = `E2E Cliente ${RUN}`;

  await page.goto("/admin/users/new");
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="name"]', name);
  await page.selectOption('select[name="role"]', "customer");
  await expect(page.locator('select[name="shopSlug"]'), "a customer has no location to confine").toHaveCount(0);
  await page.fill('input[name="password"]', "PasswordSicura123!");

  await submitAndSettle(page, page.getByRole("button", { name: /crea utente/i }).first());
  await expectListMatch(page, `/admin/users?q=${encodeURIComponent(username)}`, username, /nessun account/i);
});

test("a staff account saves with the shop field its role reveals", async ({ page }) => {
  // The other side: choosing staff mounts `shopSlug`, and the value has to
  // survive the round trip — a staff member pinned to the wrong counter sees the
  // wrong orders, which is a scoping bug, not a cosmetic one.
  await login(page);
  const username = `e2e.staff.${RUN}`.replace(/-/g, ".");

  await page.goto("/admin/users/new");
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="name"]', `E2E Staff ${RUN}`);
  await page.selectOption('select[name="role"]', "staff");

  const shop = page.locator('select[name="shopSlug"]');
  await expect(shop, "picking staff must reveal the location field").toBeVisible();
  const slug = await shop.locator("option").nth(1).getAttribute("value");
  await shop.selectOption(slug!);
  await page.fill('input[name="password"]', "PasswordSicura123!");

  await submitAndSettle(page, page.getByRole("button", { name: /crea utente/i }).first());
  await expectListMatch(page, `/admin/users?q=${encodeURIComponent(username)}`, username, /nessun account/i);
});

test("registering an incasso settles the order and records the instrument", async ({ page }) => {
  // The action a shopkeeper runs most, and the one the fattura's
  // `ModalitaPagamento` is derived from: the same "pago al ritiro" order is
  // MP01 in contanti and MP08 on the POS, so the instrument is not decoration.
  // Explicitly «pago in bottega»: under `next dev` with no Stripe keys the
  // checkout preselects card in simulate mode, which comes back already paid —
  // and a settled order has nothing to settle, so the panel never renders.
  const orderNumber = await placePickupOrder(
    page,
    "Incasso Da Registrare",
    `e2e-incasso-${RUN}@example.com`,
    "in_store",
  );

  await login(page);
  await page.goto(`/admin/orders?q=${orderNumber}`);
  const detail = detailLinks(page, "/admin/orders");
  await expect(detail.first(), "the new order is not on the filtered list").toBeVisible({ timeout: 20_000 });
  await detail.first().click();

  await page.selectOption('select[name="paidWith"]', "pos");
  await submitAndSettle(page, page.getByRole("button", { name: /registra incasso/i }).first());

  // Settled means both things changed: the order reads as paid, and it says with
  // what. A status flip alone would leave the invoice unable to name a method.
  await expect(page.locator("body")).toContainText(/pagat/i, { timeout: 20_000 });
  await expect(page.locator("body")).toContainText(/pos/i, { timeout: 20_000 });
  // The dropdown deliberately refuses to mark an order paid; the control that
  // did it must be gone now that it has.
  await expect(page.getByRole("button", { name: /registra incasso/i })).toHaveCount(0);
});

test("a counter sale saves with «segna come pagato» left unticked", async ({ page }) => {
  // A manual order starts with the box unticked — the exact default that could
  // not be saved on a new product. `paidWith` is not in the DOM at all here.
  await login(page);
  const customer = `E2E Banco ${RUN}`;

  await page.goto("/admin/orders/new");
  await page.fill("#prod-search", "ciauscolo");
  // The result buttons carry the product name, so this cannot land on some
  // other list on the page.
  await page.getByRole("button", { name: /ciauscolo/i }).first().click();

  await page.fill('input[name="name"]', customer);
  await page.fill('input[name="phone"]', "3391234567");
  await expect(page.locator('select[name="paidWith"]'), "an unpaid sale has no instrument yet").toHaveCount(0);

  await submitAndSettle(page, page.getByRole("button", { name: /crea ordine/i }).first());
  await expectListMatch(page, `/admin/orders?q=${encodeURIComponent(customer)}`, customer, /nessun ordine/i);
});

test("ticking «segna come pagato» reveals the instrument and records it", async ({ page }) => {
  // Ticking mounts `paidWith`, and the sale must both save and stamp the claim —
  // a counter sale that does not decrement stock is how the phantom-stock bug
  // presented.
  await login(page);
  const customer = `E2E Banco Pagato ${RUN}`;

  await page.goto("/admin/orders/new");
  await page.fill("#prod-search", "ciauscolo");
  // The result buttons carry the product name, so this cannot land on some
  // other list on the page.
  await page.getByRole("button", { name: /ciauscolo/i }).first().click();

  await page.fill('input[name="name"]', customer);
  await page.fill('input[name="phone"]', "3391234567");
  await page.locator('input[name="markPaid"]').check();

  const instrument = page.locator('select[name="paidWith"]');
  await expect(instrument, "marking it paid must ask how").toBeVisible();
  await instrument.selectOption("cash");

  await submitAndSettle(page, page.getByRole("button", { name: /crea ordine/i }).first());
  await expectListMatch(page, `/admin/orders?q=${encodeURIComponent(customer)}`, customer, /nessun ordine/i);
});

test("a pickup window saves", async ({ page }) => {
  // Zero windows is the state a fresh install is in, and it is why «Ritiro»
  // offers no time at checkout. The form lives behind a <details>, which is
  // itself a trap: the field ids repeat once per existing row.
  await login(page);
  await page.goto("/admin/fulfilment");

  // A second window starting at the same time on the same day is refused —
  // correctly — so a fixed 17:30 Wednesday passes once and fails on every rerun
  // against the reused E2E database. Spread across ~1000 combinations instead.
  const hour = String(6 + runInt("slot-hour", 14)).padStart(2, "0");
  const minute = String(runInt("slot-min", 12) * 5).padStart(2, "0");
  const start = `${hour}:${minute}`;

  await openDisclosure(page, /aggiungi una fascia/i);
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: /^aggiungi$/i }) }).first();
  // Read the day values off the control rather than assuming them. They are ISO
  // (1–7, Monday first), not 0–6, and a hard-coded `String(n % 7)` silently
  // produced "0" on the runs where the hash landed there — Playwright then spent
  // the whole test timeout retrying a `selectOption` that could never match.
  const dayValues = await form
    .locator('select[name="weekday"] option')
    .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
  expect(dayValues.length, "the weekday select has no options").toBeGreaterThan(0);
  await form.locator('select[name="weekday"]').selectOption(dayValues[runInt("slot-day", dayValues.length)]);
  await form.locator('input[name="startTime"]').fill(start);
  await form.locator('input[name="endTime"]').fill(`${String(Number(hour) + 1).padStart(2, "0")}:${minute}`);
  // Roomy on purpose: a window is shared state, and the order specs running
  // beside this one book into it.
  await form.locator('input[name="capacityOrders"]').fill("99");

  await submitAndSettle(page, form.getByRole("button", { name: /^aggiungi$/i }));
  // Not `toContainText`: a saved window renders as an editable row, so its time
  // lives in an input's value and contributes no text to the page at all. The
  // first version of this assertion could never have passed, on a save that
  // worked.
  await expect(page.locator(`input[name="startTime"][value="${start}"]`)).toHaveCount(1, { timeout: 20_000 });
});

test("a delivery zone saves, which is what makes local delivery offerable", async ({ page }) => {
  // «Consegna a domicilio» never appears at checkout until a zone exists, so
  // this form failing looks like a missing feature rather than a broken save.
  // The tab is not the default one — probing /admin/fulfilment alone shows no
  // zone fields at all and reads as unimplemented.
  await login(page);
  await page.goto("/admin/fulfilment?tab=consegna");

  const name = `E2E Zona ${RUN}`;
  await openDisclosure(page, /nuova zona/i);
  await page.fill("#zone-new-delivery-name", name);
  await page.fill("#zone-new-delivery-postcodes", "60121, 60122");
  await page.fill("#zone-new-delivery-fee", "3.50");

  await submitAndSettle(page, page.getByRole("button", { name: /crea zona/i }).first());
  await expect(page.locator("body")).toContainText(name, { timeout: 20_000 });
});

test("a closure saves with its toggles untouched", async ({ page }) => {
  // `blocksReservations` and `blocksPickup` both default to ticked, so this is
  // the create path; the untick path is covered on the discount above. A closure
  // that silently fails to save is a shop taking orders for a day it is shut.
  await login(page);
  await page.goto("/admin/chiusure");

  const reason = `E2E Chiusura ${RUN}`;
  // Overlapping an existing closure is refused, so a fixed offset collides with
  // the previous run's row. Far enough out that it never shadows a date the
  // reservation specs book into.
  const from = new Date(Date.now() + (120 + runInt("closure", 400)) * 864e5).toISOString().slice(0, 10);
  await page.fill('input[name="fromDate"]', from);
  await page.fill('input[name="toDate"]', from);
  await page.fill('input[name="reason"]', reason);

  await submitAndSettle(page, page.getByRole("button", { name: /aggiungi chiusura/i }).first());
  await expect(page.locator("body")).toContainText(reason, { timeout: 20_000 });
});

test("a porchetta booking saves with the weight field a table booking never renders", async ({ page }) => {
  // Three mutually exclusive field sets behind one `type` select: `guests` for a
  // table, `quantityKg` for porchetta, notes required for an ordine speciale.
  // Whichever is not chosen is absent from the submission.
  await login(page);
  await page.goto("/admin/reservations/new");

  const name = `E2E Porchetta ${RUN}`;
  await page.selectOption('select[name="type"]', "porchetta");
  await expect(page.locator('input[name="guests"]'), "porchetta has no covers").toHaveCount(0);
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="phone"]', "3387654321");
  await page.fill('input[name="date"]', new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10));
  await page.fill('input[name="quantityKg"]', "1.5");

  await submitAndSettle(page, page.getByRole("button", { name: /crea prenotazione/i }).first());
  await expectRowExists(page, "/admin/reservations", name);
});

test("a table booking saves with covers, and can then be confirmed", async ({ page }) => {
  // The other branch of the same select, plus the status change that turns a
  // request into a booking — the mutation an operator makes every morning.
  await login(page);
  await page.goto("/admin/reservations/new");

  const name = `E2E Tavolo ${RUN}`;
  await page.selectOption('select[name="type"]', "table");
  await expect(page.locator('input[name="quantityKg"]'), "a table is not weighed").toHaveCount(0);
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="phone"]', "3387654321");
  await page.fill('input[name="date"]', new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10));
  await page.fill('input[name="time"]', "20:00");
  await page.fill('input[name="guests"]', "4");
  await page.selectOption('select[name="status"]', "pending");

  await submitAndSettle(page, page.getByRole("button", { name: /crea prenotazione/i }).first());
  await expectRowExists(page, "/admin/reservations", name);

  // The status is a select plus «Aggiorna», not a Conferma button — the only
  // button starting "Conferma" here is the porchetta waitlist promotion, which
  // is a different action on a different row.
  await openRow(page, "/admin/reservations", name);
  await page.selectOption("#res-status", "confirmed");
  await submitAndSettle(page, page.getByRole("button", { name: /^aggiorna$/i }).first());
  // Deliberately *without* a reload. The status did save before this test
  // existed — but the page kept showing "In attesa" until the operator
  // refreshed by hand, next to a toast saying it had been updated. See the
  // `router.refresh()` in `components/admin/ActionForm.tsx`.
  await expect(page.locator("#res-status"), "the page still shows the old status").toHaveValue("confirmed");
});

test("a shop and a reward save", async ({ page }) => {
  // The last two forms named in the `checkbox` helper's own comment as sharing
  // the failure, and the only two never driven by a browser. A shop carries
  // three toggles, a reward one.
  await login(page);

  const shop = `E2E Bottega ${RUN}`;
  await page.goto("/admin/shops/new");
  await page.fill('input[name="name"]', shop);
  await page.fill('input[name="slug"]', `e2e-bottega-${RUN}`);
  // Sorted last on purpose. `/admin/fulfilment` renders one schedule block per
  // shop and the pickup test opens the *first* one, so a test shop that sorted
  // ahead of the seeded ones would make that test fail depending on which
  // worker got there first.
  await page.fill('input[name="sortOrder"]', "99");
  await submitAndSettle(page, page.getByRole("button", { name: /^crea sede$/i }).first());
  // Not `expectRowExists`: the shops list links each row as "Modifica", so the
  // anchor carries no name to filter on. The query-echo trap does not apply
  // here either — the page has no search box to echo one.
  await page.goto("/admin/shops");
  await expect(page.locator("body")).toContainText(shop, { timeout: 20_000 });

  const reward = `E2E Premio ${RUN}`;
  await page.goto("/admin/rewards/new");
  await page.fill('input[name="name"]', reward);
  await page.fill('input[name="points"]', "50");
  await submitAndSettle(page, page.getByRole("button", { name: /^crea premio$/i }).first());
  await expectRowExists(page, "/admin/rewards", reward);
});

test("a newsletter draft saves", async ({ page }) => {
  // The composer is the one admin form whose failure costs a send window rather
  // than a record, and it sits behind a disclosure like the fulfilment forms.
  await login(page);
  await page.goto("/admin/newsletter");

  const subject = `E2E Campagna ${RUN}`;
  await openDisclosure(page, /nuova comunicazione/i);
  await page.fill('input[name="subject"]', subject);
  await page.fill('textarea[name="body"]', "Corpo della comunicazione di prova.");

  await submitAndSettle(page, page.getByRole("button", { name: /crea bozza|salva bozza/i }).first());
  await expect(page.locator("body")).toContainText(subject, { timeout: 20_000 });
});
