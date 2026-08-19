# Admin (Gestionale) — Intent vs. Reality & Roadmap

_Generated 2026-08-11 on branch `feat/platform-hardening`. A fresh page-by-page audit of
every screen under `app/admin`, the server actions behind them, and the queries they read.
Method: for each page, state what it **should** do for a two-shop Italian norcineria, then
read the code and record what it **actually** does. Findings are cited by `file:line`._

> **STATUS 2026-08-11 — the whole backlog below (P0–P3) has been implemented**, in six
> commits from `82d8f95` to `d7338f8`. §8 is the closing report: what shipped, what was
> found along the way, and the three things deliberately left out. The per-page findings
> in §3–§5 are kept as the record of *why* each change was made; read §8 first for current
> state.

> This supersedes the per-page sections of [`gestionale-gap-analysis.md`](./gestionale-gap-analysis.md)
> (2026-07-24). That document's **entire P0 block is now shipped** — see §2. The feature
> ledger lives in [`gestionale-roadmap.md`](./gestionale-roadmap.md); this file is the
> corrective backlog.

---

## 1. Verdict

The gestionale is no longer a breadth problem or a correctness problem in the main money
paths. VAT, refunds, stock, loyalty and coupons were all fixed and are now backed by tests.
What remains splits into three very different piles:

| Pile | Nature | Weight |
| --- | --- | --- |
| **Fiscal edge cases** | Partial refunds and credit notes were never folded back into the IVA report. This is the only remaining bucket that can produce a **wrong number filed with the Agenzia delle Entrate**. | 1 High, 3 Med |
| **Half-finished surfaces** | Screens that do 80 % of a job and stop: the waitlist has no list, the agenda has no date, the redemptions queue has no filter, the scan screen has no confirmation, Settings leaks cron internals. | ~20 Med |
| **Consistency debt** | The same job is done two ways in two places: two revenue truths (`createdAt` vs `paidAt`), two "clienti" counts, two chips that mean the same thing, DataTable on 2 lists out of 12, audit logging on some mutations and not others. | ~25 Med/Low |

### Scoreboard

| Dimension | State | Headline |
| --- | --- | --- |
| Fiscal correctness | 🟠 One real hole | VAT allocation is right; **partial refunds are never deducted** from the IVA report, and a full refund silently rewrites a past period. |
| Money / ledger integrity | 🟢 Solid | Refund→restock→coupon-release, cumulative `refundedCents`, idempotent finalize, points ledger reconciles. Two clamped-stock ledger rows are the only drift left. |
| Operator workflows | 🟡 Mostly there | Manual orders and bookings are real now. Gaps are at the edges: no reservation detail page, no waitlist view, no stocktake, no counter price override. |
| Inventory | 🟡 Good, not food-grade | Ledger, cost/margin, SKU, reorder point, back-in-stock. **No lot/batch + expiry at all** — the HACCP gap for fresh salumi. |
| Auditability | 🟠 Contradicts its own promise | The roadmap claims price changes are logged. `saveProduct` writes prices and logs nothing. So do ~14 other mutations. |
| Admin UI / IA | 🟡 Half-migrated | Filter chrome, DataTable, bulk bar, ⌘K all shipped — but adopted on 2 lists of 12. 18 flat nav items, no breadcrumbs, no dark mode. |
| Security / RBAC | 🟢 Strong | 2FA + recovery codes + session management + last-admin guards. One gap: **no admin-side 2FA reset for another user**. |

**Tally: 3 High · ~34 Medium · ~22 Low.**

---

## 2. Closed since the 2026-07-24 audit

Verified in code, not taken on trust. Do not re-open these.

| Was | Now |
| --- | --- |
| **C-1** VAT on pre-discount base | `orderVatBuckets()` apportions the discount across rate buckets by largest-remainder and adds shipping at its own rate; report, order detail, packing slip and FatturaPA all drive from it (`lib/fiscal.ts:113`) |
| **H-2** Refund doesn't restock | `recordRefund` → `restockOrderItems` + ledger row, fires once on the transition to full refund (`lib/orders.ts:483`) |
| **H-3** Dropdown fakes a refund | `updateOrderStatus` hard-refuses any `refunded` transition and routes `paid` through `finalizeOrder` (`lib/admin/order-actions.ts:496,506`) |
| **H-4** Silent overselling | `createOrder` and `updateOrderItems` both refuse insufficient stock by name and quantity |
| **H-5/H-6** Counter sales invisible | Manual paid sales write `stock_movements`, link the customer by email and accrue loyalty (`order-actions.ts:197-228`) |
| **H-7/H-8/H-9** Loyalty ledger | 6-digit card space + retry-on-collision; ledger records the **applied** delta; cancelling a redemption credits the points back |
| **H-10** Porchetta race | Capacity check + insert in one transaction |
| **H-11** Waitlist notifies nobody | `promoteFromWaitlist` confirms **and** emails (`reservation-actions.ts:358`) |
| **H-12** UTC "today" | `lib/time.ts` `dateInRome` / `startOfTodayRome`, used by dashboard, agenda and cron |
| **H-13** No manual booking | `reservations/new` + `createAdminReservation` + full reschedule form |
| **H-14** Coupon burned at creation | Counted in `finalizeOrder`, released on refund/cancel |
| **H-17** 2FA lockout | Recovery codes issued with enrolment, regenerable, `remainingRecoveryCodes` surfaced |
| **H-19** Referrer over-count | Beacon sends the referrer only on the first hit after a document load, and drops same-origin (`components/Analytics.tsx`) |
| **H-20** Missing indexes | `orders(created_at)`, `(payment_status, created_at)`, `(payment_status, paid_at)`, Stripe session/PI, reservations, redemptions, campaigns, outbox, audit |
| Partial refunds | Cumulative `orders.refundedCents`, Stripe partial refund, side-effects only on the full-refund transition |
| Order editing | Lines, contact, delivery and fiscal identity editable while unpaid; frozen once settled |
| Media leak | `sweepOrphanedMedia` in the maintenance job, 24 h age guard |
| Filter chrome | `SegmentedFilter` + `FilterToolbar` + `ActiveFilters` on 9 lists; CSV exports honour the active filters |

---

## 3. High findings — fix these first

### 🔴 F-1 · Partial refunds are never deducted from the IVA report

`getVatReport` selects `paymentStatus = 'paid'` and sums the order's line grosses
(`lib/admin/queries.ts:720-760`). A **partially** refunded order keeps
`paymentStatus = 'paid'` (`lib/orders.ts:476` only flips it on a full refund), and
`orders.refundedCents` is never read by the report. So a period containing any partial
refund declares taxable base and output VAT on money that was given back.

The order-detail summary has the same blind spot: `orderVatBuckets` is fed
`order.discountCents` and `order.shippingCents` but not `order.refundedCents`
(`app/admin/(dash)/orders/[id]/page.tsx:35-40`), so the IVA table there no longer
reconciles with the "Incassato netto" line printed just above it.

**Fix:** pass the refunded amount into the VAT allocation as a second apportioned
reduction, so buckets reflect net takings. One helper, three call sites (report, order
detail, packing slip), plus a unit test alongside the existing `test/fiscal.test.ts`.

### 🔴 F-2 · A full refund retroactively rewrites an already-filed period

A fully refunded order flips to `paymentStatus = 'refunded'` and therefore **disappears**
from `getVatReport` entirely — including from periods that were already filed. Refunding a
January order in March silently changes January's return.

**Fix:** keep paid orders in their original period and book the reversal as a negative
(credit-note) line in the period the refund happened, keyed on a `refundedAt` timestamp.
This needs a new column; there is no record of *when* a refund occurred today, only how
much. Pair it with **F-3**.

### 🔴 F-3 · Audit coverage contradicts the documented promise

`docs/gestionale-roadmap.md:66` states the audit log covers "refunds, role/**price
changes**, deletes, point adjustments, settings". `saveProduct` (`lib/admin/actions.ts:75`)
writes `priceCents`, `costCents`, `vatRateBps` and `stock` and calls `logAudit` **never**.
For a shop where staff (not just admins) can edit the catalogue, price history is
unreconstructable.

Unlogged mutations, full list:

| Action | File | Why it matters |
| --- | --- | --- |
| `saveProduct` | `actions.ts:75` | price, cost, VAT rate, stock — the stated promise |
| `toggleProductActive` / `toggleProductFeatured` | `actions.ts:148,161` | pulls a product off the shop |
| `addPointsByCard` | `admin/loyalty-actions.ts:26` | **the one money-equivalent action staff perform unsupervised** |
| `saveShop` (create + edit) | `actions.ts:320` | public address/hours/phone, staff-writable |
| `saveBlogPost` / `toggleBlogPublished` | `actions.ts:254,296` | publishes to the public site |
| `saveReward` / `toggleRewardActive` | `actions.ts:376,408` | changes what points buy |
| `toggleDiscountActive` | `discount-actions.ts:63` | re-arms a coupon (create/update/delete *are* logged) |
| `removeSubscriber` | `actions.ts:497` | GDPR-adjacent |
| `markPorchettaReady` | `reservation-actions.ts:327` | customer-facing email |
| `retryOutboxEmail` / `retryAllFailed` | `outbox-actions.ts:16,39` | can re-send mass mail |
| `saveCampaign` / `duplicate` / `delete` | `campaign-actions.ts:48,131,151` | only `campaign.send` is logged |
| `sendTestEmail` | `actions.ts:513` | low risk, but completes the set |

**Fix:** one `logAudit` call per action, reusing the existing shape. Half a day. Add
`product`, `blog_post`, `shop`, `campaign` to the entity labels already present in
`app/admin/(dash)/audit/page.tsx:13-25`.

---

## 4. Per-page matrix

Severity in brackets. **L** = logic/correctness · **F** = missing feature · **D** = design/IA · **A** = auditability.

### Dashboard — `app/admin/(dash)/page.tsx`
**Should:** the morning glance — what came in, what's owed, what needs doing today.
**Does:** revenue tiles, 30-day KPI strip with period deltas, revenue chart, top products,
5-card work queue, today's bookings, recent orders, integration status, quick actions.
Genuinely good.

- **L[Med] D-1** — "Ordini da evadere" and "Ordini pagati" are the **same query**:
  `queries.ts:59-62` and `queries.ts:77-80` are both `eq(orders.status,'paid')`. Two cards
  always show an identical number under different labels. Fulfilled orders also leave
  `status='paid'` behind only if nothing flips them, so neither number means what it says.
- **L[Med] D-2** — Two revenue truths. Every dashboard figure keys on `orders.createdAt`
  (`queries.ts:99,139,165,180`); the IVA report keys on `coalesce(paidAt, createdAt)`
  (`queries.ts:704`). An order created on the 31st and paid on the 1st lands in different
  months on the two screens.
- **L[Med] D-3** — Revenue sums `totalCents` and ignores `refundedCents`: a refunded order
  still counts as takings on the dashboard.
- **L[Low] D-4** — The daily chart buckets by SQL `date(created_at,'unixepoch')` — **UTC**
  (`queries.ts:155`) — while "Incasso oggi" uses `startOfTodayRome()` (`queries.ts:102`).
  Two day boundaries on one screen.
- **F[Low] D-5** — "In lista d'attesa" links to `/admin/reservations` with no waitlist
  filter, because none exists (see **R-1**).
- **F[Low] D-6** — Today's bookings link to the list, not to a booking (no detail page
  exists — see **R-2**). No today's-porchetta-kg tile, though the agenda already computes it.

### Orders list — `.../orders/page.tsx`
**Should:** the day's work queue — find an order, see its state, move it on.
**Does:** filters + search + pagination, batched item preview, one-tap "Consegnato",
bulk fulfil/cancel/reopen, per-row status + payment selects, filter-aware CSV.

- **L[Med] O-1** — The `to-fulfil` and `paid` chips resolve to the **identical** predicate
  (`filters.ts:153` maps `to-fulfil` → `paid`). Two chips, one view.
- **F[Med] O-2** — **There is no `pending` chip.** Unpaid manual drafts and abandoned
  checkouts cannot be filtered to at all, on the one screen that creates them.
- **F[Med] O-3** — No date-range or amount filter, though reservations already have
  `da`/`a` and the wiring is shared.
- **D[Med] O-4** — Still card-per-row: no column sort, no density toggle, no totals row.
  `DataTable` exists and is adopted on products and newsletter.
- **F[Low] O-5** — No bulk "stampa documenti di consegna" for the morning's pickups.

### Order detail — `.../orders/[id]/page.tsx`
**Should:** everything about one order, and every action it can still take.
**Does:** items, reconciled totals with refund lines, correct IVA table, editable lines and
contact while unpaid, tracking, partial/full refund, FatturaPA XML, fiscal identity,
packing slip, internal notes, customer link. Strong.

- **L[High] O-6** — IVA table ignores `refundedCents` (see **F-1**).
- **F[Med] O-7** — No **credit note (TD04)**. A refunded order that was already invoiced to
  SdI has no fiscal counter-document; the page only refuses further invoicing edits
  (`order-actions.ts:345`).
- **F[Med] O-8** — No "reinvia email di conferma". The only way to re-send is to bounce a
  status, which fires the wrong message.
- **F[Low] O-9** — The page tells the operator to "usa «Rimborsa» e registra un nuovo
  ordine" (`page.tsx:212`) but offers no "duplica come nuovo ordine" to do it.

### Manual order — `.../orders/new` + `ManualOrderForm.tsx`
**Should:** ring up a counter or phone sale as fast as a till.
**Does:** product search-to-cart, live totals, live VAT split, server-validated coupon,
customer lookup with address prefill, pickup/shipping, mark-paid. Excellent rebuild.

- **L[Med] O-10** — **Ledger drift on oversell.** `createManualOrder` performs no
  server-side stock check (`order-actions.ts:91-106`; the client only *warns*), then
  decrements with `max(0, stock - qty)` and writes a movement row with the **unclamped**
  `delta: -quantity` against the **clamped** `stockAfter` (`order-actions.ts:199-214`).
  Selling 5 of a product with 2 on hand records `delta −5 / after 0`; the ledger no longer
  sums to the balance. `finalizeOrder` has the same shape (`orders.ts:378-400`), reachable
  on a concurrent-oversell race. Record the applied delta, exactly as `addPoints` now does.
- **F[Med] O-11** — No manual price / discount / shipping override. A negotiated counter
  price cannot be entered at all.
- **F[Med] O-12** — Sold-by-weight products take an **integer quantity only**. The schema
  has `soldByWeight` and `unit: "kg"`, the catalogue prices per kg — but the till can only
  sell whole units of them. This is the single biggest functional hole for a norcineria.

### Products list — `.../products/page.tsx`
**Should:** the catalogue, and the reorder queue.
**Does:** DataTable with sort + density, stock/shop/category/status facets, search,
pagination, low-stock and out-of-stock views, per-row toggles. Best list in the admin.

- **F[Med] P-1** — No bulk actions, despite `BulkBar` existing and `DataTable` being here.
- **F[Med] P-2** — **No CSV export or import.** The only list with neither; a price list
  update is 200 manual saves.
- **L[Med] P-3** — `deleteProduct` hard-deletes and FK-cascades the product's entire
  `stock_movements` history away (`schema.ts:122-124`, `onDelete:"cascade"`) with nothing
  archived. Archive/soft-delete is the right default for a catalogue with a ledger.
- **A[Med] P-4** — Saves and toggles unaudited (see **F-3**).
- **F[Low] P-5** — No thumbnail column, no duplicate/clone, no inline price or stock edit.

### Product detail & inventory — `.../products/[id]/page.tsx`
**Does:** full editor, margin panel (cost vs. imponibile), signed-delta adjustments with
reason, movement ledger, back-in-stock waiters, low-stock alert reset.

- **L[Med] P-6** — `adjustStock` is still read-modify-write in JS: SELECT stock → compute
  in JS → UPDATE (`actions.ts:195-212`). Racing an order's atomic SQL decrement loses the
  update and writes a wrong `stockAfter`. Make it one `UPDATE … SET stock = max(0, stock+Δ)
  RETURNING`, like every other stock path.
- **F[Med] P-7** — No **stocktake / set-absolute** mode ("counted 14, make it 14"). An
  inventory count means doing the subtraction by hand and hoping nothing sold meanwhile.
- **F[Med] P-8** — **No lot/batch + expiry (scadenza) anywhere.** The products table has
  origin, ingredients, allergens, SKU and supplier — but no batch, no expiry, no FEFO. For
  fresh salumi and formaggi this is the HACCP traceability gap, and it is the one item
  `gestionale-roadmap.md` marks `[~]` that is actually `[ ]`.
- **F[Low] P-9** — Ledger capped at 20 rows, no paging, no export.

### Loyalty list — `.../loyalty/page.tsx`
**Should:** find a customer, adjust points, work the redemption queue.
**Does:** paginated customers with points, search, inline adjust (admin-only), redemptions
queue with status select, CSV.

- **L[Med] Y-1** — The customer list and its count include **staff and admins**:
  `customersWhere` has no `role='customer'` filter (`filters.ts:217-226`), unlike the
  dashboard's "Clienti registrati" which does (`queries.ts:63-66`). The two screens report
  different totals, and staff accounts can have points adjusted from here.
- **F[Med] Y-2** — The redemptions queue has **no filter, no search and no segmented
  control** — the only list in the admin without them. A queue that only grows.
- **D[Med] Y-3** — Card-per-row, no sort by points, no DataTable; the inline adjust form is
  three controls crammed into a row.
- **F[Low] Y-4** — No loyalty tier concept anywhere, though `docs` reference one.

### Customer 360 — `.../loyalty/[id]/page.tsx`
**Does:** identity, points, card, profile edit, GDPR export + anonymize, points ledger,
orders, reservations, redemptions. Strong.

- **F[Med] Y-5** — **No aggregates.** No lifetime value, order count, AOV or last-seen —
  the numbers that make a customer page worth opening.
- **L[Med] Y-6** — `adminGetUser` (`queries.ts:480-494`) omits `active`, `emailVerifiedAt`,
  `totpEnabled` and `marketingConsent`, so the page cannot show whether the account is
  active, verified, 2FA-protected or opted in — while the form right below it silently
  clears `emailVerifiedAt` on an email change.
- **D[Med] Y-7** — Redemptions are read-only here but actionable on the list page.
- **L[Med] Y-8** — `anonymizeUser` (`lib/gdpr.ts:67`) scrubs the user, reservations and
  newsletter but leaves `loyalty_accounts` and `loyalty_transactions` untouched: **the
  erased customer's card number stays valid and still accrues points**.

### In-shop scan — `.../loyalty/scan/page.tsx`
**Should:** the fastest safe way to credit points at the till.
**Does:** card + euros → accrual. Correctly accrual-only, so it is safe for staff.

- **L[Med] Y-9** — `getAccountByCard` never checks `users.active` (`loyalty.ts:63-79`): a
  deactivated **or anonymized** account's card still accrues (compounding **Y-8**).
- **F[Med] Y-10** — Blind submit. No lookup step showing "Mario Rossi · 240 punti" before
  the credit lands, so a mistyped digit silently credits a stranger.
- **A[Med] Y-11** — Not audit-logged. The only unsupervised money-equivalent staff action.

### Rewards — `.../rewards/page.tsx` + `[id]`
- **F[Med] W-1** — No per-reward stock and no redemption cap (global or per customer): a
  reward backed by six bottles can be claimed sixty times.
- **F[Med] W-2** — No "times redeemed" figure on the row, no reorder UI despite
  `sortOrder`, no availability window.
- **A[Low] W-3** — Save and toggle unaudited.

### Discounts — `.../discounts/page.tsx` + `[id]`
**Does:** admin-only CRUD, three types, min-spend, cap, window, active/esaurito facets,
search, pagination, create/update/delete audited.

- **L[Med] C-1** — Cap enforcement is still non-atomic: `validateDiscount` reads
  `timesUsed` (`discounts.ts:48`); the increment happens later at payment
  (`discounts.ts:82`). Two simultaneous checkouts both clear a `maxRedemptions = 1` code.
  Much less likely now that counting moved to payment, but the TOCTOU is unchanged.
- **F[Med] C-2** — No per-customer limit, no first-order-only, no product/category/shop
  scoping, no stacking rules, no bulk unique-code generation.
- **F[Med] C-3** — No "which orders used this code" drill-down; `timesUsed` is a bare
  counter, and deleting a code leaves `orders.discountCode` dangling with no trace.
- **A[Low] C-4** — `toggleDiscountActive` unaudited.

### Reservations list — `.../reservations/page.tsx`
**Should:** triage the phone book — confirm, move, cancel, take a deposit, work the waitlist.
**Does:** status/type/shop/date filters + search, bulk status, one-click confirm/cancel,
`no_show` with deposit forfeit (reversible), deposit tracking, full reschedule form, manual
create, waitlist promotion with email, filter-aware CSV. Transformed since July.

- **F[Med] R-1** — **No waitlist facet.** `reservationsWhere` (`filters.ts:189-207`) has no
  `waitlisted` condition, so the waitlist exists as a per-row badge and nothing else: it
  can't be listed, counted in context, or linked to from the dashboard card that counts it.
- **F[Med] R-2** — **No reservation detail page.** `reservations/[id]` doesn't exist, so the
  dashboard, the calendar and the customer 360 all have bookings they cannot link to, and
  every action must happen inside a list row.
- **F[Med] R-3** — **No table/seat capacity model.** Porchetta kg is capped; seats are not.
  `guests` is a free integer with no `tables` concept and no per-slot capacity, so
  double-booking Saturday dinner is unpreventable — the one reservation type the shop
  actually runs on a calendar.
- **L[Low] R-4** — `promoteFromWaitlist` neither re-checks capacity nor warns, unlike
  create and reschedule which both append a `capacityWarning`.
- **L[Low] R-5** — Concurrent per-row forms can still clobber each other: `updatedAt` is
  written but never compared.

### Agenda / prep — `.../reservations/agenda/page.tsx`
**Should:** the printable sheet the kitchen works from this morning.
**Does:** upcoming grouped by day, per-day porchetta kg vs. capacity, mark-ready, print-clean.

- **F[Med] R-6** — Shows **all** upcoming reservations, forever. No day navigation, no date
  filter, no shop filter — the print output grows without bound and can't be scoped to
  "tomorrow".
- **L[Med] R-7** — The kg badge compares a **per-day** total against a setting named
  `porchetta.weeklyCapacityKg` and labelled "Capacità porchetta settimanale"
  (`settings/page.tsx:80-87`). `checkPorchettaCapacity` also sums a single date
  (`reservations.ts:56-58`), so the behaviour is per-day and the label is wrong — and the
  cap is shared across **both shops**, which prepare separately.
- **L[Low] R-8** — "Segna pronta" renders for porchetta rows with no email
  (`agenda/page.tsx:103-113`); clicking always throws "Nessuna email per questa
  prenotazione" (`reservation-actions.ts:334`). A button that can only fail.
- **A[Low] R-9** — `markPorchettaReady` unaudited.

### Calendar — `.../reservations/calendar/page.tsx`
- **L[Med] R-10** — Builds the week by paging `getReservationsPage` up to **20 times**
  (`calendar/page.tsx:69-78`), each iteration re-running its own `count(*)`. One range query
  would do it; the cap silently truncates at 500 bookings/week.
- **F[Med] R-11** — Entries aren't clickable (nothing to click to — **R-2**), no filters, no
  per-day capacity or seat indicator.
- **L[Low] R-12** — `todayISO()` uses the **server's** local calendar
  (`calendar/page.tsx:18-21`) instead of `dateInRome()`. Under a UTC container the "today"
  highlight sits on the wrong day for the last hours of every evening.

### IVA report — `.../reports/iva/page.tsx`
**Does:** per-rate imponibile/imposta over a date range, keyed on payment date, discount
apportioned per order, business identity in the header, CSV. Correct for the common case.

- **L[High] V-1 / V-2** — Partial refunds not deducted; full refunds rewrite past periods.
  See **F-1** and **F-2**.
- **F[Med] V-3** — No per-shop breakdown and no drill-down from a bucket to the orders
  behind it, so a number can't be checked without SQL.
- **L[Low] V-4** — The `to` bound is `T23:59:59` (`page.tsx:25`, `export/[entity]:121`):
  orders paid in the final second of a period are dropped.
- **F[Low] V-5** — No preset ranges (mese/trimestre corrente), no PDF for the commercialista.

### Users — `.../users/page.tsx`
**Does:** role, password reset, activate/deactivate, profile edit, last-admin guards,
session invalidation on every security event, fully audited. Solid.

- **F[Med] U-1** — **No admin-side 2FA reset.** Every action in `security-actions.ts`
  targets `actor.id` (`:19,52,77,106`). A staff member who loses their phone *and* their
  recovery codes is still only recoverable by editing the database.
- **F[Med] U-2** — Email-verification state is neither shown nor actionable (no resend, no
  manual verify), and `getUsersPage` (`queries.ts:458-478`) doesn't select
  `emailVerifiedAt`, `totpEnabled` or even `active` — the page runs a **second query** just
  to read `active` (`users/page.tsx:40-44`).
- **F[Med] U-3** — No search, no role filter, no status filter. Pagination and nothing else.
- **D[Low] U-4** — The reset field is `type="text"`: the new password is displayed in clear
  on a back-office screen. No generator, no copy button.

### Newsletter — `.../newsletter/page.tsx`
**Does:** campaigns with draft / schedule / send / duplicate / delete and a real history,
atomic send claim, cron delivery of due campaigns, DataTable with sort and density,
filters, filter-aware CSV, send audited. Big upgrade over fire-and-forget.

- **F[Med] N-1** — "Segments" are still just the signup `source` string
  (`campaign-actions.ts:22-27`, `automation.ts:151-152`). No reusable named segments, no
  targeting by spend, points or purchase history, and no link to `users.marketingConsent`.
- **F[Med] N-2** — A campaign records `recipientCount` and nothing else. Failures land in
  the outbox and never roll back up to the campaign, so "Inviata · 412 destinatari" can
  hide 80 bounces.
- **A[Low] N-3** — Draft/duplicate/delete and `removeSubscriber` unaudited.

### Email outbox — `.../outbox/page.tsx`
**Does:** status filter, search, pagination, per-row retry, retry-all, honest SMTP-off
banner, 90-day pruning in the maintenance job.

- **L[Med] E-1** — Retry sets `attempts = 0` (`outbox-actions.ts:24,45`), defeating the
  `maxAttempts: 5` cap in `drainOutbox` (`mailer.ts:119`). A permanently invalid address can
  be retried forever, and "Riprova tutte" resets the entire failed set.
- **L[Med] E-2** — **`drainOutbox` has no row-level claim** (`mailer.ts:113-131`): it selects
  candidates, then delivers them one at a time. The cron sweep racing a manual retry (which
  also calls `drainOutbox`) sends the same message twice. A `status='sending'` claim on the
  select would close it.
- **D[Med] E-3** — The preview renders `e.text` only (`outbox/page.tsx:100`); an HTML-only
  message shows an empty box.
- **L[Low] E-4** — "Reinvio tentato." is returned even when SMTP is off and the drain was a
  no-op (`mailer.ts:111`).
- **A[Low] E-5** — Retries unaudited.

### Analytics — `.../analytics/page.tsx`
**Does:** cookieless page views, 7/30/90 ranges, daily chart, top paths, top referrers
(now correctly entry-only), CSV.

- **L[Med] A-1** — The three headline cards are hard-coded 7 / 30 / total
  (`analytics/page.tsx:63-65`) and **ignore the range chips directly above them**. Picking
  "90 giorni" changes the chart and the tables but not the numbers.
- **F[Med] A-2** — Page views are never joined to orders. No funnel, no revenue per source,
  no "which product page sells" — the questions a shop actually has.
- **F[Low] A-3** — CSV exports daily counts only; top paths and referrers can't leave the page.
- **D[Low] A-4** — No empty state: a range with no data renders an invisible row of bars.

### Blog / News — `.../blog/page.tsx` + `[id]`
**Does:** filters, categories, pagination, image upload, and real scheduled publishing —
`published && date <= today` (`lib/db/queries.ts:60-68`).

- **D[Med] B-1** — A future-dated published post shows as **"Pubblicato"** in the admin
  while the site hides it. The one screen that manages scheduling is the one place
  scheduling is invisible; it needs a "Programmato per…" state.
- **F[Med] B-2** — Content is a textarea split on blank lines (`actions.ts:259-262`): no
  rich text, no links, no inline images, no preview, no "vedi sul sito".
- **A[Med] B-3** — Save and publish-toggle unaudited.
- **F[Low] B-4** — No SEO fields, no revisions, no reorder despite `sortOrder`.

### Shops — `.../shops/page.tsx` + `[id]`
- **L[Med] S-1** — Opening hours remain free-form `{label, value}` strings parsed
  best-effort at render (`lib/hours.ts`), which fails safe by showing **nothing**. Nothing
  in the admin validates the text, so a typo silently removes the "aperto adesso" badge from
  the public site with no signal to the operator. `hoursConfirmed` is a flag, not a check.
- **A[Med] S-2** — `saveShop` create and edit are unaudited, and staff (not just admins) can
  rewrite the shop's public address, phone and hours.
- **L[Low] S-3** — `deleteShop` reports **any** DB error as an FK conflict
  (`actions.ts:361-366`), so a real failure is mislabelled.
- **F[Low] S-4** — No coordinates/map, no per-shop SEO, no reorder UI, no holiday closures.

### Settings — `.../settings/page.tsx`
**Does:** 24 typed fields (including `store.shippingVatRate`, now first-class), a cron panel
with last-run status and "esegui ora", SMTP/Stripe status, test email. Much stronger.

- **L[Med] G-1** — **Cron internals leak into the editable UI.** `cron.lastRun.*` and
  `digest.lastSentDate` aren't in `KNOWN`, so they render under "Altri parametri" as
  free-text JSON inputs (`settings/page.tsx:300,414-425`). An admin can corrupt the digest's
  idempotency marker or fabricate a run record from the settings screen.
- **F[Med] G-2** — 24 independent forms with 24 Save buttons. No "salva tutto", no
  reset-to-default, no dirty indicator.
- **F[Med] G-3** — `verifyMailer()` exists (`mailer.ts:135`) and is **never called**. There
  is still no "verifica connessione SMTP" — only "send a test email and go look in the
  outbox", which can't distinguish a bad password from a bad recipient.
- **L[Low] G-4** — Non-text values round-trip through `JSON.parse`, so `007` is stored as
  the string `"007"` and `getSetting<number>` then hands a string to arithmetic.

### Security — `.../security/page.tsx`
**Does:** TOTP enrolment with QR, recovery codes with remaining count, active session list,
sign-out-others, disable 2FA. All audited.

- **L[Med] X-1** — **Write-on-read.** A GET persists a fresh TOTP secret whenever none
  exists (`security/page.tsx:26-30`). A link prefetch mutates the user row, and two
  concurrent loads can leave the user scanning a QR for a secret that was just overwritten.
  Mint the secret in an action behind a button.
- **F[Med] X-2** — No enforcement policy (can't require 2FA for admins), no last-login
  timestamp, no failed-login log — so there is nothing to review after an incident.

### Audit log — `.../audit/page.tsx`
**Does:** entity / actor / date-range / full-text filters, CSV export, `meta` rendered as a
readable table, Italian entity labels. The viewer is now genuinely good.

- **A[High] Z-1** — Coverage, not the viewer, is the problem. See **F-3**.
- **F[Low] Z-2** — No retention policy: the table grows forever, unlike the outbox.

---

## 5. Cross-cutting

- **Design-system migration is 2/12 done.** `DataTable` (sort + density) is on products and
  newsletter; `BulkBar` is on orders and reservations. Orders, customers, reservations,
  users, blog, rewards, discounts, shops, outbox and audit are all still card-per-row.
- **Navigation:** 18 flat items, no grouping, and mobile is a horizontal scroll strip of all
  18 (`AdminNav.tsx:28-48,80`). No breadcrumbs — only an ad-hoc `BackLink` on some pages.
- **Dark mode** still blocked on literal `bg-white` + status tints; needs a token pass.
- **Destructive actions** still gate on `window.confirm`, with Radix `AlertDialog` installed
  and unused.
- **No saved views / filter presets**, so recurring questions ("da evadere oggi", "scorte
  basse in Sede 2") are retyped every time.
- **Missing indexes**, low value but free: `orders(email)` for guest lookup,
  `page_views(referrer)` for the referrer group-by.

---

## 6. Roadmap

Effort: **S** ≤ half-day · **M** ~1–2 days · **L** ~3–5 days.

### P0 — Fiscal & trust (do first)

| # | Item | Refs | Effort |
| --- | --- | --- | --- |
| 1 | **F-1** Deduct refunds from VAT: apportion `refundedCents` in `orderVatBuckets`, wire into report + order detail + packing slip, add tests | `fiscal.ts`, `queries.ts:716`, `orders/[id]` | M |
| 2 | **F-2** Add `refundedAt`; keep refunded orders in their original period and book the reversal as a credit-note line in the refund period | schema, `orders.ts:452`, `queries.ts:716` | M |
| 3 | **F-3** Close the audit gap — one `logAudit` per unlogged mutation (14 actions), add the missing entity labels | `actions.ts`, `loyalty-actions.ts`, `outbox-actions.ts`, `campaign-actions.ts` | S |
| 4 | **O-10** Record the **applied** stock delta in `stock_movements` (manual sale + finalize), mirroring the `addPoints` fix | `order-actions.ts:199`, `orders.ts:378` | S |
| 5 | **Y-8/Y-9** Anonymize the loyalty account too; refuse accrual for inactive users | `gdpr.ts:67`, `loyalty.ts:63` | S |
| 6 | **U-1** Admin-side 2FA reset for another user (audited, kills sessions) | `security-actions.ts`, `users/page.tsx` | S |
| 7 | **D-1** Make "Ordini da evadere" ≠ "Ordini pagati"; **D-3** net revenue of refunds | `queries.ts:53-123` | S |
| 8 | **E-1/E-2** Outbox: respect the attempt cap on retry; claim rows before draining | `outbox-actions.ts`, `mailer.ts:102` | S |
| 9 | **G-1** Move `cron.lastRun.*` + `digest.lastSentDate` out of the editable settings surface | `settings/page.tsx:300` | S |
| 10 | **X-1** Mint the TOTP secret in an action, not on page render | `security/page.tsx:26` | S |

### P1 — Operator workflows

| # | Item | Effort |
| --- | --- | --- |
| 11 | **O-12** Sell by weight at the counter: kg entry for `soldByWeight` lines, and **O-11** a price/discount override | M |
| 12 | **R-2** Reservation detail page, and link the dashboard, calendar and customer 360 to it | M |
| 13 | **R-1** Waitlist facet + **O-2** `pending` orders chip + **O-3** order date range | S |
| 14 | **R-6/R-7** Agenda: day navigation and shop filter; per-shop porchetta capacity, and rename the setting to match its per-day behaviour | M |
| 15 | **P-6/P-7** Atomic `adjustStock`, plus a stocktake (set-absolute) mode | S |
| 16 | **Y-2** Redemptions queue: status filter + search; **Y-1** exclude staff from the customer list | S |
| 17 | **Y-10/Y-11** Scan: confirm-before-credit step, and audit the accrual | S |
| 18 | **D-2** One revenue truth — repoint every dashboard/KPI window to `coalesce(paidAt, createdAt)` | S |
| 19 | **O-8** Resend order confirmation; **O-7** credit-note (TD04) XML | M |
| 20 | **U-2/U-3** Users: show verification + 2FA state (one query), search and role filter | S |
| 21 | **B-1** "Programmato" state in the news list; **G-3** SMTP verify button | S |

### P2 — Depth: inventory, reporting, marketing

| # | Item | Effort |
| --- | --- | --- |
| 22 | **P-8** `product_batches` — lot + scadenza + FEFO picking, surfaced on the product page and the packing slip | L |
| 23 | **R-3** Table/slot capacity model: tables, seats, per-slot caps, double-booking prevention | L |
| 24 | **P-2** Catalogue CSV import/export + **P-1** bulk actions + **P-3** archive instead of hard-delete | M |
| 25 | **V-3/V-5** IVA: per-shop breakdown, bucket drill-down, preset ranges, PDF | M |
| 26 | **N-1/N-2** Reusable customer segments; roll outbox failures back onto the campaign | M |
| 27 | **W-1/W-2** Reward stock, redemption caps, times-redeemed, availability window | M |
| 28 | **C-1/C-2/C-3** Atomic coupon cap; per-customer limit and scoping; "orders that used this code" | M |
| 29 | **A-1/A-2** Analytics: honour the range on the stat cards; join page views to orders for a funnel | M |
| 30 | **S-1** Structured opening hours (weekday model) replacing the free-text parser | M |
| 31 | Suppliers + purchase orders; self-service password reset & email verification token flows | L |

### P3 — UI, scale, polish

| # | Item | Effort |
| --- | --- | --- |
| 32 | Finish the `DataTable` migration: orders, customers, reservations, users | L |
| 33 | Nav grouping (Commercio / Clienti / Contenuti / Sistema) + mobile drawer + breadcrumbs | M |
| 34 | Saved views / filter presets, wired to the dashboard cards that already want them | M |
| 35 | Semantic design tokens → dark mode; Radix `AlertDialog` replacing `window.confirm` | L |
| 36 | Charts layer (Recharts) for dashboard + analytics, with accessible fallbacks | M |
| 37 | **B-2** Rich-text news editor + preview + SEO fields; **Z-2** audit retention | M |
| 38 | Gift cards / store credit, B2B price lists, tiered loyalty, abandoned cart | L |

---

## 7. Solid — do not rebuild

Server-authoritative pricing with VAT-as-bps snapshots and integer cents · apportioned VAT
allocation reconciled across four surfaces · idempotent paid-order finalize with an atomic
unpaid→paid claim · cumulative refunds converging with the Stripe webhook · restock +
coupon release on the full-refund transition only · TOCTOU-safe reward redemption ·
points ledger that sums to the balance · card-number retry-on-collision · transactional
porchetta capacity · Europe/Rome date helpers · scrypt 2^16 with rehash, sliding sessions,
RBAC defence-in-depth, 2FA with recovery codes and session management · CSRF/Origin guard +
rate limit + Zod on every mutating route · shared filter builders driving both list pages
and CSV exports · trigram FTS with LIKE fallback · cron registry with visible last-run
status and run-now · media orphan sweep · campaign send claim · the ⌘K palette · toasts
that survive a save-and-redirect · clean loading/error boundaries.

---

_Audit basis: every file under `app/admin`, `components/admin`, `lib/admin`, plus
`lib/{orders,fiscal,loyalty,discounts,reservations,automation,analytics,gdpr,media,mail}`
and `lib/db/schema.ts`, read at commit `2683512`._

---

## 8. Closing report (2026-08-11)

Every item in §6 was implemented. Six commits, two migrations (`0027`, `0028`), 191 tests
(up from 142), tsc + lint + production build clean.

| Commit | Covers |
| --- | --- |
| `82d8f95` | **P0 fiscal** — F-1, F-2, credit notes (TD04), period presets, resend email |
| `e4a051a` | **P0 audit** — F-3 (15 mutations), outbox attempt cap + drain claim, structured hours |
| `c1cc176` | **P0 rest** — one stock ledger, one revenue truth, 2FA reset, GDPR loyalty erasure, TOTP write-on-read, cron state |
| `9b46b51` | **P1** — sell by weight, reservation detail page, seat capacity, per-shop porchetta, agenda day nav, scan confirm, waitlist/unpaid facets |
| `b6bb203` | **P2** — lot/expiry (FEFO), catalogue CSV, coupon limits + ledger, named segments, campaign delivery, IVA per-shop, analytics |
| `d7338f8` | **P3** — bulk-bar crash, nav grouping + drawer + breadcrumbs, `<dialog>` confirms, sortable orders, saved views, audit retention, news SEO |

### Found during the work, not in the original audit

**The bulk action bar crashed both lists that use it.** `BulkBar` took
`confirm={(n) => string}` — a function passed from a server component to a client one,
which React cannot serialise. `/admin/orders` and `/admin/reservations` fell into their
error boundary whenever there was at least one row to select. It predates this branch and
was invisible to tsc, lint and the test suite; it surfaced only on loading the pages. A
sweep confirmed `BulkBar` was the only client component taking a function prop.

**A stock decrement clamped at zero recorded the wrong delta**, so the movement ledger
stopped summing to the balance — the same defect the loyalty ledger had been fixed for.
Now every inventory path goes through one atomic helper (`lib/stock.ts`).

**The porchetta capacity setting was misnamed and shop-blind.** Labelled "settimanale" but
applied per pickup day, and summed across both shops — wrong for each. Renamed
`porchetta.capacityKgPerDay`, scoped per location, with the old key read as a fallback.

### Deliberately not done

1. **A charting library.** The finding was that CSS-div charts are inaccessible, and that
   is fixed — both charts have empty states and text alternatives. Adding Recharts would be
   a new dependency for an aesthetic gain nobody asked for.
2. **Gift cards, B2B price lists, tiered loyalty, abandoned cart** (§6 item 38). These were
   listed as future product scope, not defects — no behaviour is currently wrong because
   they are absent.

### Verification

All 36 admin routes were loaded against a running dev server and checked for the app's own
error boundary (not just a generic "Application error" string — that mistake is what let
the bulk-bar crash hide behind a 200 response). All 8 CSV exports were downloaded and
their headers checked. Nav grouping, breadcrumbs, the sortable orders table, saved views,
segments, expiry report, catalogue import, audit retention and the scan confirm step were
each confirmed present in rendered output.

**Not verified: client-side interactivity.** The browser pane cannot be displayed in this
environment, so the tab reports `visibilityState: "hidden"` and React defers hydration
indefinitely. The confirm dialog, the hours editor, the scan lookup, the saved-view naming
form and the counter's live totals are therefore only verified as far as their
server-rendered markup. They should be clicked through once on a real screen.

## 9. Dark mode (2026-08-11)

Previously deferred as "needs a token refactor verified in a browser". Both halves are now
done.

**Tokens.** `app/globals.css` gained a semantic layer — `--surface`, `--surface-muted`,
`--surface-sunken`, and `ok` / `warn` / `danger` / `info` each with a solid, a soft tint and
a soft foreground — exposed to Tailwind through `@theme inline`. The dark theme then
*inverts the brand ramp* (`--color-brown-950` becomes the lightest, `--color-cream` the
darkest) so the ~200 existing `text-brown-800` / `bg-cream` utilities keep their meaning
without being touched. 31 admin files had their literal `bg-white` and `bg-emerald-100`-style
tints rewritten to tokens.

**Scope.** `data-theme` sits on the dashboard shell div, not `<html>` — the storefront keeps
its own art direction. The value is resolved from a cookie during the server render
(`lib/admin/theme.ts`), so there is no flash and no blocking inline script. The toggle is
three submit buttons in the nav footer; it needs no client JS.

### Two traps worth remembering

**`light-dark()` does not survive the build.** Stating each value once was the obvious
design. Lightning CSS down-levels `light-dark()` into a `var(--lightningcss-light, X)
var(--lightningcss-dark, Y)` toggle, and it only emits the wiring for `:root`, `.light` and
`.dark` — never for an attribute selector. On `[data-theme]` every descendant silently
resolves to the light branch. The dark block is therefore written out twice, once for
`[data-theme="dark"]` and once inside `@media (prefers-color-scheme: dark)` for
`[data-theme="system"]`, and `test/theme-tokens.test.ts` asserts the two copies stay
identical.

**Gold does not invert.** `--color-gold` stays light in both themes, so `bg-gold
text-brown-950` would have gone light-on-light. A constant `--on-gold` carries the ink for
the ten solid-gold surfaces. The test pins it and asserts it is absent from the dark block.

### Verification

Numbers, not screenshots — the pane still cannot composite frames.

- All 38 admin routes fetched in **both** themes (76 requests): no error boundary, and
  every page carries the right `data-theme`.
- Computed styles confirmed on `system` (OS dark), explicit `light` and explicit `dark`.
  Explicit `light` correctly beats an OS that prefers dark.
- A WCAG contrast pass over every text-bearing element: **dark introduces no new failures
  and is better than light on every shared one.** On `/admin/orders`, dark has 51
  sub-AA elements against light's 84, and all of them come from two pre-existing utilities
  (`text-brown-800/50` at 12px, 3.65 in dark vs 2.97 in light; plus the disabled pagination
  link, which WCAG exempts). Those are a light-theme debt, not a dark-mode regression.
- Every status badge synthesised and measured: minimum contrast 7.88, and `no_show` stays
  distinguishable from `pending` via its ring now that both map to `warn`.

One environment note for whoever verifies next: React streams the page body in and reveals
it from a `requestAnimationFrame` callback. rAF never fires while the tab is hidden, so the
content sits parked as a **sibling of `<body>`**, outside `[data-theme]`, and every probe
reports light tokens. Calling `$RV($RB)` in the console performs the reveal and the DOM
becomes the real one. Also: never run `next build` against a live `next dev` — they share
`.next`, and the dev server will then serve a stale stylesheet.
