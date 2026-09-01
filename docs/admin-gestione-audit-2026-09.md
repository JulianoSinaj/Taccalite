# Gestionale — is it enough to run the page and the business?

_2026-09-01. Seventh audit. Method: read the 38 admin routes and the 25 action modules,
then **run** the app against the live `data/taccalite.db` — every admin route requested
authenticated, the revenue definitions reconciled numerically against the database, and the
CMS coverage measured against the storefront as it exists after the "Carta e Inchiostro"
redesign._

_Different question from the previous six. Audits 1–6 asked "is this correct and secure".
This one asks **"can the owner actually run the shop from it, and can they run the website
from it"** — and deliberately does not re-report anything closed in
[`admin-gap-audit-2026-08.md`](./admin-gap-audit-2026-08.md) or
[`production-readiness-2026-08-25.md`](./production-readiness-2026-08-25.md)._

---

## 0. Headline

**The gestionale is in good shape and the correctness work has held.** Baseline verified this
session, not assumed:

| Check | Result |
| ----- | ------ |
| `tsc --noEmit` | clean |
| `vitest run` | **643 passed / 643**, 52 files |
| All 38 `/admin` routes, authenticated | **200** (`/admin/reports` 404s by design — a grouping folder, correctly listed in `Breadcrumbs.NOT_BROWSABLE`) |
| Role model | every admin-only action uses `requireRole("admin")`, not the misleadingly-named `requireAdmin()` (which admits staff) |
| Shop scoping | `assertShopScope` present on every detail route checked, including the packing slip |

I went looking for the classic failure modes of this codebase and did not find them: no
unconsumed setting (all 34 keys on `/admin/settings` have a consumer), no ungated admin-only
surface, no missing scope guard on a write, no dead breadcrumb.

**So the answer is split.** For the *online* business — orders, bookings, catalogue, loyalty,
fulfilment, VAT on sales — it is more than adequate; it is genuinely good. For **managing the
business as a business**, there are three real holes (§1). For **managing the website**, the
CMS covers much less of the storefront than the storefront's own redesign implies (§2).

Nothing below is a security hole and nothing is on fire in code. The severities are about
what the owner cannot see or cannot change.

---

## 1. Business management — what the gestionale cannot tell the owner

### 1.1 Cost is captured on 20 of 24 products and aggregated nowhere ⚠️ high

`margin()` in [`lib/inventory.ts:33`](../lib/inventory.ts) computes gross margin properly —
it splits VAT out of the consumer price first, which is the part everyone gets wrong. It is
imported by **exactly one file**: `app/admin/(dash)/products/[id]/page.tsx`, which renders it
for a single product.

There is no margin figure anywhere else. Not per period, not per category, not per shop, not
as a ranking. The dashboard's headline numbers are all revenue: `Incasso oggi`, `Ultimi 7
giorni`, `Ultimi 30 giorni`, `Scontrino medio`, `Prodotti più venduti · 30 gg` — that last one
ranks by **revenue**, so the product at the top may well be the one the shop earns least on.
(Verified: `Cesto regalo «Marche»` leads at €1755 and its margin appears on no screen that
ranks anything.)

The data is already there. `products.cost_cents` is populated for 20 of 24 rows, and
`order_items` snapshots `vatRateBps` per line. **The business can see its turnover and cannot
see its profit**, which is the one number that decides what to stock more of.

### 1.2 "Statistiche" is web analytics, not sales analytics ⚠️ high

`/admin/analytics` is subtitled _"Visite del sito — senza cookie, senza dati personali"_ and
that is exactly what it is: daily visits, top pages, referrers. Good, privacy-respecting, and
about the website.

There is **no sales analytics surface at all**. Missing: sales by category, sales by shop over
time, any period comparison beyond the dashboard's single 30-day-vs-previous-30 delta,
repeat-customer rate, and the seasonality a food business runs on (a norcineria's year is
Christmas, Easter and the Saturday porchetta — none of which any screen isolates).

The escape hatch exists and is decent — 15 CSV exports including `order-items` — but that
means the answer to "how did salumi do against formaggi this quarter" is *export it and build
a pivot table*. That is a spreadsheet the owner maintains by hand, i.e. the thing a gestionale
is for.

### 1.3 The two-shop separation is fully built and switched off ⚠️ medium

`inShop()`, `shopScope()`, `assertShopScope()`, `requireShopScope()`, `lockShop()`,
`shopChips()` — a substantial invariant threaded through nearly every query and every write,
and the subject of a good deal of the 2026-08 audit.

In the live database **both staff accounts have `shop_slug = NULL`**:

```
role   shop_slug  n
admin  NULL       1
staff  NULL       2
```

`inShop(col, null)` adds no predicate. So every staff member currently sees both shops'
takings, orders, bookings and customers, and `assertShopScope` never refuses anything. The
machinery is correct — it is simply not switched on for anybody.

Two consequences. The operational one: Centro's counter can read Mercato del Piano's numbers.
The engineering one: **no account in production-like use exercises the scoped path**, so the
whole branch is only ever covered by tests.

Fix is configuration, not code — assign `shopSlug` on `/admin/users` — but it should be a
deliberate decision rather than the current default-by-omission.

### 1.4 A latent divergence between the dashboard and the chiusura di cassa ℹ️ low

Two different, individually defensible rules for where a refund lands:

- **Dashboard** — `netRevenue = sum(total_cents - refunded_cents)`, bucketed by
  `settledAt = coalesce(paid_at, created_at)` ([`queries.ts:109-110`](../lib/admin/queries.ts)).
  A refund is netted off **the period of the sale**.
- **Chiusura di cassa / IVA** — takings by `settledAt`, reversals by
  `reversalDate = coalesce(refunded_at, updated_at)` ([`queries.ts:1744`](../lib/admin/queries.ts)).
  A refund is booked in **the period of the refund**. The IVA report says so explicitly and is
  right to: you do not reopen a filed period.

Reconciled numerically against the live database over the last 30 days:

```
dashboard 30d net   : 521810
cash-up   30d net   : 521810   (taken 563751 − refunds 41941)
difference          : 0
refunds straddling  : 0
```

**They agree today**, because no refund in the data crosses a period boundary. They will
disagree by the refunded amount the first time one does — a sale settled in August refunded in
September makes September's till sheet show a loss the dashboard's "Incasso 30 giorni" never
records. Not a bug today; a silent one later. Worth a sentence on the cash-up page rather than
a code change, since both rules are deliberate.

### 1.5 Traceability is available on 19 of 24 products, and used on none ℹ️ low

`BatchPanel` renders only when `product.stock != null`
(`products/[id]/page.tsx:372`), so the 5 products with no giacenza cannot carry a lot code or
an expiry date at all. `product_batches` currently holds **0 rows**, and the dashboard's "Lotti
in scadenza" tile reads 0 for that reason rather than because nothing is expiring.

For a shop selling fresh salumi and formaggi this is the HACCP-adjacent surface, and it is
switched off in practice. Either it is in use and needs the 5 products opted in, or it is not,
in which case the tile is permanently reassuring about nothing.

---

## 2. Website management — the CMS covers less than the redesign implies

`site_content` currently holds **0 rows**: every word on the public site is a built-in default.
That is known. What is new is *how much of the site the CMS can reach at all.*

| | Count |
| - | - |
| Public routes under `app/(site)` | **24** |
| Routes that read `site_content` | **6** (`/`, `/la-nostra-storia`, `/porchetta`, `/privacy`, `/cookie`, `/termini`) |
| Editable keys in `lib/site-content.ts` | **14** |

Three of the six are legal pages. So the editable storefront is really the home page (4 keys),
La nostra storia (2) and Porchetta (2).

**What the owner cannot change without a developer**, verified in source:

- The **hero headline and lead paragraph** — the first sentence anyone reads. Hardcoded JSX in
  `components/site/home/Hero.tsx:48–66` ("Il banco di famiglia, dal 1946." and the paragraph
  under it). `home.hero.facts` only edits the three small notes beneath.
- `ChiSiamo`, `DueBotteghe`, `Marche`, `OggiAlBanco` section copy — the last two take their
  *lists* from settings (`home.brands`, `home.today`) but their surrounding prose is fixed.
- **The whole `/contatti` page** — 188 lines, no CMS integration whatsoever.
- `/sedi` intro copy (the per-shop detail comes from the `shops` table, which *is* editable).

This is the gap most likely to generate "can you just change…" requests. The gestionale is
excellent at managing the *shop*; it manages the *site* only where somebody remembered to add
a key, and the redesign added pages faster than it added keys.

---

## 3. Still owed from earlier audits — confirmed still true

Re-verified against the live database, not copied forward:

| Item | Live state |
| ---- | ---------- |
| **SMTP** | `email_outbox`: **149 failed / 150 sent**. A ~50% loss rate, live. The banner and the dashboard card both correctly say so — this is configuration, not code. |
| **Fiscal identity** | `business.vatNumber = "11111111111"` (deliberately checksum-invalid), `legalName = "… — DEMO"`, and `business.address` / `.zip` / `.city` / `.province` have **no rows at all**. Any FatturaPA XML is refused by the guard, correctly. |
| Pickup windows | 0 |
| Closures | 0 |
| Delivery zones | 1 |
| `site_content` | 0 rows |

---

## 4. Deliberate boundaries — not defects, but they define the answer

Declared out of scope in [`admin-gap-audit-2026-08.md` §6](./admin-gap-audit-2026-08.md) and
still absent. Listing them because they are precisely what separates "runs the online business"
from "runs the business":

- **No suppliers, no purchase orders, no supplier invoices.** `supplier` is a free-text field
  on `products` and `product_batches`, nothing more. Consequences: no **IVA a credito** (the
  Riepilogo IVA is the *active cycle only* — it computes what is owed, never what is
  reclaimable), no cost of goods sold, no supplier ledger, no reorder workflow.
- **No corrispettivi telematici / RT.** Daily takings are not transmitted; the shop's
  registratore di cassa does that. The chiusura di cassa is a management sheet, and its own
  footer says the packing slip is "documento non fiscale".
- **No SdI transmission.** FatturaPA XML is *generated* and downloaded, not sent.
- **Not a POS.** `/admin/orders/new` records a counter sale properly (including
  "Segna come pagato (vendita al banco) — scala la giacenza"), but it is a form, not a till.

**The practical meaning: the commercialista still keeps the books.** The platform is the
authoritative record of the online and booking side, and a management view of the counter. It
is not the accounting system, and nothing above suggests it should become one.

---

## 5. What I'd do, in order

1. **Assign `shopSlug` to the two staff accounts** (§1.3) — configuration, minutes, and it
   turns on an invariant already built and tested.
2. **A margin/profitability report** (§1.1). The data exists; this is a query and a page. The
   highest ratio of business value to work in this document.
3. **Give `Prodotti più venduti` a margin column**, or a second ranking beside it. Small, and
   it fixes the specific way the dashboard currently misleads.
4. **A sales-analytics page** (§1.2) — by category, by shop, period over period. Larger.
5. **Extend the CMS to the hero and `/contatti`** (§2) — the two the owner will ask for first.
6. **A line on the cash-up page** explaining the refund-period rule (§1.4).
7. Decide whether lot tracking is in use (§1.5); if it is, opt the 5 stockless products in.

Not listed, because they are the owner's to supply and no amount of code substitutes:
`SMTP_USER`/`SMTP_PASS`, the real P.IVA and sede, Stripe keys, product photography, pickup
windows.

---

## 6. What shipped (same session, 2026-09-01)

All seven items in §5, in that order. Verified: `tsc` clean, **663 Vitest** (up from 643),
**51 Playwright** (up from 48), `eslint` 0 errors — the one warning left is a pre-existing
unused import in `app/(site)/sedi/page.tsx`, untouched by this work.

| § | Item | What was built |
| - | ---- | -------------- |
| 1.3 | Unscoped staff | `countUnscopedStaff()` + a notice on `/admin/users`. **Not** an automatic assignment: which person works at which counter is the owner's fact, not one to guess. The notice states the consequence and says it is fine if deliberate. |
| 1.1 | Margin | **`/admin/reports/vendite`** — totals, per category, per sede, per product, each with quantity, incasso, imponibile, costo and margin, and a period-over-period delta. Plus a CSV export (`/api/admin/export/vendite`). |
| 1.1 | Top products | The dashboard's ranking now carries each product's margin, and links to the report. |
| 1.2 | Sales analytics | Same page: the category / sede / product breakdowns and the comparison period *are* the analytics surface. `/admin/analytics` stays what it is — web analytics. |
| 2 | CMS | Six new keys. `home.hero.titolo` + `home.hero.testo` (the headline and lead paragraph), and a new **Contatti** group covering that page's title, lead and form copy. |
| 1.4 | Cash-up | A paragraph naming the divergence with the dashboard and why both rules are right. |
| 1.5 | Traceability | The Tracciabilità section now renders for a stockless product with an explanation, instead of vanishing. |

### Decisions worth not re-litigating

- **`requireAdmin()` admits staff; `requireRole("admin")` is the real gate.** Confirmed
  deliberate — `user-actions.ts` already carries the comment. Do not "fix" the name without
  checking all 50 call sites.
- **The margin uses the *current* purchase cost.** `order_items` snapshots price and VAT but
  never cost, so there is no historical figure. Both the page and the CSV say so. The proper
  fix is an `unit_cost_cents` snapshot on `order_items` written at order time — a migration
  plus every order-creation path, deliberately not done here.
- **Uncosted lines keep their revenue and are excluded from the margin, and counted.**
  Averaging them in as free would invent margin; dropping them silently would invent a
  percentage that looks like it describes the period. `coverage` is on the page for that reason.
- **An order-level discount is allocated across that order's lines, proportionally.** This is
  why the dashboard's top-product figures moved slightly (e.g. €1755 → €1719): it is the
  same engine as the report now, so the two screens cannot drift.
- **Lot tracking still requires a giacenza.** `receiveBatch` refuses otherwise, and rightly —
  receiving a lot *is* a stock movement. The fix was the missing explanation, not the rule.
- **`**…**` marks the gold fragment in an editable headline** (`components/site/Headline.tsx`),
  reusing `RichText`'s bold syntax rather than inventing a second convention. Text with no
  marker renders unchanged, which is what made adopting it on existing headings a no-op.

### Still owed, and still the owner's to supply

Unchanged by this work: `SMTP_USER`/`SMTP_PASS` (149 failed emails), the real P.IVA and sede,
Stripe keys, product photography, pickup windows — and now also the purchase cost on the 4
products that lack one, which is what would take the report's coverage to 100%.
