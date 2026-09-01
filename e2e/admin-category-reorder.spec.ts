import { test, expect, type Page } from "@playwright/test";
import { RUN, runInt, login } from "./_helpers";

/**
 * The category list's client-side state — the one admin surface whose ordering
 * lives in the browser rather than in a form post.
 *
 * `CategoryOrderList` keeps an optimistic local copy of the list, swaps rows on
 * pointermove, persists on drop, and then adopts whatever the server echoes
 * back. Every static check passes on a version of it that silently never
 * reorders, or that quietly stops adopting fresh props, so both halves are
 * driven here with a real pointer.
 *
 * The resync is the fragile half: it runs during render, guarded on the previous
 * `items`, because as an effect it painted the stale order first and re-rendered
 * immediately (the cascading render the compiler lint flags). Get the guard
 * wrong one way and the list goes stale; the other way and the component
 * render-loops, which shows up here as a console error rather than a wrong list.
 *
 * Both tests work on categories they create themselves. The suite is fully
 * parallel and the seeded rows are shared: reordering or hiding one of those
 * races every other spec that reads the list.
 */

/** Ids of the draggable rows, in the order they appear. */
function rowOrder(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-drag-handle]")].map((h) => h.getAttribute("data-row-id") ?? ""),
  );
}

/** Create a top-level product category and return its row id. */
async function createCategory(page: Page, name: string, slug: string, sortOrder: number): Promise<string> {
  await page.goto("/admin/categories/new");
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="slug"]', slug);
  await page.fill('input[name="sortOrder"]', String(sortOrder));
  await page.getByRole("button", { name: /crea|salva/i }).first().click();
  await page.waitForURL(/\/admin\/categories(\?|$)/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const row = page.locator("div[data-row-id]").filter({ hasText: name }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  return (await row.getAttribute("data-row-id"))!;
}

/** Drag the row with `id` down past `belowId`. */
async function dragBelow(page: Page, id: string, belowId: string) {
  const handle = page.locator(`[data-drag-handle][data-row-id="${id}"]`);
  const target = page.locator(`div[data-row-id="${belowId}"]`).first();
  // The fixtures sort to the bottom of the list, so scroll them in first:
  // `boundingBox` happily reports a position below the fold and the synthetic
  // pointer then lands on whatever is actually at those coordinates.
  await target.scrollIntoViewIfNeeded();
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  const x = from.x + from.width / 2;
  const y = from.y + from.height / 2;
  const distance = to.y + to.height - from.y;

  await page.mouse.move(x, y);
  await page.mouse.down();
  // Stepped, not a single jump: rows reorder on pointermove, and a drop with no
  // intervening move would persist the order it started with.
  for (let i = 1; i <= 8; i++) await page.mouse.move(x, y + (distance * i) / 8);
  await page.mouse.up();
  await page.waitForLoadState("networkidle");
}

/** The relative order of two ids in the rendered list. */
async function relative(page: Page, a: string, b: string): Promise<[number, number]> {
  const order = await rowOrder(page);
  return [order.indexOf(a), order.indexOf(b)];
}

test("dragging a category reorders it, and the server keeps the new order", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await login(page);
  // A sort bucket of this run's own, so repeated local runs (which leave their
  // fixtures behind, as the rest of the suite does) don't interleave and leave
  // these two far apart on the page.
  const slot = 9000 + runInt("catorder", 400) * 2;
  const a = await createCategory(page, `E2E Ordina A ${RUN}`, `e2e-ordina-a-${RUN}`, slot);
  const b = await createCategory(page, `E2E Ordina B ${RUN}`, `e2e-ordina-b-${RUN}`, slot + 1);

  const [ai, bi] = await relative(page, a, b);
  expect(ai, "both fixtures must be in the list").toBeGreaterThanOrEqual(0);
  expect(ai).toBeLessThan(bi);

  await dragBelow(page, a, b);

  // A now comes after B. Asserted as an ordering rather than as two fixed
  // indices: leftover fixtures from earlier runs sit in this part of the list
  // too, and how many there are is not this test's business.
  const [ai2, bi2] = await relative(page, a, b);
  expect(bi2).toBeLessThan(ai2);

  // …and the server agrees, so this was persisted rather than only optimistic.
  await page.reload({ waitUntil: "networkidle" });
  const [ai3, bi3] = await relative(page, a, b);
  expect(bi3).toBeLessThan(ai3);

  expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
});

test("the list adopts server state without a reload", async ({ page }) => {
  // The half a reorder test cannot see: rows are rendered from the component's
  // own copy of the list, so if it stops adopting fresh props the list quietly
  // goes stale — a hidden category still listed as visible, a deleted one still
  // there. The toggle's label is derived from that copy, so it says whether the
  // resync ran.
  await login(page);
  const id = await createCategory(page, `E2E Resync ${RUN}`, `e2e-resync-${RUN}`, 9100);
  const row = page.locator(`div[data-row-id="${id}"]`).first();

  await row.getByRole("button", { name: "Nascondi" }).click();
  // No reload: the label must flip on its own once the server echoes back.
  await expect(row.getByRole("button", { name: "Mostra" })).toBeVisible({ timeout: 20_000 });

  await row.getByRole("button", { name: "Mostra" }).click();
  await expect(row.getByRole("button", { name: "Nascondi" })).toBeVisible({ timeout: 20_000 });
});
