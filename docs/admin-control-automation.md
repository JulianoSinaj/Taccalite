# Gestionale — Control & Automation Analysis

_2026-07-24, branch `feat/platform-hardening`. Companion to `docs/gestionale-gap-analysis.md`
(which covers fiscal/ledger **correctness**). This document covers a different axis:
**can the operator actually drive the business from this UI, and how much of the typing can
the system do for them?** Every claim is cited `file:line`._

---

> **Implementation status (2026-07-24).** The whole **P0** block is done and verified
> (tsc 0 errors · 74 Vitest · lint 0 errors · production build), migration `0018`:
> admin-side **reservation create + reschedule** (`/admin/reservations/new` + an inline
> editor per row, with the porchetta capacity check extracted and shared), **order
> editing** (contact/delivery, line add/remove/requantify, internal notes) gated to
> unsettled orders with a shared `recalcOrderTotals` pricing authority, **user profile
> editing**, **`store.shippingVatRate`** exposed and seeded, and **filter-aware CSV
> exports** via a new shared `lib/admin/filters.ts`. Along the way: reservation actions
> split out of the 716-line `actions.ts`, and the duplicated `TYPE_LABEL`/`ROLE_LABEL`/
> `fmtDateTime` copies collapsed into `components/admin/ui.tsx`.
>
> **P1 is also done** (tsc 0 errors · 84 Vitest · lint 0 errors · build): real `/new`
> routes for all six creatable entities (wired to the dashboard and ⌘K); **search,
> filters and pagination** on products, news, rewards and discounts; a **rebuilt
> manual-order form** (product search + cart, live totals with VAT split, customer
> lookup that prefills contact and last shipping address, inline coupon validation);
> **multi-select + bulk status actions** on orders and reservations; and a **packing
> slip** at `/admin/orders/[id]/packing-slip`. The `filterHref`/`chipCls` copies in all
> six list pages were replaced by one `components/admin/FilterBar.tsx`.
>
> **P2 is also done** (tsc 0 errors · 99 Vitest · lint 0 errors · build), migrations
> `0019`–`0020`: a **cron registry** with per-job last-run recording and an
> _Automazioni_ panel in Settings with "Esegui ora"; **pickup fulfilment** one-tap in
> the list plus an opt-in auto-close job; **autofill** (readable slugs derived from the
> name for products/rewards via a shared `lib/slug.ts`, category-driven VAT suggestion,
> excerpt from the first paragraph, `kg` for weight-sold items); **per-product reorder
> point, cost, SKU and supplier** with margin on the product page, all routed through
> `lib/inventory.ts` so every "scorte basse" surface agrees; and **newsletter campaigns**
> (drafts, scheduling via cron, send history, duplicate-to-resend) replacing the
> fire-and-forget broadcast and its inline `dangerouslySetInnerHTML` preview script.
>
> **P3 is also done** (tsc 0 errors · 112 Vitest · lint 0 errors · build), migrations
> `0021`–`0023`: **buyer fiscal identity** (codice fiscale / P.IVA / SDI code / PEC) so
> the FatturaPA XML is valid for B2C and B2B — `CodiceDestinatario` was hardcoded
> `0000000` and the buyer block carried no fiscal id at all — plus **`orders.paidAt`**,
> so the IVA report and the invoice date key on settlement rather than creation;
> **audit-log** date/actor/text filters, CSV export and rendering of the `meta` payload
> every `logAudit` call was already writing; **2FA recovery codes** (single-use, hashed,
> accepted at login in place of the TOTP code) and an active-session list with "log out
> everywhere else"; and the reporting fixes — `newsletter.source` indexed, dashboard
> top-products regrouped on the stable `productId` instead of the mutable name.
>
> **FTS5 and the `<DataTable>` are now done too** (migration `0024`), closing the
> roadmap. The FTS objection recorded above turned out to be avoidable: the
> **trigram tokenizer matches substrings**, so "ossi" still finds "Rossi" and search
> behaviour is byte-for-byte what the `LIKE '%…%'` scans produced — only the cost
> changed. Indexes cover the unbounded tables (orders, reservations, users,
> subscribers, audit); the bounded catalogue tables stay on LIKE, which is a
> documented rule rather than an omission. Terms under 3 characters fall back to LIKE
> (trigram can't tokenise them) and the loyalty card number keeps a LIKE branch because
> it lives on a joined table. The drift risk is real and mitigated, not waved away:
> the DDL is a hand-written migration, and the maintenance job runs an FTS
> integrity-check and rebuilds any index that ever diverges.
>
> `components/admin/DataTable.tsx` adds URL-driven sortable columns (validated against
> a per-page allow-list before any key reaches SQL) and a density toggle, adopted by the
> products, newsletter and audit lists. Reservations and the outbox deliberately stay
> card-shaped — they carry multi-line detail and several inline forms per row, which
> columns would read worse.

## 1. Verdict

The gestionale is **21 routes wide and one action deep**. Nearly every page renders the right
data and exposes the one or two mutations that were needed to ship the feature — then stops.
The result is a back-office that is *mostly a viewer with buttons*, not a system of record:

| Layer | State | One-line |
| --- | --- | --- |
| **Read** | 🟢 Strong | Every entity is listed, paginated where it matters, role-gated, force-dynamic. |
| **Create** | 🟠 Partial | 6 of 11 business entities can be created from the admin. Reservations — the single most common phone interaction — **cannot**. |
| **Update** | 🔴 Thin | Orders, reservations and users expose ~3 editable fields each out of 15–20. Everything else needs DB access. |
| **Bulk / batch** | 🔴 Absent | Zero multi-select anywhere. 40 pending orders = 40 form submits. |
| **API surface** | 🟠 Minimal | 3 routes (CSV, GDPR, XML). Exports ignore the filters the operator just set. |
| **Indexing** | 🟡 Adequate, one hole | Hot paths indexed. Every search box is a `lower(col) LIKE '%q%'` full scan; top-products groups on a mutable name. |
| **Autofill** | 🔴 Barely started | Card numbers and blog slugs auto-generate. Everything else is hand-typed, including things the DB already knows. |
| **Code organisation** | 🟡 Good pattern, applied unevenly | `order-actions`/`user-actions`/`discount-actions` are clean domain modules; `actions.ts` (716 L) and `queries.ts` (609 L) are catch-alls. Filter logic is copy-pasted 4×. |

**The headline:** an operator who takes a booking by phone, or needs to change an order after
it was placed, has no path through this UI at all.

---

## 2. What each page *is*, and where it stops

Legend: **R** = read-only · **W** = has write actions · gaps are what blocks the page from
being the system of record for its entity.

### 2.1 Dashboard — `app/admin/(dash)/page.tsx`
**Is:** the daily cockpit — money row, 30-day KPIs with deltas, revenue sparkline, top
products, a 5-tile work queue, today's bookings, recent orders, integration status.
**Gap:** "Azioni rapide" (`:363-375`) links to *list* pages, not create forms — because create
forms don't have URLs (§2.3). Nothing on this page is actionable in place: you can see
"12 ordini da evadere" but must navigate to act. The work-queue tiles are the right idea;
they should host one-tap actions.

### 2.2 Reservations — `reservations/page.tsx`, `agenda/`, `calendar/`
**Is:** the strongest module. Status/type/shop chips, date range, search, pagination,
one-click Conferma/Annulla, deposit capture, waitlist promotion, a print-ready prep agenda
with per-day porchetta kg vs. capacity, and a week calendar.
**Gap — the biggest hole in the product:**
- **No admin-side create.** `insert(reservations)` exists only in `lib/reservations.ts:77`,
  the public booking path. A phone booking has to be entered through the customer website.
- **No reschedule.** Editable fields are `status`, `adminNotes` (`actions.ts:109-112`) and the
  deposit (`:145-153`). Date, time, guests, kg, shop, phone and email are immutable. "Can we
  move to 20:30?" is unserviceable.
- **No no-show state.** The enum is `pending|confirmed|completed|cancelled` (`schema.ts:297`);
  a no-show is recorded as "cancelled", which pollutes cancellation stats and loses the signal.
- Waitlist promotion (`actions.ts:200-217`) flips `waitlisted` and emails **nobody** — the
  customer is never told they got in.
- "Segna pronta" exists only in the agenda, never in the list or calendar.
- Calendar entries are not links; the calendar is a dead end.

### 2.3 Products — `products/page.tsx`, `products/[id]/page.tsx`
**Is:** catalogue + inventory. Rich editor (allergens, origin, ingredients, VAT bps, weight
sales), featured/active row toggles, stock ledger with signed adjustments and back-in-stock
notification.
**Gap:**
- `adminGetProducts()` (`queries.ts:335`) selects **the whole table, unpaginated, unsorted
  beyond `sortOrder`**. No search, no shop/category/active/low-stock filter. This is the page
  that will break first as the catalogue grows.
- Creation is a `<details>` disclosure on the list (`:22-29`). There is **no `/admin/products/new`
  route** — so it can't be deep-linked, bookmarked, hit from the dashboard, or reached from ⌘K.
  Same pattern for blog, shops, rewards, discounts, users.
- No duplicate/clone. Building a variant means retyping 18 fields.
- No per-product reorder point (only the global `store.lowStockThreshold`), no supplier, no
  cost price → no margin anywhere in the system.

### 2.4 Orders — `orders/page.tsx`, `orders/[id]/page.tsx`, `orders/new/page.tsx`
**Is:** the commercial spine. Shop/status/fulfilment chips, search, pagination, per-row item
preview, inline status+payment update, detail with reconciled VAT breakdown, tracking, Stripe
refund, FatturaPA XML, manual counter-sale creation.
**Gap — an order is immutable after creation:**
- Cannot add, remove or re-quantify a line. Cannot fix a typo in name/email/phone, change the
  shipping address, apply or remove a discount, or change the pickup shop.
- No **internal** notes field — `order.notes` is the customer's, and it is read-only in the UI
  (`[id]/page.tsx:144-149`).
- No partial refund — `refundOrder` (`order-actions.ts:334`) is all-or-nothing.
- No "resend confirmation email" button, despite `orderStatusEmail` being right there.
- No packing slip / receipt / A4 print view. Pickup staff have no paper.
- No date-range filter (reservations has one; orders doesn't).
- **Manual order form is unusable at scale** (`orders/new/page.tsx:30-49`): it renders *every*
  sellable product with a number input. 200 products = a 200-row form. No search, no
  typeahead, no cart, **no running total** — the operator submits blind and finds out the
  price afterwards. The discount code (`:108-110`) is typed with no validation feedback.
- FatturaPA is emitted with `CodiceDestinatario` hardcoded `0000000` (`lib/fattura.ts:131`) and
  a `CessionarioCommittente` block carrying **no** `CodiceFiscale`/`IdFiscaleIVA`
  (`:153-165`) — because orders have nowhere to store a customer's fiscal identity
  (`schema.ts:358-396`). The XML is incomplete for B2C and will be rejected for B2B.

### 2.5 Loyalty — `loyalty/page.tsx`, `loyalty/[id]/page.tsx`, `loyalty/scan/page.tsx`
**Is:** customer 360 (points ledger, orders, reservations, redemptions), inline points
adjustment, redemption fulfilment, GDPR export/anonymise, and an in-shop card-scan accrual.
**Gap:** no card issuance or re-issue UI (cards mint silently in `lib/loyalty.ts:40`; a lost
card can't be replaced). No customer create — the only way to add a walk-in to the programme
is `/admin/users`, which files them under "Utenti". No manual redemption on behalf of a
customer at the counter. No segments or bulk points campaign.

### 2.6 Users — `users/page.tsx`
**Is:** account admin — create, role change, password reset, activate/deactivate, all with
session invalidation and last-admin guards. Genuinely solid.
**Gap:** **you cannot edit a user's name, email or phone.** The only `update(users).set(...)`
calls in the admin are role, password and active (`user-actions.ts:60,84,152`). A customer who
changes email is unserviceable. No search or filter on a page that is pure pagination
(`getUsersPage` — `queries.ts:359`). No impersonate/"view as" for support.

### 2.7 Newsletter — `newsletter/page.tsx`
**Is:** subscriber list with status/source chips + search, and a composer with live preview
and send-to-self test.
**Gap:** the only mutation on a subscriber is unsubscribe (`actions.ts:605`) — no manual add
(the shop can't type in an address collected at the counter), no re-subscribe, no source edit.
Broadcasts cannot be scheduled, saved as drafts, templated, or reviewed after the fact — there
is no campaign record at all, just the resulting outbox rows. The live preview runs as a
`dangerouslySetInnerHTML` inline script (`:28-56, :169`) rather than a client component.

### 2.8 Outbox — `outbox/page.tsx`
**Is:** the email audit trail with status filters, search, single + bulk retry.
**Gap:** shows only `e.text` (`:103`) — the HTML that was actually delivered is never
rendered. No delete/purge (pruning is cron-only, `automation.ts:162`), no cancel-queued, no
resend-to-a-different-address (the classic "they gave me the wrong email" fix).

### 2.9 Settings — `settings/page.tsx`
**Is:** 21 typed settings with friendly controls, plus a raw-JSON escape hatch for unknown keys.
**Gap:**
- **`store.shippingVatRate` is unreachable.** It is read in four places
  (`queries.ts:563`, `orders/[id]/page.tsx:19`, `invoice/[orderId]/xml/route.ts:33`) and the
  IVA page tells the user to "modify it in Impostazioni" (`reports/iva/page.tsx:105`) — but it
  is **not in `KNOWN`** and **not seeded** (`scripts/seed.ts:138-147`), so no row exists and no
  field renders. The shipping VAT rate is silently pinned at the 22% default and cannot be
  changed from the UI.
- One `<form>` per setting = 21 separate saves. No sections, no "save all", no reset-to-default,
  no display of the current vs. default value.
- No visibility into automation: `runPorchettaReminders`, `runMaintenance`, `runPointsExpiry`,
  `runOwnerDigest` (`lib/automation.ts`) run headless behind `/api/cron`. The operator cannot
  see whether cron ran, when, or with what result, and cannot trigger a job manually.

### 2.10 Reports / IVA, Analytics, Audit, Security, Blog, Shops, Rewards, Discounts
- **IVA** (`reports/iva/page.tsx`): correct and exportable; no month/quarter presets, no
  per-shop split, no drill-down to the contributing orders.
- **Analytics**: read-only by nature and fine; no period comparison, no per-shop attribution.
- **Audit** (`audit/page.tsx`): entity chips + pagination only. No date range, no actor filter,
  no free-text search, **no CSV export**, and the `meta` JSON that every `logAudit` call
  carefully populates is never rendered.
- **Security**: 2FA enrol/disable for *your own* account only. No recovery codes → a lost
  authenticator is a lockout. No session list, no "log out everywhere".
- **Blog / Shops / Rewards / Discounts**: full CRUD, but all unpaginated and unsearchable
  (`queries.ts:339,343,347,526`), all creating via `<details>`, none with duplicate/clone.
  Discounts show `timesUsed` but there is no way to see *which* orders used a code.

---

## 3. Missing manual control — the consolidated list

### 3.1 Cannot be created from the admin at all
| Entity | Impact |
| --- | --- |
| **Reservation** | Phone bookings must be entered via the public site. |
| **Newsletter subscriber** | In-store signups can't be added. |
| **Redemption** | Can't redeem a reward for a customer at the counter. |
| **Loyalty card (re-issue)** | Lost card = new account. |

### 3.2 Created but not editable
| Entity | Editable today | Not editable |
| --- | --- | --- |
| Order | status, paymentStatus, carrier, trackingNumber | lines, quantities, customer, address, discount, shop, notes, fiscal identity |
| Reservation | status, adminNotes, deposit | date, time, guests, kg, shop, name, phone, email |
| User | role, password, active | name, email, phone |
| Subscriber | status→unsubscribed | email, source, re-subscribe |
| Redemption | status | — |

### 3.3 Missing buttons, by page
| Page | Missing |
| --- | --- |
| Dashboard | in-place actions on work-queue tiles; create-links that actually reach a form |
| Reservations | **+ Nuova prenotazione**, Riprogramma, No-show, Invia promemoria ora, Segna pronta (in list) |
| Orders list | date range, bulk "Segna evaso", packing slip, export-the-current-filter |
| Order detail | edit lines, edit customer, internal note, partial refund, resend email, print |
| Manual order | product search/typeahead, live total, "Verifica codice", customer picker |
| Products | search + filters + pagination, Duplica, bulk activate/deactivate, `/new` route |
| Users | search, edit profile, impersonate |
| Newsletter | + Aggiungi iscritto, schedule, draft, campaign history |
| Outbox | HTML preview, delete, resend-to-other-address, cancel queued |
| Settings | shipping VAT field, save-all, reset-to-default, **Automazioni panel + Esegui ora** |
| Audit | date range, actor filter, search, CSV, meta detail |
| Security | recovery codes, active-session list |
| All lists | multi-select + bulk bar; sortable columns; density toggle |

---

## 4. API & data layer

### 4.1 API routes — 3 exist, several are implied by the UI and absent
| Route | State |
| --- | --- |
| `GET /api/admin/export/[entity]` | ✅ 6 entities, admin-only. **Ignores filters** — always dumps the full table (`route.ts:29,48,59`), except `analytics`/`iva` which take their own params. The operator filters to "unfulfilled Ancona orders", clicks Esporta, and gets all 4,000 rows. |
| `GET /api/admin/gdpr/[userId]` | ✅ |
| `GET /api/admin/invoice/[orderId]/xml` | ✅ but fiscally incomplete (§2.4) |
| `GET /api/admin/products/search` | ❌ needed by the manual-order typeahead |
| `GET /api/admin/customers/search` | ❌ needed by customer autofill |
| `POST /api/admin/order/[id]/preview` | ❌ live totals for manual orders |
| `GET /api/admin/orders/[id]/packing-slip` | ❌ |
| `GET /api/admin/cron/status` + `POST .../run` | ❌ automation is invisible and untriggerable |

### 4.2 Indexing — what's right, and the one real hole
Correctly covered for the queries actually issued: `orders_paid_created_idx` and
`orders_created_idx` for the dashboard windows/KPIs/IVA report (`schema.ts:403-404`);
`reservations_cron_idx` (`:323`) for the reminder sweep; `order_items_order_idx` (`:438`) for
the per-page item preview; sessions, redemptions, audit, outbox, page-views all indexed on
their filter/sort columns.

Three genuine gaps:

1. **Every search box is a full table scan.** `getOrdersPage`, `getReservationsPage`,
   `getCustomersPage`, `getSubscribersPage`, `getOutboxPage` all filter with
   `like(sql`lower(col)`, '%term%')` (`queries.ts:214-222, 270-278, 298-304, 461, 497`). A
   leading wildcard defeats any B-tree, and `lower()` per row defeats it twice over. Fine at a
   few thousand rows; the fix when it isn't is an FTS5 virtual table or generated lowercase
   columns with trigram-style prefix search — not another `index()`.
2. **Top products group on a mutable name.** `getDashboardInsights` groups
   `orderItems.name` (`queries.ts:146,153`) while the index sits on `productId`
   (`schema.ts:440`, with the comment explicitly saying reporting should key off the stable
   id). Renaming a product silently splits its sales history into two rows.
3. **`newsletterSubscribers.source`** is both filtered (`eq`) and `selectDistinct`-ed
   (`queries.ts:460,476`) with no index (`schema.ts:347-349`).

Minor: `discountCodes` and `stockMovements` order by `createdAt` with no matching index —
irrelevant at current table sizes, worth noting only if either grows.

### 4.3 Missing fields that block features
| Field | Blocks |
| --- | --- |
| `orders.customerTaxCode` / `.vatNumber` / `.sdiCode` / `.pec` | valid FatturaPA |
| `orders.paidAt` | period reports keyed on payment date, not creation date |
| `orders.internalNotes` | staff annotations |
| `products.reorderPoint`, `.costCents`, `.sku`, `.supplier` | per-product alerts, margin, purchasing |
| `reservations.noShowAt` | no-show tracking distinct from cancellation |
| `newsletter_campaigns` table | scheduling, drafts, send history |

---

## 5. Automation & autofill — stop typing what the system knows

### 5.1 Already good (keep, and copy the pattern)
`remindedAt` / `readyAt` / `digest.lastSentDate` idempotence stamps (`schema.ts:304,310`,
`automation.ts:189-247`); auto card-number minting (`lib/loyalty.ts:40`); blog slug derived
from the title with a collision check (`actions.ts:383-385`); low-stock alert stamp cleared on
restock (`actions.ts:227-228, 336-338`); manual sales that auto-link a customer by email and
accrue loyalty (`order-actions.ts:117-124, 202-209`).

### 5.2 High-value autofill, in order
1. **Product & reward slugs.** Both fall back to `nanoid(8)` (`actions.ts:230, 498`) while blog
   slugifies the title. `slugify()` already exists (`actions.ts:68`). Products get URLs like
   `/negozio/a7Kx9pQ2`. One-line fix, SEO impact.
2. **Manual-order customer picker.** Typing an email that matches a user already links the
   order silently (`order-actions.ts:117`). Surface it: pick a customer → prefill name, phone,
   last shipping address, show their points balance and card number.
3. **Manual-order live total.** Compute subtotal → discount → shipping → VAT client-side from
   the same server-authoritative rules, so the operator sees the price before submitting.
4. **Discount code validation on blur.** `validateDiscount` (`lib/discounts.ts`) already
   returns the exact reason a code fails; show it instead of failing at submit.
5. **Shipping cost / free-shipping threshold** are settings but never previewed in the manual
   order form — the operator can't tell the customer the total.
6. **Blog excerpt** — derive from the first paragraph of `content` when left blank.
7. **Product VAT rate** — default by category rather than always `1000` (`schema.ts:80`).
   Salumi/carne 10%, confezionati 22%, base 4%.
8. **Shop hours** are parsed from `"Label | Value"` free text (`actions.ts:49-58`). Replace
   with seven day-rows + "copia su tutti i giorni".
9. **Reservation confirm** should propose the next free slot instead of leaving the operator to
   check the calendar in another tab.

### 5.3 Workflow automation worth adding
| Automation | Why |
| --- | --- |
| **Auto-fulfil pickup orders** N days after paid (or one-tap "Consegnato" in the list) | pickup orders sit in `paid` forever; the work queue never drains |
| **Waitlist promotion email** | `promoteFromWaitlist` (`actions.ts:200`) currently tells nobody |
| **Deposit reminder + deduction** | `depositCents` is recorded (`schema.ts:313`) and then never used by anything |
| **Per-product reorder alerts** | today one global threshold alerts on everything equally |
| **Cron visibility panel** in Settings — last run + result per job, with "Esegui ora" | four automations run blind |
| **Scheduled newsletters** | broadcast is fire-and-forget with a `window.confirm` |
| **Saved filter views** ("Da evadere oggi", "Scorte basse") pinned to the nav | the work queue already proves the pattern works |

---

## 6. Code organisation

The good pattern already exists — `order-actions.ts`, `user-actions.ts`, `discount-actions.ts`,
`outbox-actions.ts`, `security-actions.ts`, `loyalty-actions.ts` are clean domain modules over a
shared `runAction`/`ActionState`/`parseForm` spine. It just isn't applied everywhere.

**Split the catch-alls.** `lib/admin/actions.ts` (716 L) holds reservations + products + blog +
shops + rewards + loyalty + newsletter + email + settings. `lib/admin/queries.ts` (609 L) is the
same story. Split along the lines the rest of the folder already uses:
`reservation-actions.ts`, `product-actions.ts`, `content-actions.ts` (blog+shops+rewards),
`newsletter-actions.ts`, `settings-actions.ts`; mirror for queries.

**De-duplicate the list-page chrome.** Four near-identical `filterHref` implementations
(`orders/page.tsx:78-84`, `reservations/page.tsx:63-69`, `newsletter/page.tsx:67-73`,
`outbox/page.tsx:27-33`) and three copies of `chipCls`. Extract
`components/admin/filters.tsx` → `<FilterChips>` + `buildFilterHref()`.

**Centralise labels and formatters.** `TYPE_LABEL` for reservations is redefined in four files
(`page.tsx:25`, `reservations/page.tsx:10`, `agenda/page.tsx:11`, `calendar/page.tsx:7`);
`ROLE_LABEL` in two; `fmtDateTime` is local to `audit/page.tsx:18` while `fmtDate` is shared;
`iso()` is duplicated in `reports/iva/page.tsx:11` and the export route `:13`. One
`lib/labels.ts` + the existing `components/admin/ui.tsx`.

**Move date maths into `lib/time.ts`.** `calendar/page.tsx:23-48` reimplements `todayISO`,
`isoAddDays`, `isoWeekday`, `mondayOf` — and `todayISO()` uses server-local time while the rest
of the app deliberately uses Europe/Rome (`lib/time.ts`).

**Introduce `<DataTable>` before adding bulk actions.** Every list page hand-rolls a card row.
Sorting, multi-select, density and column visibility can't be added 11 times. shadcn/Radix is
installed and unused.

**Give creation real routes.** Replace the `<details>` disclosures with
`/admin/{products,blog,shops,rewards,discounts,users}/new`. This is a prerequisite for the
dashboard shortcuts, ⌘K actions and deep links to work at all.

**Replace the inline `dangerouslySetInnerHTML` script** in `newsletter/page.tsx:28-56` with a
small `"use client"` composer component.

---

## 7. Prioritised roadmap

### P0 — unblocks work that is impossible today
1. Admin-side **reservation create + reschedule** (`reservationInput` schema, `/admin/reservations/new`, edit form on the row).
2. **Order edit**: lines, customer, address, internal notes — with a recalculation path that reuses the pricing rules and writes to the stock ledger.
3. **User profile edit** (name/email/phone) with audit.
4. Expose **`store.shippingVatRate`** in `KNOWN` + seed it.
5. Make **CSV export honour the active filters**.

### P1 — operator throughput
6. `/new` routes for all creatable entities; wire the dashboard + ⌘K to them.
7. Manual-order rebuild: product typeahead, cart, live total, customer picker, coupon check.
8. Search + filters + pagination on products (then blog/rewards/discounts).
9. `<DataTable>` + multi-select + bulk status change on orders and reservations.
10. Packing slip / receipt print view.

### P2 — automation
11. Cron status + manual trigger panel in Settings.
12. Waitlist-promotion email; auto-fulfil or one-tap fulfil for pickup orders.
13. Slug autofill for products/rewards; category-driven VAT default; excerpt derivation.
14. Per-product reorder points; supplier + cost fields → margin reporting.
15. Newsletter campaigns table: drafts, scheduling, history.

### P3 — scale & fiscal completeness
16. Customer fiscal fields on orders → valid FatturaPA; `orders.paidAt` → payment-date reporting.
17. FTS5 (or lowercase generated columns) behind the search boxes; `newsletter.source` index; top-products regrouped on `productId`.
18. 2FA recovery codes; active-session management.
19. Audit: date/actor filters, search, CSV, `meta` rendering.
