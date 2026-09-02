import { test, expect } from "@playwright/test";
import { RUN, login, placePickupOrder, expectNoRawSchemaError } from "./_helpers";

/**
 * The reporting surfaces, driven by a browser.
 *
 * `/admin/reports/vendite` is the one screen in the gestionale that does
 * arithmetic nobody can check by eye: it splits VAT out of every line, allocates
 * each order's discount across that order's lines, and then divides one derived
 * figure by another. `test/sales-analysis.test.ts` proves the arithmetic; this
 * proves the page actually reaches it — with a real settled order behind it, the
 * period resolver, the shop filter and the CSV all in the loop.
 *
 * The precondition is made rather than assumed: an order placed by the test
 * itself. Both preceding CI-only failures in this suite were preconditions the
 * spec expected to find lying around (see the audit notes on mail state and
 * `count()`), and a report over an empty period renders its empty state and
 * passes every assertion about not crashing.
 */

/** The period presets are Rome-calendar; "anno" is the one a fresh order is in. */
const YEAR = "/admin/reports/vendite?periodo=anno";

test.describe("analisi vendite", () => {
  test("totals, categories and margin render over a real settled order", async ({ page }) => {
    await login(page);
    // Deliberately no payment method: the default takes the checkout's own
    // preselection, which under `next dev` with no Stripe keys is card in
    // simulate mode — so the order comes back already **paid**. An unpaid order
    // is not takings and `everSettled` would exclude it, leaving this test
    // asserting against the empty state.
    await placePickupOrder(page, `Report ${RUN}`, `report-${RUN}@example.com`);

    await page.goto(YEAR);
    await expect(page.getByRole("heading", { name: "Analisi vendite" })).toBeVisible();
    await expectNoRawSchemaError(page);

    // The four KPI tiles. `Incasso merce` is the one the rest derive from, so
    // its absence is the failure that matters.
    for (const label of ["Incasso merce", "Imponibile", "Costo del venduto", "Margine"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // A euro figure, not the empty state. Asserted on the tile rather than on
    // page text: the period string alone would match on a page with no sales.
    await expect(page.locator("body")).not.toContainText(
      "Nessuna vendita incassata nel periodo selezionato",
    );

    // The coverage sentence is the honesty contract — a margin percentage whose
    // coverage is unstated is the number people quote. It must always render.
    await expect(page.getByText(/Copre il \d+% dell'imponibile del periodo/)).toBeVisible();

    // Per-category is the question the page exists to answer.
    await expect(page.getByRole("heading", { name: "Per categoria" })).toBeVisible();
  });

  test("the shop filter narrows the report instead of clearing the period", async ({ page }) => {
    await login(page);
    await page.goto(YEAR);

    const chip = page.getByRole("link", { name: "Taccalite Centro", exact: true });
    // Two sedi are seeded, so the facet is rendered; if it ever is not, the
    // assertion should fail loudly rather than the test skipping itself.
    await expect(chip).toBeVisible();
    await chip.click();

    await expect(page).toHaveURL(/negozio=centro/);
    // The period has to survive the facet click. It used not to: a facet built
    // from the base path alone drops every other query parameter, which would
    // silently reset a year-to-date report to the current month.
    await expect(page).toHaveURL(/da=\d{4}-01-01/);
    await expect(page.getByRole("heading", { name: "Analisi vendite" })).toBeVisible();
  });

  test("the CSV carries the same sections as the screen", async ({ page }) => {
    await login(page);
    const res = await page.request.get(`/api/admin/export/vendite?periodo=anno`);
    expect(res.status()).toBe(200);
    const csv = await res.text();

    const [header, ...rows] = csv.trim().split("\n");
    expect(header).toContain("margineEuros");
    expect(header).toContain("righeSenzaCosto");
    // One totals row, always — the sections below it depend on there being data.
    expect(rows.some((r) => r.startsWith("Totale,"))).toBe(true);
  });
});

/**
 * Traceability, the way a recall actually arrives: somebody telephones with a
 * lot code off a packet and the shop has to know within the hour who took that
 * lot away. `consumeBatchesFefo` always knew which lots a sale drew on and both
 * callers used to discard it, so this could only be answered from paper
 * delivery notes and memory.
 */
test("the expiry page answers who received a lot", async ({ page }) => {
  await login(page);

  await page.goto("/admin/products/scadenze");
  await expect(page.getByLabel(/chi ha ricevuto un lotto/i)).toBeVisible();

  // A code nothing was ever sold under says so plainly, rather than showing an
  // empty table the operator has to interpret.
  await page.getByLabel(/chi ha ricevuto un lotto/i).fill(`NESSUN-LOTTO-${RUN}`);
  await page.getByRole("button", { name: /^cerca$/i }).click();
  await expect(page.getByText(/nessun ordine risulta aver ricevuto il lotto/i)).toBeVisible({
    timeout: 20_000,
  });
  await expectNoRawSchemaError(page);
});
