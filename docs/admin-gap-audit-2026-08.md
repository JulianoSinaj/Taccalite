# Gestionale — what is still missing (2026-08-24)

_Method: read all 39 routes under `app/admin`, the 20 modules in `lib/admin`, `lib/db/schema.ts`,
`lib/orders.ts`, `lib/stock.ts`, `lib/automation.ts`, `lib/auth/*`, every `app/api/**` route, and
the public paths each admin control is supposed to reach. For every page I asked the same two
questions: **what is this screen for**, and **can it actually do that**._

This is the fourth pass. It deliberately does not repeat
[`admin-missing-surfaces.md`](./admin-missing-surfaces.md) (2026-08-21, A–G all closed) or
[`admin-pages-roadmap.md`](./admin-pages-roadmap.md) (2026-08-11). Everything below is new.

---

> **All 30 findings closed, 2026-08-24.** Each section below is left as written
> so the reasoning survives; see [§7](#7-what-shipped) for what each fix was and
> where it lives. Two new screens came out of it — a **chiusura di cassa** and a
> **registro fatture** — plus 12 regression tests and a fix to the test harness,
> which only passed on a fresh checkout.

## 0. Headline

The surface coverage is genuinely good — 138 server actions, all but two wired to UI, full CRUD
almost everywhere, audit logging that links back to the entity it touched. The gaps are no longer
"there is no screen for X". They are of four kinds:

| Kind | Count | Worst example |
| ---- | ----- | ------------- |
| **Access control that stops one layer short** | 8 | Staff can read any password-reset link in `/admin/outbox` |
| **Money that goes out of sync** | 6 | Cancelling a paid order returns the goods and keeps the money |
| **Controls that do nothing** | 7 | Four settings in Impostazioni are read by no code at all |
| **Connections that were never finished** | 9 | Receiving a lot restocks a product without notifying anyone waiting for it |

---

## 1. 🔴 Access control

The scope model in `lib/admin/scope.ts` states its own rule: *"the scope is applied in three
places… missing any one of the three leaves the data reachable by typing a URL."* Six surfaces
apply fewer than three.

### 1.1 · `/admin/outbox` hands staff a password-reset link for any account

`components/admin/AdminNav.tsx:92` lists **Email** without `adminOnly`, and
`app/admin/(dash)/outbox/page.tsx` has no role check. The page renders `e.text` — the full plain
-text body — inside a `<pre>`.

`lib/auth/service.ts:367` sends the reset mail through `sendMail`, which inserts the body into
`email_outbox` before delivery (`lib/mail/mailer.ts:70`). `passwordResetEmail`
(`lib/mail/templates.ts:728`) puts the one-time reset URL in that body verbatim. So does
`verifyEmailEmail`.

A staff account can therefore request a password reset for the owner's address, open
`/admin/outbox`, and read the link. This is a full privilege escalation from `staff` to `admin`,
and it needs no unusual timing — every reset link ever sent is sitting in that list until the
90-day prune.

**Fix:** gate `/admin/outbox` to `admin`, or redact bodies for non-admins (subject + status +
recipient is all the retry workflow needs). The first is one line.

### 1.2 · The packing slip ignores the shop boundary

`app/admin/(dash)/orders/[id]/page.tsx:55` calls `assertShopScope`.
`app/admin/(dash)/orders/[id]/packing-slip/page.tsx` does not — zero occurrences. Same order, same
customer name, address, phone and total, one URL segment further along.

### 1.3 · Five more screens read across locations

None of these force `shopScope()` into their query; they take the shop from the query string,
which a scoped operator can edit:

| Route | Query | What leaks |
| --- | --- | --- |
| `/admin` (dashboard) | `getDashboardStats/Insights` — no shop param at all | Whole-business revenue, other shop's bookings and recent orders |
| `/admin/fulfilment/oggi` | `getFulfilmentDay(from, to, sp.negozio)` | Other shop's pickups, deliveries, customer phone numbers |
| `/admin/reservations/agenda` | `getUpcomingReservations({ shopSlug: sp.negozio })` | Other shop's day sheet |
| `/admin/reservations/calendar` | `getReservationsPage({ da, a })` | The whole week, both shops |
| `/admin/products/scadenze` | `getExpiringBatches(through)` then filters in JS | Other shop's lots — **and offers the write-off button on them** (see 1.4) |

The dashboard is the one worth arguing about: for a scoped operator it is titled *"La tua
giornata"* and shows somebody else's.

### 1.4 · Batch actions have no scope check at all

`lib/admin/batch-actions.ts` — `receiveBatch`, `writeOffBatch`, `correctBatchRemaining` — call
`requireAdmin()` (which admits staff) and never `requireShopScope`. Combined with 1.3, a Carni
operator can open `/admin/products/scadenze`, see Centro's lots, and press **Scarica** on them.
That is a cross-location inventory *write*, not just a read.

Every other write path in the codebase does this correctly (`mustFindOrder`,
`mustFindReservation`, `saveProduct` checks both the old and the new `shopSlug`). Batches were
added after the scope work and missed it.

### 1.5 · Reservations can be created for, and moved to, another location

- `createAdminReservation` (`lib/admin/reservation-actions.ts:138`) never checks `d.shopSlug`.
- `updateReservationDetails` (`:205`) checks the booking's **current** shop via
  `mustFindReservation`, then writes `shopSlug: d.shopSlug` without re-checking. A scoped operator
  can push a booking into the other shop and lose sight of it.

`saveProduct` shows the intended pattern at `lib/admin/actions.ts:218-219` — *both ends of the
move*.

### 1.6 · Any staff member can edit any shop

`app/admin/(dash)/shops/[id]/page.tsx` has no role check and no scope check; `saveShop`
(`lib/admin/actions.ts:632`) uses `requireAdmin()` (staff-inclusive). Only *creating* and
*deleting* a shop are `requireRole("admin")`. So a counter person at one location can change the
other location's address, opening hours, porchetta capacity and service toggles.

### 1.7 · The orders list shows a filter state it is not honouring

`app/admin/(dash)/orders/page.tsx:78` correctly locks the query with `lockShop(...)`, but line 115
builds the chip state from the **raw** search params:

```ts
const { negozio = "all", … } = sp;
const current = { negozio, stato, tipo, da, a, … };
```

A scoped operator clicking "Centro" sees the chip highlight move and the results not change.
`/admin/products` gets this right (it feeds the chips from the locked `filters`), so the two lists
disagree with each other. `SHOP_CHIPS` also lists every shop to an operator who can only ever see
one.

### 1.8 · Staff can mass-mail the customer list they are not allowed to export

`/api/admin/export/subscribers` is `requireRole("admin")` and the CSV button is admin-gated
(`newsletter/page.tsx:288`). But every action in `lib/admin/campaign-actions.ts` — including
`sendCampaign` — is `requireAdmin()`, i.e. staff. Downloading the list is a full-admin act;
sending to all of it is not. Pick one.

---

## 2. 🔴 Money and inventory going out of sync

### 2.1 · Cancelling a paid order returns the goods and keeps the money

`lib/admin/order-actions.ts:706`. `updateOrderStatus` refuses `refunded` (correctly — that must go
through the Rimborsa button) and refuses `paid` (correctly — that must go through Registra
incasso). It does **not** refuse `cancelled` on a settled order, and the order-detail dropdown
always offers it (`orders/[id]/page.tsx:331`).

Selecting it on a paid order:

- restocks every line (`restockOrderItems`, unconditional),
- releases the coupon,
- emails the customer a cancellation notice,
- leaves `paymentStatus: "paid"`, `refundedCents: 0`, `paidAt` intact.

So the meat goes back on the shelf, the customer is told the order is cancelled, and the money
stays in "Incasso oggi", in the 30-day KPI, and in the **IVA a debito** of a period that may
already have been filed. `assertEditable` is never called on this path.

**Fix:** same treatment as `refunded` — refuse the transition on `paymentStatus !== "unpaid"` with
a message pointing at Rimborsa.

### 2.2 · Cancelling a counter sale of a weighed product invents stock

Two functions disagree about what a weight line costs in stock:

- `lib/admin/order-actions.ts:218` — `stockUnitsFor = (l) => l.weightKg != null ? 0 : l.quantity`.
  A counter sale of 0,350 kg moves **no** stock (deliberate: `products.stock` is an integer).
- `lib/orders.ts:792` — `restockOrderItems` gives back `it.quantity`, which for that same line is
  **1**.

The order still stamps `stockAppliedAt` (`order-actions.ts:367`), so the restock is not skipped.
Net effect of ringing up 0,350 kg at the counter and then cancelling: **+1 unit of phantom stock**,
ledgered as a real movement. Repeat it and the catalogue drifts upward with a clean audit trail.

The online path is consistent (`applyOrderStock` decrements `quantity`, restock adds `quantity`) —
because `createOrder` never writes `weightKg` at all (`lib/orders.ts:275-286`). Only the counter
form produces weight lines, and only the counter form is wrong.

### 2.3 · Deposits are money the platform never counts

`reservations.depositCents` / `depositPaidAt` / `depositForfeitedAt` are written by
`setReservationDeposit` and read by exactly two screens — the reservations list and the booking
detail — to print a label. Nothing else in the codebase touches them.

Consequences:

- There is no answer to *"how much caparra are we holding?"* — no total, no report, no CSV column.
- A **forfeited** deposit is taxable income the business kept. It appears in no revenue figure and
  in no VAT bucket.
- When an `order`-type booking is converted (`/admin/orders/new?prenotazione=…`), `BookingPrefill`
  carries `id, reference, name, phone, email, shopSlug, date, notes` — **not the deposit**. The
  customer who already paid €50 is charged the full amount again, and nothing on the conversion
  screen mentions it.

### 2.4 · The IVA report's own drill-down disagrees with the report

`app/admin/(dash)/reports/iva/page.tsx:157`:

```
/admin/orders?stato=paid&da={from}&a={to}
```

Two separate mismatches:

1. `stato=paid` resolves to `eq(orders.status, "paid")` (`filters.ts:166`). The report counts
   `paymentStatus in ('paid','refunded')`. Every order that has since been marked **Evaso** is in
   the report and missing from the drill-down — which is most of them, on any period older than a
   few days.
2. `da`/`a` filter `orders.createdAt`; the report keys on `coalesce(paidAt, createdAt)`. The
   comment on `settledAt` in `queries.ts:82` explains at length why keying on `createdAt` is wrong
   and disagrees with the IVA report — and then the link out of the IVA report does exactly that.

So "Vedi gli ordini →" reliably shows a smaller, differently-bounded set than the numbers above it.

### 2.5 · Date filters use the server's midnight, not Rome's

`lib/admin/filters.ts:170-171` and `:485-486`:

```ts
gte(orders.createdAt, new Date(`${f.da}T00:00:00`))
```

`new Date("2026-08-01T00:00:00")` is **server-local**. On a UTC host in summer that is 02:00 Rome.
Everything else in the codebase goes through `instantInRome` / `dateInRome` (`lib/time.ts`)
precisely to avoid this. A filtered CSV of "August" therefore contains two hours of July and is
missing two hours of 1 August — and can never be reconciled against the IVA report, which is
correct.

### 2.6 · There is no cash-up

`orders.paidWith` (`card | cash | pos | transfer | other`) is captured on every counter settlement
and every manual sale, and is used in exactly two places: the FatturaPA `ModalitaPagamento`
(`lib/fattura.ts:355`) and one read-only line on the order detail.

It is not a filter, not a column in any CSV, and not aggregated anywhere. So the gestionale cannot
answer the single question a shop asks at 19:30 every day: **"quanto c'è in cassa in contanti e
quanto è passato dal POS?"** The dashboard offers "Incasso oggi" as one undifferentiated number.

This is the largest genuinely missing *surface* in the back office.

---

## 3. 🟠 Controls that do nothing

Four settings are editable in `/admin/settings` and read by **no code in the repository**. I
grepped every `getSetting` call site and every literal occurrence.

| Key | Label in Impostazioni | Reality |
| --- | --- | --- |
| `porchetta.enabled` | "Porchetta del sabato — Abilita le prenotazioni della porchetta artigianale." | Never read. Only `shops.porchettaEnabled` is consulted (`lib/reservations.ts:309`). Turning the master switch off changes nothing. |
| `reservations.enabled` | "Prenotazioni attive — Abilita il modulo prenotazioni sul sito." | Never read. Only `shops.reservationsEnabled` (`lib/reservations.ts:312`). Same. |
| `porchetta.cutoffDay` | "Ultimo giorno utile per prenotare la porchetta della settimana." | Never read. The cut-off is not enforced anywhere, and the public page hard-codes the prose: *"La porchetta del sabato si prenota entro il venerdì"* (`app/(site)/prenotazioni/page.tsx:64`). Change the setting to Wednesday and both the rule and the sentence stay Friday. |
| `business.rea` | "REA" | Never read. Not emitted in the FatturaPA XML — `buildFatturaXml` has no `IscrizioneREA` element at all. |

Two more that are half-wired:

- **`store.enabled`** is presentational only. `/negozio` and `/negozio/categoria/[slug]` hide the
  grid, but `createOrder` (`lib/orders.ts`) never checks it and `/api/checkout` never checks it.
  A cart already in `localStorage` still completes. The help text says *"il negozio è di sola
  consultazione"*; it is not.
- **`audit.retentionDays`** is read by `runMaintenance` (`lib/automation.ts:344`, default 730) but
  is **not** in the `KNOWN` list on the settings page — so the one control over how long the legal
  audit trail survives is reachable only through the raw JSON editor.

And one documented-but-absent behaviour:

- `runMaintenance`'s docstring (`lib/automation.ts:310`) says it prunes *"sent outbox mail, audit
  log, page views"*. It prunes the first two. **`page_views` is never pruned** — no delete, no
  retention setting, no return field. On a busy storefront that table is the one that grows
  without bound.

---

## 4. 🟠 Connections that were never finished

### 4.1 · Back-in-stock notifications miss most restock paths

`notifyBackInStock` is called from exactly two places: `saveProduct` (`actions.ts:222`) and
`adjustStock` (`actions.ts:444`). `applyStockChange` — the module doc for which says *"every path
that changes stock goes through here"* — does not call it.

So a product goes back on sale **without notifying anyone waiting** when stock rises via:

- `receiveBatch` — receiving a supplier lot, i.e. the most natural restock there is;
- `correctBatchRemaining` with a positive delta;
- `restockOrderItems` — a cancellation or refund putting goods back;
- `applyProductImport` — a CSV price/stock upload.

The same four paths also fail to clear `lowStockNotifiedAt`, which `adjustStock:437` and
`saveProduct` both take care to reset — so the low-stock alert stays latched and will not re-fire
on the next dip.

Meanwhile `/admin/products/[id]` prints **"N in attesa di riassortimento"** (line 126) and offers
no way to see who they are and no button to notify them. It is a number that can silently never
resolve.

### 4.2 · Internal notes freeze the moment the money does

`orders.internalNotes` is *"staff-only annotations, never shown to the customer, never emailed"*.
It is editable only through `OrderDetailsForm`, which the detail page renders only when
`editable === order.paymentStatus === "unpaid" && status !== "cancelled"`
(`orders/[id]/page.tsx:70`), and `updateOrderDetails` calls `assertEditable` anyway.

So for every paid order — i.e. nearly every real one — "il cliente ha chiamato, ritira venerdì"
cannot be written down. The page even shows the existing note, read-only.

The reasoning for freezing amounts is sound and is spelled out for the fiscal-identity form, which
*is* left editable after payment because *"it changes no amounts"*. Internal notes change no
amounts either.

### 4.3 · You can get from the audit log to an order, but not back

`/admin/audit` maps 18 entities to detail-page links (`ENTITY_HREF`) — deliberate, well done. The
reverse does not exist: no order, reservation, product or customer page links to its own history.
`auditWhere` has no `entityId` facet, so even a hand-built URL cannot express it; the only route is
pasting the id into the free-text box.

Two smaller defects in the same page:

- `site_content` is the one entity written by the code (`content-actions.ts:39`) that is missing
  from `ENTITY_LABELS` and `ENTITY_HREF`. Those rows render with the raw slug as their filter chip
  and an unlinked key.
- `lib/auth/service.ts:308` writes an `auth.login` row for **every** sign-in, customers included.
  A log whose stated purpose is *"who did which sensitive back-office action"* is mostly customers
  logging in, kept for two years.

### 4.4 · The users page cannot answer "why can't she log in?"

`users.lastLoginAt`, `failedLoginCount` and `lockedUntil` are written by `lib/auth/service.ts` and
read by **nothing outside that file**. `/admin/users` — subtitled *"ruoli, password e accessi"* —
shows role, active, email-verified and 2FA, and none of the access state.

So a locked-out account (10 failures → 15 minutes) is indistinguishable from a forgotten password,
there is no "last seen", and an admin cannot list or terminate another user's sessions — only their
own, on `/admin/security`. Deactivate-and-reactivate is the only blunt instrument available.

### 4.5 · The in-shop scan records a sale the books never see

`/admin/loyalty/scan` asks for a card number and **an amount in euros**, and credits points. It
creates no order, no stock movement, no VAT, no revenue. `/admin/orders/new` does all of those
*and* accrues the same points.

Two counter workflows, one of which quietly makes a €45 sale invisible to every report in the
system. Nothing on the page says so.

### 4.6 · Porchetta bookings never become orders

Round 4 closed this for `type: "order"`. `/admin/orders/new` accepts `?prenotazione=` only when
`r.type === "order"` (`orders/new/page.tsx:60`), and the "Converti in ordine" link only appears on
that type.

A `porchetta` booking is 2 kg of a real product with a real price and often a deposit. It has the
same problem the `order` type had: it touches no stock, no revenue, no VAT and no loyalty, and the
shop rings it into the till separately with nothing linking the two.

### 4.7 · Closures count the damage and cannot act on it

`/admin/chiusure` correctly counts the bookings and pickups already taken inside a new closure
window and says *"Non sono state annullate: avvisa i clienti prima."* There is no bulk-notify and
no bulk-cancel — the operator gets a filtered list and a telephone.

### 4.8 · No invoice register

FatturaPA XML is generated on demand per order and the generation is audited, but there is no
**Fatture** screen: no list of documents issued, no way to see which orders have been invoiced, no
progressive per-year register. `Numero` is derived from the order number and `ProgressivoInvio`
from a slice of the order id (`invoice/[orderId]/xml/route.ts:64-69`). Workable for handing files
to an intermediary; not a register the commercialista can reconcile.

### 4.9 · Smaller loose ends

- `getFulfilmentDay` caps deliveries, shipments and unscheduled pickups at **100** each, and the
  page prints `count` from the returned array — so past 100 the section header states a number that
  is not true.
- `getStockMovements(productId, 20)` on the product page: no pagination, no "see all", and the
  only full view is a global CSV.
- The product page has no sales history (`getProductHistoryCounts` computes `sold` purely to decide
  whether the delete button may be shown), so there is no per-product velocity anywhere except the
  dashboard's top-5.
- `/admin/categories` counts *"N prodotti con una categoria scritta a mano"* and links to
  `/admin/products` unfiltered — no facet for "unfiled", no bulk reassign.
- Cancelling a redemption returns the points and the stock but never tells the customer.
- Only porchetta bookings get a reminder (`runPorchettaReminders`); table bookings get none.
- `quickSearch` (⌘K) covers orders, reservations, customers and products — not discounts, rewards,
  blog posts or campaigns.

---

## 5. Suggested order of work

**First — the two that are actively wrong right now**

1. Gate `/admin/outbox` to admin (1.1). One line, closes a privilege escalation.
2. Refuse `cancelled` on a settled order (2.1). One guard, stops goods and money diverging.

**Then — scope, as one pass**

3. `assertShopScope` on the packing slip; `requireShopScope` in `batch-actions`;
   `shopScope()`/`lockShop` in the dashboard, `fulfilment/oggi`, `agenda`, `calendar`, `scadenze`;
   both ends of the shop on reservation create/move; scope + role on `shops/[id]`; chips from the
   locked filters on the orders list. (1.2–1.7)

**Then — the money**

4. Fix the weight-line restock (2.2) — align `restockOrderItems` with `stockUnitsFor`.
5. Fix the IVA drill-down link and the two `new Date("…T00:00:00")` filters (2.4, 2.5).
6. Deposits: a total on the reservations list, a line in the IVA report for forfeits, and carry the
   deposit into the conversion prefill (2.3).
7. **Chiusura di cassa** — a day view grouping settled orders by `paidWith`. This is the one new
   screen worth building. (2.6)

**Then — make the dead controls honest**

8. Either wire `porchetta.enabled`, `reservations.enabled` and `porchetta.cutoffDay`, or delete
   them from the settings page. Same for `business.rea` (or emit `IscrizioneREA`). Enforce
   `store.enabled` in `createOrder`. Promote `audit.retentionDays` into `KNOWN`. Prune `page_views`
   in `runMaintenance` or correct its docstring. (§3)

**Then — the connections**

9. Move `notifyBackInStock` + the `lowStockNotifiedAt` reset into `applyStockChange` so all five
   restock paths behave alike, and give the "N in attesa" badge a manual notify. (4.1)
10. Let internal notes be edited after payment. (4.2)
11. An `entityId` facet on `/admin/audit` plus a "Cronologia" link from order / reservation /
    customer / product; label `site_content`; stop logging customer `auth.login` (or scope the log's
    default view to back-office actors). (4.3)
12. Show `lastLoginAt` and lock state on `/admin/users`, with an unlock and a per-user session list.
    (4.4)

---

## 6. Deliberately not listed

Suppliers / purchase orders, corrispettivi telematici (RT), SdI transmission, and weight-based
shipping remain out of scope per `gestionale-roadmap.md`. Nothing above depends on them.

---

## 7. What shipped

Everything in §1–§4, in the order of §5. Full suite green (456 tests, up from
427), `tsc` clean, `eslint` clean, `next build` clean.

### The two live bugs

| # | Fix | Where |
| - | --- | ----- |
| 1.1 | Message bodies in the outbox are admin-only; staff keep the list, the status and the retry. Closes the staff → admin escalation. | `outbox/page.tsx` |
| 2.1 | `cancelled` is refused on any order whose `paymentStatus` isn't `unpaid`, with a message pointing at Rimborsa; the dropdown stops offering it. | `order-actions.ts`, `orders/[id]/page.tsx` |

### Scope

A new `inShop()` predicate in `queries.ts` mirrors `scope.ts`'s row rule (own
shop **plus** rows belonging to no shop) and is threaded through every summary
query. `shopChips()` in `scope.ts` is the shared facet builder.

- **Reads locked:** dashboard (all four queries), `fulfilment/oggi`, agenda,
  calendar, `products/scadenze`, shops list. The dashboard subtitle now names
  the sede when scoped.
- **Writes locked:** `batch-actions` gained `mustFindScopedProduct` and calls it
  in all three actions; `createAdminReservation` and `updateReservationDetails`
  check both ends of a move; `saveShop` and `shops/[id]` check the shop's own
  slug; the packing slip calls `assertShopScope`.
- **Chips honest:** orders and reservations build their filter bag from the
  *locked* shop, so a chip can no longer highlight without changing the results.
- **Newsletter:** every campaign action is `requireRole("admin")`, matching the
  subscriber export beside it; the composer and history are hidden from staff.

### Money

- **Weight lines** — `stockUnitsForLine()` in `lib/stock.ts` is now the single
  rule, asked by the sale *and* the restock. The phantom-unit bug is gone.
- **IVA drill-down** — new `stato=incassati` (settled) and `data=incasso`
  (fiscal date) order facets; the report links to both. Both are also normal
  chips on the orders list.
- **Rome days** — `romeDayStart`/`romeDayAfter` in `filters.ts`; the upper bound
  is exclusive. Fixed a second, unreported bug on the way: the audit toolbar
  emitted hidden `da`/`a` inputs *before* the visible ones, so the old value won
  on every submit.
- **Deposits** — `getHeldDeposits` and `getDepositMovements`; a running total on
  the reservations list, an "Acconti" panel on the IVA report (explicitly
  outside the VAT buckets, with the reasoning stated), and the deposit carried
  into the conversion prefill and the order's "Da incassare".
- **Chiusura di cassa** — new `/admin/reports/cassa`: takings by instrument for
  a Rome day, refunds netted on their own date, cash called out on its own for
  counting against the drawer, printable. `paidWith` and `paidAt` also joined
  the orders CSV.

### Dead controls

- `porchetta.enabled` and `reservations.enabled` are read by `createReservation`
  and by `porchettaAvailability`.
- `porchetta.cutoffDay` is enforced (`porchettaCutoffFor`), the availability
  helper rolls to the next roast once a deadline passes, and the public page
  states the configured day instead of a hard-coded Friday.
- `business.rea` is parsed (`parseRea`) and emitted as `IscrizioneREA`, in the
  schema-mandated position.
- `store.enabled` is enforced in `createOrder`, so the switch stops orders
  rather than only hiding the grid.
- `audit.retentionDays` is a typed setting, joined by a new
  `analytics.retentionDays`; `runMaintenance` prunes `page_views`, which its own
  docstring had always claimed it did.

### Connections

- `applyStockChange` owns the restock side-effects, so all five paths notify the
  waitlist and re-arm the low-stock alert. The product page lists who is waiting
  and can mail them on demand.
- Internal notes have their own action and stay editable after settlement.
- Audit: a `record` facet, a "Cronologia" link on order / product / reservation /
  customer, `site_content` labelled, and no more audit row per customer login
  (failures and lockouts still logged for everyone).
- Users: last login, lock state, and unlock — with or without ending sessions.
- Porchetta bookings convert to orders, carrying kg and deposit.
- Closures can email the affected customers without cancelling their bookings.
- New `/admin/reports/fatture` — which sales have a document, assembled from the
  audit trail, honest about the numbering it does not provide.
- Loose ends: day-sheet truncation is stated, the movement ledger is labelled and
  links to the full CSV, the product page shows 30-day velocity and days of
  cover, "senza categoria valida" is a real filter, redemptions email the
  customer, table bookings get a day-before reminder, and ⌘K finds coupons.

### Test harness

`test/global-setup.ts` wipes `.vitest-tmp/test.db` before each run. The suite
shared one file that nothing ever removed, so fixtures accumulated: it passed on
a fresh checkout and failed on the second `vitest run` with counts that were
exact multiples of the expected ones and a UNIQUE violation on a discount code.
Both looked like product bugs and were neither.
