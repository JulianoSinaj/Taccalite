# Taccalite Gestionale — Gap Analysis (Intent vs. Reality)

_Generated 2026-07-24 on branch `feat/platform-hardening`. A full intent-vs-reality
audit of every admin and customer-facing page, the server actions behind them, and the
data model. Method: the documented intent baseline (`DOCUMENTATION.md`, `docs/gestionale-roadmap.md`)
was reconstructed first, then each page's actual code was read and compared. Findings are
cited by `file:line` and ranked Critical → High → Medium → Low._

> **How to read this.** §1 is the one-page verdict. §2 is the "fix this week" list (Critical/High).
> §3 is the per-page matrix. §4 is the data model. §5 is design/IA. §6 is the prioritized roadmap.

> **Implementation status (2026-07-24).** The entire **P0** block is now implemented and
> verified (tsc + lint 0 errors + 61 Vitest + production build, migration `0017`): **C-1**
> (VAT apportioned across discount + shipping, reconciled across report/order-detail/CSV/
> FatturaPA), **H-2/H-3** (refund & cancel restock + ledger; status dropdown can't fake a
> refund, "paid" routes through finalize), **H-4/H-5/H-6** (oversell guard; every order-driven
> stock change ledgered; manual sales link the customer + accrue loyalty), **H-7/H-8/H-9**
> (card-number retry; ledger reconciled to the applied delta; redemption-cancel refunds points),
> **H-14** (coupons counted at payment, freed on refund/cancel), **H-12** (`lib/time.ts`
> Europe/Rome `today`), and **H-20** (hot-path indexes). Remaining High items — **H-10, H-11,
> H-13, H-15, H-16, H-17, H-18, H-19** — are P1/next.

---

## 1. Executive summary

Taccalite is a **remarkably complete** self-hostable platform for a two-shop Italian
norcineria: marketing site, Stripe store, reservations (tables + Saturday porchetta with
capacity/waitlist), real loyalty, double-opt-in newsletter, an 18-section role-gated
gestionale, transactional email, cron automation, cookieless analytics, Italian fiscal
tooling (IVA, FatturaPA), 2FA, audit log, GDPR tooling, and a ⌘K palette. The architecture
is sound: server-authoritative pricing, integer-cents money, VAT-as-basis-points snapshots,
CHECK constraints mirroring enums, real foreign keys, CSRF/Origin guards + Zod on every
mutating route, pagination throughout.

**The gap is not breadth — it's correctness in the money/fiscal/loyalty paths, a set of
operator workflows that stop halfway, and an admin UI that is card-per-row where it should be
data-dense.** The single most serious issue is fiscal: the IVA report and the FatturaPA XML
compute VAT on the **pre-discount** subtotal, so any period with coupons **over-declares VAT
to the Agenzia delle Entrate**. Several money-equivalent flows (refunds, manual point debits,
cancelled redemptions) mutate one side of a ledger and not the other.

### Verdict by dimension

| Dimension | State | Headline |
| --- | --- | --- |
| **Feature breadth** | 🟢 Strong | Covers ~90% of a real deli gestionale; more shipped than the roadmap claims (e.g. the checkout coupon field is live). |
| **Fiscal correctness** | 🔴 At risk | VAT computed on pre-discount base → IVA report & FatturaPA over-state tax; period keyed on creation date not payment date. |
| **Money/ledger integrity** | 🟠 Gaps | Refunds don't restore stock or free coupons; manual point debits corrupt the ledger; redemption cancel doesn't refund points. |
| **Operator workflows** | 🟠 Half-built | No manual reservation create; waitlist promotion notifies nobody; order status dropdown skips finalize side-effects; manual counter sales bypass the inventory ledger. |
| **Inventory** | 🟠 Gaps | No stock check → silent overselling; order-driven stock changes bypass the movement ledger so on-hand can't be reconciled. |
| **Admin UI / IA** | 🟡 Adopt | Coherent but not data-dense: no data tables (sort/bulk/density), 18 flat nav items, no breadcrumbs, no dark mode, prev/next-only paging. shadcn/Radix installed but unused. |
| **Security / RBAC** | 🟢 Solid | scrypt 2^16, sliding sessions, CSRF, rate limits, RBAC defence-in-depth. One gap: 2FA has no recovery path → lockout. |
| **Data model** | 🟡 Tune | Missing hot-path indexes (esp. `orders.created_at`), a few missing fields/tables (paidAt, SKU/cost, batches, no-show, segments). |

### Severity tally (this audit)

- **Critical: 1** — VAT over-declaration (report + FatturaPA + order detail).
- **High: 19** — see §2 (H-2 … H-20).
- **Medium: ~45**, **Low: ~30** — see §3/§4.

---

## 2. Critical & High findings — the "fix first" list

### 🔴 CRITICAL

**C-1 · VAT is computed on the pre-discount base → tax over-declaration.**
`vatBreakdown()` (`lib/fiscal.ts:48-60`) aggregates only the gross of the order **lines** it
is given; it never sees `discountCents` (a negative) and treats shipping inconsistently. This
propagates to three surfaces:
- **Period IVA report** (`lib/admin/queries.ts:557-581` → `app/admin/(dash)/reports/iva/page.tsx:36-39`,
  and the same query reused by the CSV export `app/api/admin/export/[entity]/route.ts` `iva` case):
  sums `orderItems.lineTotalCents` per rate + full `shippingCents`, **never subtracts
  `discountCents`**. Any period containing coupon orders overstates both the taxable base
  (imponibile) and output VAT (imposta a debito). **Filing on this over-declares VAT.**
- **Order detail "Riepilogo IVA"** (`app/admin/(dash)/orders/[id]/page.tsx:21`): shows VAT on the
  pre-discount subtotal and omits shipping, so it doesn't reconcile with the Totale printed above it.
- **FatturaPA XML** (`lib/fattura.ts:63-107,163,174`): line details sum to the subtotal but
  `ImportoTotaleDocumento`/`ImportoPagamento` use the discounted `totalCents`, with no
  `ScontoMaggiorazione` block → Σ(imponibile+imposta) ≠ document total → **SdI would reject it**
  (or it is simply fiscally wrong). Shipping VAT is also hardcoded `2200` here vs a configurable
  setting in the report vs omitted on the order detail — **three different treatments**.
- **Fix:** make VAT allocation operate on the *actually charged* amounts — apportion the discount
  across rate buckets, include shipping under one explicit rule, and drive all three surfaces from
  one function. Add a proportional-discount VAT helper + unit tests.

### 🟠 HIGH

**H-2 · Refunds/cancellations don't restore stock.** `refundOrder` (`lib/admin/order-actions.ts:267-318`)
flips status + emails but never re-increments the stock that `finalizeOrder` decremented
(`lib/orders.ts:277-286`). Inventory drifts permanently low after every refund/cancel.

**H-3 · Order status dropdown fires fake side-effects / skips real ones.** `updateOrderStatus`
(`lib/admin/order-actions.ts:184-225`): setting **refunded** emails the customer a refund
confirmation with **no Stripe refund** (real refunds are the separate admin-only `refundOrder`),
and **staff** can do it; setting **paid** bypasses `finalizeOrder` entirely — no stock decrement,
no loyalty accrual, no low-stock alert, no customer email.

**H-4 · No stock availability check → silent overselling.** Neither `createOrder`
(`lib/orders.ts:36-159`) nor `createManualOrder` (`lib/admin/order-actions.ts:59-182`) checks
requested qty against `products.stock`; the only guard is `max(0, stock−qty)` at finalize, which
floors at 0. Stale carts, concurrency, or a direct POST oversell limited stock silently.

**H-5 · Manual counter sales bypass the inventory ledger + low-stock alerts.** A paid manual order
decrements stock with a bare `max(0, …)` (`order-actions.ts:161-168`) but writes **no**
`stock_movements` row and fires **no** low-stock email (contrast `adjustStock` and `finalizeOrder`).
Counter sales are invisible in movement history and never trigger reorders.

**H-6 · Manual paid sales don't link the customer or accrue loyalty.** `createManualOrder` never sets
`userId` and skips `finalizeOrder`, so known-customer counter/phone sales earn no points and never
appear in that customer's history.

**H-7 · Loyalty card-number collision throws on account creation.** `generateCardNumber()`
(`lib/loyalty.ts:15-17`) is `TAC-<year>-<4 digits>` = 10 000 codes/year; `cardNumber` is UNIQUE
(`schema.ts:208`) but `getOrCreateLoyaltyAccount` uses `onConflictDoNothing({target: userId})`
(`lib/loyalty.ts:25-28`), which does **not** suppress a *cardNumber* collision → uncaught UNIQUE
error. Birthday math: ~50% collision after ~118 cards issued in a year. Breaks scan accrual,
`redeemReward`, `adjustPoints`, `getLoyaltySummary` for that customer.

**H-8 · Manual point debit corrupts the ledger.** `addPoints` (`lib/loyalty.ts:138-154`) writes the
balance as `max(0, points+delta)` but records the **requested** `delta` with the **clamped**
`balanceAfter`. Debit 100 from a 30-point balance → balance 0, ledger row `delta −100 / after 0`;
summing deltas yields −70 ≠ stored 0. Points vanish untraceably and the audit line lies.

**H-9 · Cancelling a redemption never refunds the points.** `redeemReward` debits points
(`lib/loyalty.ts:216-249`); `updateRedemptionStatus` (`lib/admin/actions.ts:558-569`) writes only
`status`/`fulfilledAt`. Cancelling (reward out of stock, etc.) permanently strips the customer's
points with no credit-back and no ledger entry.

**H-10 · Porchetta capacity is a check-then-act race.** `createReservation` (`lib/reservations.ts:60-94`)
does `SELECT sum(quantityKg)` then a separate `INSERT`, not in one transaction — two concurrent
pre-orders both read under-cap and both confirm → oversell past `weeklyCapacityKg`.

**H-11 · Waitlist promotion re-checks nothing and notifies no one.** `promoteFromWaitlist`
(`lib/admin/actions.ts:200-217`) only flips `waitlisted=false`; no capacity re-check, **no
confirmation email**, leaves `status='pending'`. The customer told "sei in lista d'attesa" is never
told they got a spot.

**H-12 · "Today" is computed in UTC, not Europe/Rome.** `getTodayReservations` (`queries.ts:179`),
`getUpcomingReservations` (`queries.ts:238`), `runPorchettaReminders` (`automation.ts:33`) and
`runOwnerDigest` (`automation.ts:186`) use `new Date().toISOString().slice(0,10)` (UTC), while the
calendar and public porchetta pages use **local** date parts. From local midnight to UTC midnight
"today" resolves to *yesterday*: the dashboard hides real-today bookings, and the same dashboard's
revenue-today uses a *local* start-of-day (`queries.ts:75`) — two halves, two day boundaries.

**H-13 · No manual reservation creation in admin.** The shop takes phone bookings, but there is
`orders/new` and **no** `reservations/new` — the entire reservations surface is read/triage only.

**H-14 · Discount redemptions are counted at order creation, not payment.** `recordDiscountUse()`
runs right after insert (`lib/orders.ts:151`), before payment. Every abandoned/cancelled checkout
permanently burns a redemption; a `maxRedemptions=N` code can be exhausted by N people who never
pay. (Cancel/refund also never decrements `timesUsed`.) The cap is additionally **non-atomic**
(TOCTOU between `validateDiscount` `discounts.ts:48` and `recordDiscountUse` `discounts.ts:67-76`)
and has no per-customer limit.

**H-15 · Cart cleared before the Stripe redirect → empty checkout on cancel.** `CheckoutClient.tsx:116-117`
calls `clear()` then redirects to Stripe; on cancel, Stripe returns to `/checkout?annullato=1`
(`api/checkout/route.ts:111`) but `localStorage` is already wiped → "Il carrello è vuoto", and
`?annullato=1` is never surfaced. The success page already clears the cart. Clear only on success.

**H-16 · Site reservations aren't linked to the account → "Le tue prenotazioni" is always empty.**
`/api/prenotazioni` calls `createReservation(parsed.data)` **without** the supported `{userId}` meta
(`app/api/prenotazioni/route.ts:49`; `createReservation` accepts it, `lib/reservations.ts:36-38`; the
checkout route passes it correctly). The account page filters by `reservations.userId` and finds nothing.

**H-17 · 2FA has no recovery path → permanent lockout.** Login enforces TOTP with no bypass and no
backup codes (`lib/auth/service.ts:61-67`); a lost authenticator is only fixable by DB surgery.

**H-18 · Audit log is materially incomplete.** Unlogged despite being sensitive: `saveBlogPost` /
`toggleBlogPublished`, `saveShop` create+edit, `saveProduct`/toggles, `saveReward`/toggle,
`updateReservationStatus`, `markPorchettaReady`, `promoteFromWaitlist`, `updateRedemptionStatus`,
`removeSubscriber`, and — the standout — **`sendBroadcast`** (mass email to every subscriber,
`lib/admin/actions.ts:596`) and all outbox retries. The filter chips also omit `blog_post`, `reward`,
`reservation`, `discount` entities that the log does write.

**H-19 · Analytics referrer stats are systematically wrong.** The beacon reads `document.referrer` on
every client navigation (`components/Analytics.tsx:16`), but `document.referrer` does not change on
App-Router client navigations — so every internal navigation re-logs the original external referrer,
and `topReferrers` (`lib/analytics.ts:73-79`) massively over-attributes internal browsing to the entry
source. No self-referrer filter.

**H-20 · Hot-path DB scans: no `orders.created_at` index.** `orders` indexes only status/user/shop
(`schema.ts:390-393`), yet the dashboard revenue windows, KPI insights, VAT report, recent-orders and
the orders list all filter/sort by `created_at` (+ `paymentStatus`) — every one is a full scan +
filesort. This is the highest-value single index to add. (Details in §4.)

---

## 3. Per-page analysis (admin)

Legend for gaps: **B** = missing button/affordance · **F** = missing feature · **D** = design/layout ·
**L** = logic/correctness (severity in brackets).

### Dashboard — `app/admin/(dash)/page.tsx`
- **Intent:** morning at-a-glance — money, KPIs, work queue, today's bookings, recent orders.
- **Reality:** money row, 30-day KPI strip with deltas, CSS bar chart, top products, 5-card work queue,
  today's reservations, recent orders. Genuinely good.
- **B:** today's-reservation rows link to the whole list (no detail page exists to deep-link to); the
  "In lista d'attesa" card links to `/admin/reservations` with **no waitlist filter** (and none exists).
- **F:** no today's-porchetta-kg tile; no unfulfilled-vs-paid distinction (`ordersToFulfil` and
  `paidOrders` are the *identical* query, `queries.ts:32-35` & `50-53`).
- **L[High]:** UTC "today" mismatch (H-12). **D:** chart + delta arrows are glyph-only (limited a11y).

### Reservations list — `app/admin/(dash)/reservations/page.tsx`
- **Intent:** triage/confirm/cancel bookings; manage porchetta demand + deposits.
- **Reality:** status/type/shop chips, GET search + date range, CSV export, action-rich cards
  (promote-waitlist, one-click confirm/cancel, status+notes form, deposit form).
- **B:** no link to the linked customer; no manual-create (H-13); no waitlist filter; mark-ready only on agenda.
- **L[High]:** waitlist promotion notifies nobody (H-11); arbitrary status transitions (no state machine);
  concurrent forms on one card can clobber (`updatedAt` set but never checked). **D:** status filter chips
  render **raw English enums** (`page.tsx:113`) in an otherwise all-Italian UI.

### Reservations agenda / prep — `.../reservations/agenda/page.tsx`
- **Intent:** printable daily prep sheet with porchetta kg vs capacity.
- **Reality:** upcoming grouped by day, per-day kg vs capacity, mark-ready, print button, `print:hidden` nav. Clean.
- **B/F:** no day navigation / date filter (shows *all* upcoming forever); no shop filter; per-day kg mixes both shops.
- **L[Low]:** "Segna pronta" shows for porchetta rows even with no email → guaranteed error on click (`actions.ts:179`).

### Reservations calendar — `.../reservations/calendar/page.tsx`
- **Reality:** Mon–Sun grid, status colouring, week nav, DST-safe date math.
- **F:** no filters; entries not clickable; no capacity indicator.
- **L[Med]:** builds the week by paging `getReservationsPage` up to **20×** (each re-runs `count(*)`); one range
  query would do, and `MAX_PAGES=20` silently truncates at 500 rows/week.

### Orders list — `.../orders/page.tsx`
- **Reality:** paginated, shop/status/fulfilment chips + search, batched item preview (no N+1), inline
  status + paymentStatus dropdowns, admin CSV export.
- **L[High]:** fake-refund + skip-finalize via dropdown (H-3). **L[High/DB]:** no `orders.created_at` index (H-20).
- **F/D[Med]:** CSV export ignores active filters (dumps all orders); `to-fulfil` and `paid` chips are the same
  query; a paid-but-`fulfilled` order doesn't appear under "Pagati"; per-row selects unlabeled (a11y); no
  date/amount filter; no bulk actions; no packing-slip/print.

### Order detail — `.../orders/[id]/page.tsx`
- **Reality:** items, totals, IVA summary, customer (+loyalty link), status/tracking/payment/refund/invoice actions. Clean.
- **L[Critical]:** IVA summary ignores discount + shipping (C-1). **L[High]:** refund doesn't restore stock (H-2).
- **F[Med]:** no partial refund; refund/cancel doesn't free the coupon; no edit of line items after creation; no
  resend-email; no printable receipt/packing slip (only XML).

### Manual order — `.../orders/new/page.tsx`
- **Reality:** flat list of every sellable product with a qty input; server recomputes price/VAT/discount/shipping,
  inserts atomically, decrements stock if paid, audit-logs.
- **L[High]:** no ledger entry / low-stock alert on paid sale (H-5); no stock check (H-4); no customer link/loyalty (H-6).
- **D[Med]:** whole catalogue rendered as one flat list of number inputs — unusable past ~100 SKUs; no product
  search, customer lookup, running total, manual discount/shipping override, or kg entry for sold-by-weight lines.

### Products list — `.../products/page.tsx`
- **Reality:** all products by sortOrder, collapsible create form, per-row featured/active toggles + edit + delete,
  low-stock badge.
- **F/D[Med]:** no search/filter/pagination/sort (a single flat list, unlike orders); no bulk actions; no inline
  price/stock quick-edit; no CSV import/export; no clone. `deleteProduct` hard-deletes and FK-cascades away that
  product's `stock_movements` (`schema.ts:113`) with no audit of the lost quantities.
- **F[Low]:** no thumbnail; low-stock badge but no low-stock filter; no cost/margin/supplier/SKU fields.

### Product detail + inventory — `.../products/[id]/page.tsx`
- **Reality:** edit form; if stock-tracked: current stock, waiting badge, signed-delta adjust form, last-20 movements.
- **L[Med]:** `adjustStock` is a read-modify-write race (`actions.ts:323-347`) — reads stock, computes in JS, writes;
  concurrent with another adjust or an order finalize (which is atomic SQL) → lost updates + wrong `stockAfter`.
- **F[Med]:** ledger captures only *manual* adjustments — order-driven decrements bypass `stock_movements`, so
  on-hand can never be reconciled from the ledger; no stocktake / set-absolute mode; ledger capped at 20, no paging.

### Discounts — `.../discounts/page.tsx` + `[id]`
- **Reality:** admin-only CRUD (percent/fixed €/free-shipping), min-spend, cap, window, active/esaurito badges.
- **L[Med]:** cap not enforced atomically (H-14). **F[Med]:** no per-customer limit, first-order-only,
  product/category/shop scoping, stacking, or bulk unique-code generation; no search/filter/paging; no view of
  which orders used a code. **L[Low]:** used-up code shows the "Completata" badge; deleting a used code leaves
  `orders.discountCode` dangling.

### IVA report — `.../reports/iva/page.tsx`
- **L[Critical]:** discounts ignored → over-declares VAT (C-1). **L[High]:** period attribution by `createdAt`, not
  a payment date (no `paidAt` column exists). **L[Med]:** a later-period refund retroactively changes an
  already-filed earlier period (no credit-note line); full join scan+group per report (no index). **L[Low]:**
  `T23:59:59` end bound drops sub-second orders. **F:** no preset ranges, per-shop breakdown, drill-down, PDF.

### Loyalty list + redemptions — `.../loyalty/page.tsx`
- **Reality:** paginated customers+points, inline adjust, redemptions status queue, CSV.
- **L[High]:** ledger-corrupting debit (H-8) + no-refund cancel (H-9) both surface here; `updateRedemptionStatus`
  allows any transition and re-stamps `fulfilledAt` on unchanged saves; redemption status changes are **not audit-logged**.
- **L/D[Med]:** the "clienti" list & count include staff/admin (`getCustomersPage` has no `role='customer'` filter,
  `queries.ts:292-330`) — staff can have points adjusted; inline adjust form is cramped.

### Customer-360 — `.../loyalty/[id]/page.tsx`
- **Reality:** identity + points + ledger + orders + reservations + redemptions; GDPR export (art.15) & anonymize
  (art.17), audit-logged. Strong.
- **B/F[Med]:** no account management here (role/password/deactivate live only on `/admin/users` — split-brain);
  redemptions read-only here but fulfil-able on the list page; no reissue-card / merge-duplicates / resend-verification /
  reset-2FA; **no aggregates** (lifetime value, order count, AOV); no loyalty tier anywhere; `adminGetUser` omits
  phone/active/marketingConsent/emailVerifiedAt/totpEnabled so none can be shown.

### In-shop scan — `.../loyalty/scan/page.tsx`
- **Reality:** staff scan card + euros → accrue. Accrual-only, correctly separated from admin-only debit.
- **B/L[Med]:** no card-lookup/confirm preview before crediting (blind submit); in-shop accrual **not audit-logged**;
  `getAccountByCard` never checks `users.active` so a deactivated/anonymized card still accrues.
- **D[Low]:** `type="number"` placeholder `0,00` rejects Italian comma decimals.

### Rewards — `.../rewards/page.tsx` + `[id]`
- **F[Med]:** no reorder UI despite `sortOrder`; no per-reward stock or redemption cap (unlimited, no per-customer
  limit); no times-redeemed stat; no availability scheduling; hard-delete while in use is allowed (safe only because
  `redemptions` snapshots name/points — no FK). **D[Low]:** inactive reward reuses the "Annullata" badge.

### Users — `.../users/page.tsx`
- **Reality:** solid — last-admin guards on demote/deactivate, session kill on role/reset/deactivate, full audit.
- **B[Med]:** no resend-verification / manual-verify (status not even shown); **no reset/disable 2FA** despite
  `totpEnabled` (can't recover a locked-out user, ties to H-17); no anonymize here; no merge; no role/status search.
- **D[Med]:** three side-by-side forms per row = cramped; password fields are `type="text"` (plaintext on screen),
  no generator/copy. **L[Low]:** duplicate-email create surfaces a generic uncaught error.

### Newsletter — `.../newsletter/page.tsx`
- **Reality:** status/source filter + search, remove, compose/preview/test/send, CSV. Subscribe/confirm/unsub is race-safe.
- **F[Med]:** no campaign history (broadcasts vanish into the outbox); "segments" are raw signup `source` only, not
  reusable named segments and not tied to `marketingConsent`; **no dedupe on `sendBroadcast`** → a resubmit
  re-enqueues the whole list. **L[Med]:** the send button always reads "Invia a {confirmed} iscritti" (full count)
  even when a smaller source segment is selected — over-promises. **L[High]:** the broadcast itself is unaudited (H-18).

### Settings — `.../settings/page.tsx`
- **Reality:** admin-only typed key/value editor (`KNOWN` array) + raw-JSON fallback + SMTP/Stripe status + test email.
- **B/D[Med]:** no "save all" (~24 separate forms); no reset-to-default; no "verify SMTP" button (`verifyMailer`
  exists but is unused). **L[Med]:** `store.shippingVatRate` is consumed by the IVA export but is **not in `KNOWN`**
  → only editable via raw JSON; cron state `digest.lastSentDate` is exposed as an editable free-text field (admin can
  corrupt the digest's idempotency). **L[Low]:** numeric coercion via `JSON.parse` stores `007` as the string `"007"`.

### Security / 2FA — `.../security/page.tsx`
- **L[High]:** no recovery/backup codes → lockout (H-17). **L[Med]:** write-on-read — visiting the page persists a
  pending secret (`page.tsx:19-23`) on every GET (incl. prefetch), racing concurrent loads. **F:** no regenerate-secret,
  no active-session list / sign-out-others, no admin-side reset of staff 2FA.

### Audit log — `.../audit/page.tsx`
- **L[High]:** coverage materially incomplete (H-18). **D[Med]:** filter chips don't match the entities actually
  logged. **F:** no date/actor filter, no search, no CSV export; `meta`/`entityId` stored but never shown; no retention policy.

### Email outbox — `.../outbox/page.tsx`
- **Reality:** status filter + search + paging; per-row retry; "retry all failed".
- **L[Med]:** retry resets `attempts=0` → defeats the `maxAttempts=5` cap (a permanently-bad address retries forever);
  "Reinvio tentato." is shown even when SMTP is off and nothing was attempted; concurrent drains can double-send (no
  row-level "sending" claim). **F/DB[Med]:** UI shows only the `text` body (HTML-only mails render blank); table grows
  unbounded (no prune); **no `created_at` index** on `email_outbox` (only status) despite ordering by it.

### Analytics — `.../analytics/page.tsx`
- **L[High]:** referrer over-count (H-19). **L[Low]:** stat cards ignore the range chips (hard-coded 7/30/total).
- **F:** no custom range / period comparison; CSV is daily counts only; no funnels/entry-exit; no error-rate/uptime
  monitoring anywhere. **D[Low]:** the daily chart has no empty state (zero data → invisible bars) and no a11y fallback.

### Blog / News — `.../blog/page.tsx` + `[id]`
- **L[High]:** save/publish unaudited (H-18). **F/D[Med]:** no WYSIWYG/markdown (content is a textarea split on blank
  lines), no preview / view-on-site, no scheduling (`published` is a bool; there's no `publishAt`), no revisions, no
  SEO fields, no reorder/bulk/search; explicit-slug collision → raw unique error; list ignores `sortOrder`.

### Shops / Locations — `.../shops/page.tsx` + `[id]`
- **L[High]:** create/edit unaudited (H-18). **L[Med]:** `deleteShop` mislabels *any* DB error as an FK conflict;
  explicit-slug collision on create → raw unique error. **F:** free-text hours (no structured weekday model → the
  public "open now" can't be validated), no coordinates, no per-shop SEO, no reorder.

### Cross-cutting: media
- Solid path-traversal defence, 5 MB cap, MIME allow-list, no SVG. **L/F[Med]:** **no media library and no orphan
  cleanup** — replacing/deleting a post/product/shop never deletes the old file from `<data-dir>/uploads`, so storage
  leaks monotonically; `imageLabel` is a caption, not `alt`.

---

## 4. Data model — indexing, integrity, missing tables & fields

### 4.1 Indexing gaps (query-backed)
| # | Sev | Table | Gap | Evidence |
| --- | --- | --- | --- | --- |
| I-1 | High | `orders` | no `created_at` / `payment_status` index; every revenue window, KPI, VAT report, recent-orders & list scans+filesorts | `schema.ts:390-393`; `queries.ts:68-80,111-153,557-578,189,283` |
| I-2 | Med | `orders` | no `stripe_session_id` index → full scan per webhook/refund lookup | `schema.ts:382`; `order-actions.ts:280-282` |
| I-3 | Med | `orders` | no `email` index (guest lookups / customer-360 by email) | `queries.ts` order search |
| I-4 | Med | `order_items` | no `product_id` / `vat_rate_bps` index for sales-by-product & IVA group-by | `queries.ts:141-153,564-573` |
| I-5 | Med | `reservations` | no `created_at` index though the list default-sorts by it | `queries.ts:227` |
| I-6 | Med | `redemptions`,`newsletter_subscribers`,`users` | list queries order by `created_at` with no such index | `queries.ts:429-441,453-483,356-376` |
| I-7 | Med | `email_outbox` | no `created_at` index (only status) though ordered by it | `schema.ts:478-481` |
| I-8 | Low | `users` | no `role` / `created_at` index (dashboard customer counts, list) | `queries.ts:36-39,121-126` |
| I-9 | Low | `page_views` | `topReferrers` group has no covering index; `total` is a full `count(*)` per load | `analytics.ts:55,73-79` |

**One migration** adds most of these; `orders(created_at)` + a composite `orders(payment_status, created_at)` is the
highest-leverage.

### 4.2 Referential integrity
- `order_items.product_id`/`product_slug` — no FK (intentional snapshot), but reporting therefore aggregates on
  free-text `name` (`queries.ts:143,150`): a renamed product splits into two rows; two products sharing a name merge.
  Capture + group on a stable key.
- `redemptions.reward_id`, `orders.discount_code`, `stock_movements.created_by_user_id` — no FKs (snapshots / soft
  refs). Acceptable, but a deleted discount/reward leaves dangling labels with no audit.

### 4.3 Missing tables (feature-driven, priority order)
1. **`password_reset_tokens`** — no self-service password recovery exists (CLI `reset.cjs` is the only net); customers
   and staff who forget a password are stuck. (`users.emailVerifiedAt` exists but there's no verification-token flow either.)
2. **`product_batches`** (lot + `scadenza`/expiry, FEFO) — HACCP-relevant for fresh salumi/formaggi; only flat product
   fields exist today.
3. **`suppliers` + `purchase_orders`** — replenishment is fully manual; there is no cost price anywhere → no margin analysis.
4. **`customer_segments`** — reusable named segments for marketing (today: signup-source only).
5. **`email_campaigns`** — persisted broadcast history / schedule / open record (today: fire-and-forget into the outbox).
6. **`carts`** (server-side) — prerequisite for abandoned-cart automation.
7. **`invoices`** (fattura register) — FatturaPA `<Numero>` reuses `orderNumber` and nothing is persisted; a proper
   sezionale + credit notes + progressive numbering need a register.
8. **Reservation `tables`/slots** — no representation of tables, seats or per-timeslot capacity → double-booking is
   unpreventable.
9. **`reviews`**, **`gift_cards`/store credit** — absent (lower priority).

### 4.4 Missing / weak fields
- **orders:** `paid_at` / `fulfilled_at` / `shipped_at` (measure lead time; correct VAT period — see C-1/I-1);
  `refunded_cents` (partial refunds); separate `internal_notes`; `pickup_slot`; `invoice_number`.
- **order_items:** `actual_weight_kg` (pack-time reconciliation for sold-by-weight), `product_image` snapshot, per-line discount.
- **products:** `sku`/`barcode` (blocks scan inventory + POS), `cost_cents` (margin), `batch`/`expiry`, `supplier_id`.
- **users:** `last_login_at`, `deleted_at`/`anonymized_at` marker, `notes`, cached lifetime value, loyalty `tier`.
- **reservations:** status enum lacks **`no_show`** (`schema.ts:291`) → no-show / deposit-forfeit can't be recorded;
  no `table_number`, no deposit payment-intent id.
- **discount_codes:** no per-customer limit, no product/shop scope, no first-order-only/stackable flags.
- **loyalty_accounts:** no `tier`, no `lifetime_points`.

### 4.5 Data-layer correctness (beyond the §2 highs)
- Revenue/AOV/VAT all key on `createdAt`, not payment date (I-1/C-1) → boundary orders land in the wrong period.
- `anonymizeUser` (`lib/gdpr.ts:67-101`) scrubs user/reservations/newsletter but leaves `loyalty_accounts` (card stays
  scannable → still accrues) and `loyalty_transactions`.
- Webhook handles only `checkout.session.completed` (`webhook/route.ts:33`) — no `expired` (pending orders + burned
  coupons never cleaned up) and no refund events; doesn't verify `payment_status==='paid'`.

---

## 5. Design system & information architecture

The admin is a coherent, pleasant hand-rolled **brown/cream/gold** system (`components/admin/ui.tsx`, `forms.tsx`,
`ActionForm.tsx`): consistent pending states, inline `role="status"` feedback, confirm-on-destructive, image
upload with preview. The problem is **density and scale affordances**, not taste. Highest-leverage, all using tools
already in `package.json` (shadcn/Radix/lucide/motion) — adoption, not replacement:

1. **Data tables** (sort / bulk-select / bulk actions / density) on orders, products, customers, reservations. Today
   every list is card-per-row — not scannable or comparable at volume. This is the single biggest UX lever.
2. **Pagination with page numbers + total** (today prev/next only; the known `total` isn't surfaced).
3. **Group the 18 flat nav items** into sections (Commercio / Clienti / Contenuti / Sistema) + a real mobile drawer
   (today mobile is a horizontal scroll strip of all 18) + **breadcrumbs** on detail pages.
4. **Saved views / filter presets** ("to fulfil", "waitlisted", "low stock") — some dashboard cards already link to
   filters the target page can't express.
5. **Semantic design tokens → dark mode** (deferred because literal `bg-white`/status tints block a blind flip).
6. **Styled confirm dialog** (Radix `AlertDialog`) replacing blocking `window.confirm`, with the item name in the prompt.
7. **Charts layer** (Recharts/visx) once tables land — current charts are glyph/CSS-only with weak a11y.
8. Localize the leaked raw-enum filter chips (reservations `page.tsx:113`).

---

## 6. Prioritized remediation roadmap

Effort: **S** ≤ half-day · **M** ~1–2 days · **L** ~3–5 days.

### P0 — Correctness / legal (do first)
| Item | Refs | Effort |
| --- | --- | --- |
| **C-1** Fix VAT allocation (apportion discount + explicit shipping rule) across report, order detail, FatturaPA; add tests | fiscal.ts, queries.ts, fattura.ts | M |
| **H-2** Restore stock on refund/cancel (+ `stock_movements` row) | order-actions.ts | S |
| **H-3** Order status dropdown: gate refunded→admin+real refund; route paid→finalize | order-actions.ts | M |
| **H-8/H-9** Points debit reconciliation + refund-on-redemption-cancel | loyalty.ts, actions.ts | S |
| **H-7** Card-number generation: widen + retry-on-collision | loyalty.ts | S |
| **H-4/H-5/H-6** Stock check + ledger + customer/loyalty link on manual & online orders | orders.ts, order-actions.ts | M |
| **H-14** Count coupon at payment, atomically; free it on refund/cancel | orders.ts, discounts.ts | S |
| **H-17** 2FA backup codes + admin reset | auth, users page | M |
| **H-12** Centralize an Europe/Rome "today" helper; use everywhere | queries.ts, automation.ts | S |
| **I-1** Add `orders(created_at)` + `orders(payment_status, created_at)` (+ I-2..I-7) | schema.ts migration | S |

### P1 — Operator workflows
| Item | Effort |
| --- | --- |
| **H-13** `reservations/new` manual booking + **H-11** waitlist promotion that re-checks capacity and emails | M |
| **H-10** Wrap porchetta capacity check + insert in one transaction | S |
| **H-18** Complete audit coverage (esp. `sendBroadcast`) + fix filter chips | S |
| **H-15/H-16** Clear cart only on success + surface `?annullato`; pass `userId` on `/api/prenotazioni` | S |
| Reservation `no_show` status + deposit Stripe link; table/slot capacity model | M–L |
| Outbox: respect attempt cap on retry, honest SMTP-off message, sending-claim to stop double-send | S |
| Order edit-after-create, partial refunds, printable receipt/packing slip | M |
| Manual-order product search + customer lookup + running total | M |

### P2 — Reporting, marketing, inventory depth
| Item | Effort |
| --- | --- |
| `paidAt` column + repoint revenue/VAT to payment date; refunds as credit-note lines | M |
| Products: search/filter/pagination, SKU/barcode + cost/margin, low-stock filter, CSV import | M–L |
| Reusable customer segments + campaign history; newsletter dedupe + true segment count | M |
| Analytics: fix referrer capture, custom ranges, richer CSV; error-rate monitoring | M |
| Suppliers/POs; product batches + expiry (FEFO) | L |
| Self-service: password reset + email verification token flows; account profile/address editing | M |

### P3 — UI / scale
| Item | Effort |
| --- | --- |
| shadcn DataTable adoption (orders/products/customers/reservations) | L |
| Nav grouping + mobile drawer + breadcrumbs + saved views | M |
| Design tokens → dark mode; styled confirm dialog; charts layer | L |
| Media library + orphan cleanup | M |
| Blog WYSIWYG/scheduling/SEO; abandoned-cart; gift cards; tiered loyalty | L |

---

## 7. What is genuinely solid (don't rebuild)
Auth (scrypt 2^16 + rehash, sliding sessions, RBAC defence-in-depth), Stripe checkout with **real refunds**,
server-authoritative pricing/discount/shipping, **idempotent** paid-order finalize (atomic unpaid→paid claim),
atomic reward redemption (TOCTOU-safe), race-safe newsletter opt-in, CSRF/Origin guard + IP rate-limit + Zod on
every mutating route, honeypots, entitlement-gated order views, GDPR export/erase tooling, CSV formula-injection
escaping, nanoid PKs + integer-cents + VAT-as-bps snapshots + CHECK constraints + real FKs, pagination everywhere,
the ⌘K palette, and clean loading/error/not-found boundaries.

---

_Appendix — source reports: `scratchpad/agent-{commerce,reservations,crm,site,content-ops}.md`,
`analysis-db.md`, `analysis-design.md`._
