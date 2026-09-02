# System 1 — Catalogue & Products

**Readiness: 91 / 100** — *state of the art, with two known residuals*
*(77 at audit; findings 1–8 fixed 2026-09-02.)*

Audited and remediated 2026-09-02 against the rubric in
[`docs/systems-map.md`](../systems-map.md). Scope: products, categories,
category kinds, slugs, pricing/VAT, per-shop availability, sort order,
CSV import, allergen declaration.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 85 | **94** | 28.2 |
| Robustness | 25% | 68 | **88** | 22.0 |
| Security & compliance | 20% | 72 | **91** | 18.2 |
| Observability & operability | 15% | 85 | **93** | 14.0 |
| Test & documentation cover | 10% | 70 | **90** | 9.0 |
| **Total** | | **77** | | **91.4 → 91** |

**Verification:** `vitest` 710 passed / 55 files (was 685 / 54) ·
`playwright` 52 passed · `tsc --noEmit` clean · `eslint` clean
(one pre-existing unused-import warning in `app/(site)/sedi/page.tsx`, untouched).

---

## What was already strong

The taxonomy work is the best part of this system.

- **The denormalised category name is kept honest.** `products.category` is a
  copy of `categories.name`, and a rename rewrites every dependent row *in the
  same transaction* (`lib/admin/category-actions.ts`). The two views of a
  category cannot diverge, which is the failure the table was added to end.
- **A category in use cannot be dropped.** The FK is RESTRICT at the database
  level, and `deleteCategory` checks first so the operator gets a sentence and a
  merge tool instead of `FOREIGN KEY constraint failed`.
- **`mergeCategories`** is the cleanup for a mistyped "Formaggio" beside
  "Formaggi": it moves rows, re-parents children without creating a third
  level, and deletes the source as one unit.
- **One level of nesting is enforced three ways** — parent must be top-level, a
  row that is already a parent cannot be filed under one, self-parenting is
  refused.
- **Drag-and-drop reorder validates the dropped set** against the live sibling
  set before renumbering, so a stale client cannot reorder the wrong rows.
- **Price authority is server-side**: checkout re-reads `priceCents` from the DB
  (`lib/orders.ts`). The cart cannot set its own price.
- **Archive-vs-delete is the right call**, and `deleteProduct` refuses once
  order lines or stock movements exist.
- **The audit trail** writes real sentences — "prezzo 8,50 € → 9,00 €" — and
  stays silent when nothing tracked changed.
- Schema CHECK constraints on price ≥ 0, stock ≥ 0, VAT 0–10000 bps, category
  kind — enforced by the database, not just the form.

---

## Findings and what was done

### 1. A scoped operator could create a product in another sede — HIGH · **fixed**

`requireAdmin()` admits **staff as well as admin**. The update branch of
`saveProduct` guarded both ends of a shop move; the **create branch had no
scope check at all**, so a staff account confined to `carni` could post
`shopSlug=centro` and plant a product in the other shop's catalogue.

The new-product page filters the select to the operator's own shop and its
comment claimed *"the action refuses any other"*. It did not — precisely the
case `lib/admin/scope.ts` warns about: *"a filter alone is not access
control."*

**Fixed** — `requireShopScope(d.shopSlug)` now runs immediately after
`parseForm`, before anything is written, covering create and update alike; the
update branch keeps its second check on the row's existing shop so neither end
of a move is open. Covered by *"refuses a staff member creating a product in
another sede"*, which logs in as a real scoped staff account.

---

### 2. The CSV importer wrote `products.stock` outside the ledger — HIGH · **fixed**

`applyProductImport` set `stock` inside its bulk `UPDATE`, bypassing
`lib/stock.ts` — the module documented as *"the single way inventory moves"*.
An import therefore produced none of its three guarantees: no `stock_movements`
row (so the history stopped summing to on-hand), no back-in-stock mail, and no
re-arming of `lowStockNotifiedAt`, leaving the low-stock alert latched.

`test/stock-ledger.test.ts` names *"a CSV import"* among the paths that "moved
the number in silence" — as a bug already fixed. It had been fixed for
`receiveBatch` and `adjustStock`; the importer still bypassed.

**Fixed** — quantities are collected during the transaction and pushed through
the new `setProductStock` once it commits (email has no business inside a write
lock). Covered by *"ledgers a quantity brought in from a sheet"* and *"ledgers
the opening quantity of a row the sheet creates"*.

---

### 3. `saveProduct` wrote stock directly, leaving no movement row — MEDIUM · **fixed**

This one was *known*: `lib/stock.ts` carried a `skipRestockEffects` escape hatch
justified by "`saveProduct` writes `products.stock` directly and mails its own
waitlist". It did handle its own notifications — but it never ledgered, so the
most obvious way to change a quantity was the one way that left no trace.

**Fixed** — the form no longer writes `stock` at all; it calls
`setProductStock`, which ledgers the difference and lets `afterRestock` send the
mail and re-arm the alert for every path alike. The hand-rolled
`notifyBackInStock` call and `clearLowStock` computation are gone, and
`skipRestockEffects` — whose only justification was this caller, and which had
no callers — is removed. Covered by *"ledgers a stock change made from the
product form"* and *"ledgers the opening quantity of a new product"*.

**New helper, `setProductStock`** (`lib/stock.ts`), handles the four
transitions explicitly, because `null` is a *mode* (made-to-order), not a
quantity:

| from → to | behaviour |
|---|---|
| number → number | ledgered as the difference |
| null → number | opens at zero so the opening figure is a real movement |
| number → null | walked down to zero (ledgered) before the mode changes |
| null → null | nothing |

---

### 4. The importer could resurrect an archived product — MEDIUM · **fixed**

`toggleProductActive`, `toggleProductFeatured` and `saveProduct` all refuse to
activate an archived row. The importer applied `active` with no such guard,
producing `active: true, archivedAt: <date>` — a state the admin calls archived
and the storefront showed, because every public query filtered on `active` and
**none filtered on `archivedAt`**.

**Fixed, two ways.** `planProductImport` now reports a row that tries to set
`active`/`featured`/`purchasable` on an archived slug as an issue — so the whole
file is refused, matching the importer's existing all-or-nothing stance. And
the public queries ask the question themselves rather than trusting another
action to have remembered: `isNull(products.archivedAt)` is now part of
`getProducts`, `getFeaturedProducts`, `getProductsByShop`,
`getPurchasableProducts`, `getProductCategories`, `getRelatedProducts`, the
`/negozio/[slug]` detail guard, `/api/stock-notify`, and `createOrder`'s
product lookup. Covered by *"refuses to put an archived product back on sale"*,
*"still lets an archived product be edited in ways that don't revive it"*, and
*"hides an archived product even when something left it active"*.

---

### 5. An explicit slug skipped the check categories get — MEDIUM · **fixed**

`resolveSlug` returned an explicit slug unseen, so a hand-typed duplicate hit
the UNIQUE index and reached the operator as *"Si è verificato un errore
imprevisto. Riprova."* — while `saveCategory`, which does its own check, named
the offending slug.

**Fixed in `resolveSlug` itself** rather than in the caller, so products, blog
posts and rewards all benefit — every table it runs against has a unique slug,
so the check is always the right question. Takes an optional `label` for the
message. Covered by *"names the offending slug when a hand-typed one is already
taken"*.

---

### 6. Storefront ordering had no tiebreak — LOW · **fixed**

Every product ships at `sortOrder: 0`, and the public queries ordered by that
alone — so an unsorted catalogue came back in whatever order SQLite happened to
return, which could differ between two requests. The admin list and the
category rail already broke the tie by name.

**Fixed** — a shared `catalogueOrder` (`sortOrder`, then `name`) across all the
public product queries. Covered by *"orders an unsorted catalogue by name rather
than at random"*.

---

### 7. A category's declared default VAT was client-side only — LOW · **fixed**

`categories.defaultVatRateBps` is described in the schema as *"Declared, not
inferred"*, but only a form handler applied it, and only for new products. The
schema coerced a missing `vatRate` straight to 1000 (10%), so a product created
through the importer under a 22% category silently took 10% — an
under-declaration, in the one area this codebase has already been bitten.

**Fixed** — `productInput.vatRate` now resolves blank to `null`, and the
resolution order is explicit in both writers: *what the form said → what the
category declares → the house rate*, with the house rate named once as
`DEFAULT_VAT_BPS` in `lib/fiscal.ts` instead of being spelled `1000` in three
places. Covered by *"takes the VAT rate its category declares when the form
doesn't say"*, *"still honours an explicit rate over the category's"*, and
*"gives a newly created row the VAT rate its category declares"*.

---

### 8. Allergens were unvalidated free text — LOW (compliance quality) · **fixed**

`products.allergens` carried the comment *"the 14 mandatory allergens"*
(EU Reg. 1169/2011 Annex II) but stored whatever was typed into a comma box, so
"Latte", "latte" and "lattosio" were three different allergens, nothing could
answer "which products contain nuts", and a typo on a food label is not
cosmetic.

**Fixed** — new `lib/allergens.ts` holds the fourteen as a controlled
vocabulary with canonical keys, the spellings the shop actually writes as
aliases, and label rendering. Deliberately isomorphic: the client form, the
server action and the storefront read one list. The product form now ticks the
fourteen instead of typing them, with a free-text box for anything outside
Annex II — **unknown text is kept, never dropped**, because losing an allergen
from a food page to tidy a data model would be the worse failure by a distance.
Covered by five unit tests and a new e2e test.

> **A defect this introduced, and its fix.** The e2e test caught the "altro" box
> rendering the *stored key* back into a human field — "farina di castagne"
> reopened as "farina-di-castagne", and every re-save fed the hyphens through
> again. The form now renders extras through `allergenLabel`, and a unit test
> pins label and parse as inverses.

---

### 9. `resolveSlug` has a TOCTOU window — LOW · **open**

Checks `taken()`, then the caller inserts. Two concurrent creates of the same
name both resolve to `salame`; the second now hits the UNIQUE index and reports
the generic error. The explicit-slug path is checked (finding 5), so this is
narrowed to the *derived* path, and it needs two people creating an
identically-named product in the same instant in a two-counter shop. Closing it
means catching the constraint violation and retrying.

---

## Also still open

- **Allergens are not in the CSV round-trip.** The importer has no `allergeni`
  column, so a bulk catalogue edit cannot touch them. Now that they are a
  controlled vocabulary this is straightforward to add.
- **`unit` is free text** ("kg", "etto", "pezzo", "confezione" by convention
  only), so the same measure can be spelled several ways across the catalogue.

---

## What I checked and found clean

- Storefront product detail refuses inactive/non-purchasable rows, including in
  `generateMetadata`.
- `duplicateProduct` copies within the source's shop and ships the copy off
  (inactive, not purchasable, not featured, stock null).
- `bulkUpdateProducts` delegates to the single-row actions, so scope, the
  archive guard and the audit line are identical to a click.
- Import refuses a partially-valid file outright; blank cells mean "leave
  alone", not "clear"; in-file duplicate slugs are reported; the apply is one
  transaction; 2 MB cap; admin-only.
- The importer will not mint categories — an unmatched name keeps its text with
  a null FK and is counted as "senza categoria".
- `runAction` never leaks SQLite text to the UI.
- Product list and detail admin pages both enforce shop scope.

---

## Files changed

| File | Change |
|---|---|
| `lib/stock.ts` | new `setProductStock`; removed the dead `skipRestockEffects` hatch |
| `lib/allergens.ts` | **new** — the fourteen of Annex II as a controlled vocabulary |
| `lib/admin/actions.ts` | scope on create; stock via the ledger; category VAT; canonical allergens |
| `lib/admin/product-import.ts` | archive guard; stock via the ledger; category VAT on create |
| `lib/slug.ts` | explicit slugs are checked, not trusted |
| `lib/db/queries.ts` | `visibleProduct` + `catalogueOrder` across the public queries |
| `lib/orders.ts` | archive filter on the checkout product lookup |
| `lib/validation/admin.ts` | `vatRate` may be absent so a category default can win |
| `lib/fiscal.ts` | `DEFAULT_VAT_BPS`, named once |
| `components/admin/forms.tsx` | allergen checkboxes + "altro" box |
| `app/(site)/negozio/[slug]/page.tsx` | archive guard; renders allergen labels |
| `app/api/stock-notify/route.ts` | no waitlist for something out of the catalogue |
| `test/catalogue-integrity.test.ts` | **new** — 25 tests |
| `e2e/admin-forms.spec.ts` | the product form, driven for the first time |

---

## Note for other systems

**System 2 (Inventory & Stock)** was carrying findings 2 and 3: its central
invariant — *"every path that changes stock goes through `lib/stock.ts`"* — was
false on its two most-used write paths. It is true now. Score System 2 on the
current state, not the audit-time state.

**System 23 (Quality & Testing)**: two e2e tests are flaky under full-suite
load and pass in isolation — `admin-forms.spec.ts` "a table booking saves with
covers" and `admin-operations.spec.ts` "a failed email can be retried from the
outbox". Both wait on `submitAndSettle`'s settle signal. Neither is a
regression from this work (verified by re-running the first against a stashed
tree), but the suite has no retry configured, so a green run is not currently
reliable.
