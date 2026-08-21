# Gestionale — surface audit: what exists, what's missing, what's a dead end

_2026-08-21. Method: read all 39 routes under `app/admin`, the 14 server-action modules
behind them, `lib/admin/queries.ts`, and the live `data/taccalite.db` to see what the data
actually looks like. This complements [`admin-pages-roadmap.md`](./admin-pages-roadmap.md)
(2026-08-11), which fixed the correctness backlog; this one asks a different question —
**which surfaces are missing entirely, and where does a screen show you something you
cannot act on.**_

---

## 0. Headline

The gestionale is **not read-only**. 39 routes, 18 nav destinations, and 60 exported server
actions across 14 modules. Products, orders, reservations, users, discounts, rewards, blog,
shops, newsletter, settings, security are all full CRUD with audit logging, bulk actions,
saved views and CSV export. The premise "make it dynamic instead of read-only" is already
true for most of the surface.

What is actually wrong is narrower and more interesting — and, as of 2026-08-21, all seven
are closed (rounds 1–5 below; migrations `0029`–`0032`):

| # | Problem | Kind | State |
| - | ------- | ---- | ----- |
| **A** | **No `categories` entity.** Categories are free-text strings on two disjoint tables. | Missing surface | ✅ Round 2 |
| **B** | **No delivery/pickup surface.** `consegna`/`asporto` is one enum column and one flat fee. No zones, no slots, no cut-offs, no per-shop rules. | Missing surface | ✅ Round 3 |
| **C** | **The reservation calendar is a dead end** — bookings render as `<li>`, not links. | Read-only dead end | ✅ Round 1 |
| **D** | **A reservation of type `order` never becomes an order.** It touches no stock, no revenue, no VAT, no loyalty. | Broken connection | ✅ Round 4 |
| **E** | **Porchetta capacity is edited on the deprecated key and displayed unscoped.** Public availability and actual enforcement can disagree. | Live bug | ✅ Round 1 |
| **F** | **Staff are not scoped to a shop.** Two locations, one undivided view. | Missing model | ✅ Round 4 |
| **G** | Storefront editorial (storia, porchetta steps, home strips, privacy/cookie) is hardcoded in TSX. | Missing surface | ✅ Round 5 |

---

## 1. Page-by-page inventory

**Legend:** ✅ full CRUD · ✍️ writes but partial · 👁 read-only *by design* · ⚠️ read-only
*by omission* (a dead end).

### Vendite

| Route | Does | State |
| --- | --- | --- |
| `/admin/orders` | filter (shop/status/fulfilment/date/q), sort, saved views, DataTable, bulk status, one-tap "Consegnato", CSV | ✅ |
| `/admin/orders/[id]` | edit lines, contact, delivery, fiscal identity, tracking, refund, resend email, status | ✅ |
| `/admin/orders/new` | counter sale: customer search, product picker, weight/price override, stock + loyalty side-effects | ✅ |
| `/admin/orders/[id]/packing-slip` | print document | 👁 |
| `/admin/reservations` | filters + facets (waitlist/unpaid), bulk status, saved views, inline edit | ✅ |
| `/admin/reservations/[id]` | full reschedule, deposit, table, status, notes | ✅ |
| `/admin/reservations/new` | manual booking with capacity check | ✅ |
| `/admin/reservations/agenda` | day prep list, day nav, "porchetta pronta", print | ✅ |
| `/admin/reservations/calendar` | week grid | **⚠️ dead end — see §3** |
| `/admin/products` | filters incl. category chips, sort, DataTable, saved views, archive, toggles, CSV import/export | ✅ |
| `/admin/products/[id]` | edit + stock ledger + batch panel (lot/expiry) | ✅ |
| `/admin/products/new` | create, VAT pre-filled from category | ✅ |
| `/admin/products/scadenze` | FEFO expiry report + write-off | ✅ |
| `/admin/discounts` + `[id]` + `new` | CRUD, toggle, limits, redemption ledger | ✅ |

### Clienti

| Route | Does | State |
| --- | --- | --- |
| `/admin/loyalty` | customers + redemptions queue, adjust points, redemption status | ✅ |
| `/admin/loyalty/[id]` | **customer 360** — the real user detail page; profile edit, points, GDPR anonymise | ✅ |
| `/admin/loyalty/scan` | in-shop card scan → add points, with confirm step | ✅ |
| `/admin/rewards` + `[id]` + `new` | CRUD + toggle | ✅ |
| `/admin/newsletter` | subscribers, segments, campaign composer, send/test/duplicate | ✅ |

### Contenuti

| Route | Does | State |
| --- | --- | --- |
| `/admin/blog` + `[id]` + `new` | CRUD, publish toggle, SEO fields, image upload | ✅ |
| `/admin/shops` + `[id]` + `new` | CRUD: hours (structured), capacities, per-shop feature flags | ✅ |

### Sistema

| Route | Does | State |
| --- | --- | --- |
| `/admin/reports/iva` | VAT summary, period presets, per-shop, CSV | 👁 (correct) |
| `/admin/analytics` | visits/pages/referrers, range picker | 👁 (correct) |
| `/admin/outbox` | email queue, retry one / retry all failed | ✍️ |
| `/admin/audit` | activity log, filters, CSV | 👁 (correct) |
| `/admin/users` | list, role, activate, password reset, 2FA reset, verify email — detail links to `/admin/loyalty/[id]` | ✅ |
| `/admin/users/new` | create staff/admin | ✅ |
| `/admin/security` | own TOTP enrolment, recovery codes, sign out other sessions | ✅ |
| `/admin/settings` | ~28 typed settings + raw JSON editor, SMTP test, run-cron-now, Instagram | ✅ |
| `/admin` | KPI hub, insights, today's bookings, recent orders, quick actions | 👁 (correct — it's a hub) |

**Verdict:** four pages are read-only, and three of those *should* be (a report, a stats
page, a log). Only the calendar is read-only by omission.

---

## 2. Missing surface A — **Categorie**

### What exists today

There is **no `categories` table**. A category is a free-text string, stored twice, in two
vocabularies that never meet:

```
products.category          blog_posts.category
-----------------          -------------------
Salumi (7)                 Bottega (4)   Ricette (3)
Formaggi (5)               Tecnica (2)   Territorio (2)
Carni (5)                  Avvisi, Cantina, Formaggi,
Gastronomia (3)            Prodotti, Storie, Tradizione (1 each)
Cantina (2)
Specialità della casa (1)
Regalo (1)
```

Everything downstream is *derived*:

- `lib/db/queries.ts:117` — the storefront filter rail is `select distinct category`.
- `lib/admin/queries.ts:414` `getCategoryVatDefaults()` — infers a VAT rate per category by
  taking the most common rate among that category's products.
- `lib/categories.ts` `categoryAccent()` — maps a category to a colour by **keyword
  substring matching**, hardcoded in TSX.
- `components/admin/forms.tsx:135` — the product form is a free-text `<input list=…>`.
  The blog form (`:294`) has no datalist at all.

### Why that hurts

1. **A typo forks the catalogue.** Type `Formaggio` once and the storefront rail grows an
   eighth chip holding one product. Nothing warns you; nothing merges it.
2. **The VAT inference is already ambiguous.** In the live DB, `Gastronomia` has products
   at **two different VAT rates**. `getCategoryVatDefaults` picks the more common one and
   silently pre-fills the wrong rate for the next product in that category.
3. **Colour is a code change.** `Tecnica` and `Territorio` (blog) match no keyword and fall
   through to the house gold. Adding a category means editing `lib/categories.ts`.
4. **No ordering.** The rail is `distinct` order, not editorial order.
5. **No category landing page** — `/negozio?cat=Salumi` is a query param, not a URL a
   customer can be sent to or Google can index.
6. **Rename is impossible.** Renaming means an UPDATE across `products` by hand.

### What it should be

**Table** `categories`:

| column | why |
| --- | --- |
| `id`, `slug` (unique), `name` | identity + a real URL |
| `kind` `'product' \| 'post'` | one table, two vocabularies, no join confusion |
| `parentId` (nullable) | "Salumi → Stagionati" without a second table |
| `defaultVatRateBps` | replaces the *inference* with a *declaration* — fixes the Gastronomia ambiguity |
| `accent` | the colour, chosen in the UI instead of by substring match in `lib/categories.ts` |
| `description`, `image`, `seoTitle`, `seoDescription` | so `/negozio/categoria/[slug]` is a real page |
| `sortOrder`, `active` | editorial order; hide without deleting |

**Migration is safe:** seed the table from the existing `distinct category` values, keep
`products.category` as the text column and add `products.categoryId` as a nullable FK
backfilled by name match. Nothing breaks on day one; the text column becomes the fallback
and can be dropped later.

**Pages:** `/admin/categories` (list, drag-reorder, product count per row, merge action) and
`/admin/categories/[id]` (name, slug, parent, VAT default, accent picker, image, SEO).

**Connections it unlocks:**
- product form: `<select>` instead of free text → no more typos
- `/negozio` rail reads `categories` (ordered, coloured, hideable)
- new route `/negozio/categoria/[slug]` — indexable, linkable, with its own copy
- `getCategoryVatDefaults()` deletes; VAT default comes from the category row
- `categoryAccent()` shrinks to a DB read with the keyword map as fallback
- IVA report and analytics can group by a stable id instead of a string

---

## 3. Missing surface B — **Consegna / Asporto**

### What exists today

The entire fulfilment model is:

- `orders.fulfilment` — enum `'pickup' | 'shipping'` (schema.ts:477)
- `store.shippingCents` — one flat fee, default 700 (`lib/orders.ts:95`)
- `store.freeShippingThresholdCents` — one threshold
- `store.shippingVatRate` — one rate
- `orders.carrier` / `orders.trackingNumber` — typed by hand after the fact
- `orders.autoFulfilPickupDays` — auto-close pickups after N days

That's it. There is no page; `consegna`/`asporto` exists only as **a filter chip on the
orders list** (`lib/admin/filters.ts:169`) and two radio buttons at checkout
(`CheckoutClient.tsx:308`).

Live data shows both halves are real business: **406 pickup orders, 194 shipping orders.**

### What's missing

| Gap | Consequence today |
| --- | --- |
| **No pickup time slots** | The customer picks "ritiro" and no time. The counter has no idea when 40 people are coming. Bookings have an agenda; pickups have nothing. |
| **No pickup cut-off** | An order placed at 19:58 for a shop closing at 20:00 is accepted. |
| **No per-shop fulfilment rules** | `shops.storeEnabled` is a boolean. One shop cannot ship while the other only does pickup. |
| **No delivery zones** | Flat €7 to anywhere in Italy. No CAP allow-list, no zone pricing, no "consegna a domicilio in Ancona €3". |
| **No weight/volume pricing** | A 4 kg porchetta and a jar of sugo ship at the same price. `products.soldByWeight` exists but never reaches the shipping calc. |
| **No third fulfilment mode** | `consegna a domicilio` (local delivery, own van) is genuinely different from `spedizione` (courier). The enum has no room for it. |
| **No carrier presets** | `carrier` is free text — "BRT", "Brt", "B.R.T." will all appear. No tracking URL template, so the tracking number in the customer email isn't a link. |
| **No prep queue** | `/admin/orders?tipo=pickup&stato=to-fulfil` is the closest thing, and it isn't grouped by day or printable like the reservations agenda is. |

### What it should be

**1. Widen the enum** to `'pickup' | 'delivery' | 'shipping'` — a check-constraint migration
plus the three call sites in `lib/orders.ts`, `CheckoutClient.tsx`, `filters.ts`.

**2. Table `delivery_zones`:**

| column | why |
| --- | --- |
| `id`, `name` | "Ancona centro", "Provincia AN", "Resto d'Italia" |
| `mode` `'delivery' \| 'shipping'` | own van vs courier |
| `postcodes` (JSON array) or `matchPattern` | CAP allow-list |
| `feeCents`, `freeOverCents` | replaces the two global settings |
| `minOrderCents` | "consegniamo da €25 in su" |
| `perKgCents` (nullable) | finally uses `soldByWeight` |
| `leadTimeHours`, `active` | |

**3. Table `pickup_slots`** (or generate them from `shops.hoursStructured`):
`shopSlug`, `weekday`, `from`, `to`, `capacityOrders`, `cutoffHours`, `active`.
Then `orders` gains `pickupSlotAt` (timestamp) and `deliveryZoneId`.

**4. Pages:**
- `/admin/fulfilment` — tabs: *Ritiro* (slots + cut-offs per shop), *Consegna* (zones),
  *Spedizione* (carriers, rates, free-shipping threshold, tracking URL templates)
- `/admin/fulfilment/oggi` — the operational screen the shop actually needs each morning:
  today's pickups by slot + today's deliveries by zone, printable, one-tap "Consegnato".
  This is the `agenda` page's sibling for orders, and it's the single highest-value screen
  in this whole document.

**Connections it unlocks:** checkout prices shipping from the zone matching the CAP instead
of a flat number → `lib/orders.ts` `calculateOrder` reads zones → the pickup slot is written
on the order → the "oggi" screen groups by it → `orders.autoFulfilPickupDays` can be
replaced by "auto-close the slot after it passes" → carrier presets make the tracking link
in the customer email real.

---

## 4. The dead ends and broken connections

### ⚠️ C · The reservation calendar cannot be clicked

`app/admin/(dash)/reservations/calendar/page.tsx:154` — each booking is:

```tsx
<li key={r.id} className={…}>   // ← not a <Link>
```

Every other list in the gestionale links to a detail page. The calendar — the one screen an
owner opens to *look at the week* — shows the name, the time and the kg, and then offers no
way to open it. `/admin/reservations/[id]` exists and is complete; the calendar simply never
links to it.

**Fix:** wrap the `<li>` contents in `<Link href={`/admin/reservations/${r.id}`}>`. One line.
While there: the day header should link to `/admin/reservations/agenda?data=<iso>`, and an
empty day should offer `+ Nuova` prefilled with that date.

### 🔴 D · A reservation of type `order` goes nowhere

`reservations.type` is `'table' | 'porchetta' | 'order'`. `order` means *ordine speciale* —
"mi tenga 2 kg di ciauscolo per giovedì". It has a name, a phone, a date, notes… and no
line items, no price, no VAT, no stock reservation, no loyalty accrual.

There is no conversion path: `grep` finds no `reservationId` on `orders`, no
`convertReservationToOrder`, nothing. When the customer collects it, someone re-types the
whole thing into `/admin/orders/new` — or, more likely, rings it into the till and the
platform never learns it happened.

**Fix:** add `orders.reservationId` (nullable FK) and a **"Converti in ordine"** button on
`/admin/reservations/[id]` for `type === 'order'`, which opens `/admin/orders/new`
pre-filled with the customer, shop, notes and `fulfilment: 'pickup'` with the pickup slot set
to the reservation date. On save, stamp the reservation `completed` and link the two.

This is the single biggest *connection* gap: it's a whole revenue channel that the VAT
report, the stock ledger and the loyalty programme cannot see.

### 🐞 E · Porchetta capacity — wrong key, wrong scope

Three places disagree:

| Where | Reads |
| --- | --- |
| `lib/reservations.ts:60` (**enforcement**) | `porchetta.capacityKgPerDay`, falling back to `porchetta.weeklyCapacityKg`, then **overridden by `shops.porchettaCapacityKg`** |
| `app/admin/(dash)/settings/page.tsx:81` (**the only editor**) | `porchetta.weeklyCapacityKg` — the *deprecated* key, labelled "settimanale" |
| `app/(site)/porchetta/page.tsx:88` (**public availability**) | `porchetta.weeklyCapacityKg`, compared against `getPorchettaKgForDate()` which sums **both shops** |

So: the canonical key is unreachable from the UI, the label contradicts the behaviour
(`reservations.ts:57`: *"named weeklyCapacityKg but has always been applied per pickup day"*),
and the public page compares a two-shop total against a one-shop number. It can say
*esaurito* while a shop still has room, or *disponibile* for a shop that's full — and the
booking is then refused at submit. Both shops currently have `porchetta_capacity_kg = NULL`,
so this is latent, not yet firing.

**Fix:** rename the settings-page key to `porchetta.capacityKgPerDay` with the "per giorno di
ritiro" label; make `/porchetta` shop-aware (scope `getPorchettaKgForDate` by `shopSlug` and
call `porchettaCapacityFor(shop)`); surface the per-shop override on `/admin/shops/[id]` with
a line saying which number is in force.

### 🔓 F · Staff see everything, everywhere

`users.role` is `'customer' | 'staff' | 'admin'` with no shop column. Two locations
(`centro`, `carni`), 2 staff accounts, and every list defaults to both shops. Nav hides
admin-only items from staff (`adminOnly`), but a `carni` counter person can edit `centro`'s
products, refund `centro`'s orders and read `centro`'s customers.

**Fix:** `users.shopSlug` (nullable = all shops), defaulted into the `negozio` filter for
staff and enforced in `ordersWhere`/`productsWhere`/`reservationsWhere` rather than merely
pre-selected in the UI. Admins keep the global view.

### 📝 G · The storefront's editorial voice is in TSX

Hardcoded arrays the owner cannot touch:

| File | Content |
| --- | --- |
| `app/(site)/la-nostra-storia/page.tsx:25,48` | `capitoli`, `pilastri` — the whole history page |
| `app/(site)/porchetta/page.tsx:41,64` | `steps`, `gallery` |
| `components/site/home/Hero.tsx:12` | `facts` = `["Dal 1946", "Due botteghe ad Ancona", …]` |
| `components/site/home/Servizi.tsx:11`, `Porchetta.tsx:18` | service cards, recipe steps |
| `app/(site)/privacy/page.tsx`, `cookie/page.tsx` | 0 DB reads — legal text, frozen in code |

Two settings (`home.today`, `home.brands`) are editable, which shows the pattern was
intended and then stopped. The rest requires a deploy to fix a typo.

**Fix (cheapest first):** a `site_content` key/value table (`key`, `label`, `group`,
`type: text|richtext|list|image`, `value` JSON) plus `/admin/contenuti` grouped by page.
Seed it from the current constants so nothing changes visually on day one. That's a smaller
lift than a page builder and covers everything above, privacy/cookie included.

---

## 5. How it all connects — the graph as it should be

```
                       ┌───────────────┐
                       │   categories  │◄── new. one vocabulary, two kinds
                       └──┬─────────┬──┘
                 categoryId│         │categoryId
                    ┌──────▼───┐ ┌───▼────────┐
                    │ products │ │ blog_posts │
                    └────┬─────┘ └────────────┘
        ┌────────────────┼─────────────────┐
        │                │                 │
┌───────▼──────┐  ┌──────▼───────┐  ┌──────▼──────────┐
│stock_movements│ │product_batches│  │  order_items    │
└──────────────┘  └───────────────┘  └────┬────────────┘
                                          │
                     ┌────────────────────▼─────────────────────┐
                     │                orders                    │
                     │  fulfilment: pickup | delivery | shipping │◄── widen
                     │  + pickupSlotAt  + deliveryZoneId         │◄── new
                     │  + reservationId                          │◄── new (D)
                     └──┬──────────┬──────────┬──────────┬───────┘
        userId          │          │          │          │ discountCode
   ┌──────▼───────┐ ┌───▼──────┐ ┌─▼────────┐ │  ┌───────▼─────────┐
   │    users     │ │ IVA report│ │ loyalty  │ │  │ discount_codes  │
   │ + shopSlug   │ └───────────┘ │ accounts │ │  │ + redemptions   │
   └──────┬───────┘               └──────────┘ │  └─────────────────┘
          │                                    │
   ┌──────▼────────┐                  ┌────────▼──────────┐
   │ reservations  │                  │  delivery_zones   │◄── new (B)
   │ type: table │  │──"Converti"──►  │  pickup_slots     │◄── new (B)
   │  porchetta │   │      (D)        └───────────────────┘
   │  order ─────┘  │
   └───────┬────────┘
     shopSlug│
      ┌──────▼──────┐        ┌────────────────┐
      │    shops    │        │  site_content  │◄── new (G)
      │ hours, caps │        └────────────────┘
      └─────────────┘
```

The four solid arrows that don't exist yet are the whole point: **categories → products**,
**zones/slots → orders**, **reservation → order**, **user → shop**.

---

## 6. Plan, in the order I'd do it

### Round 1 — cheap fixes, no migration ✅ **done 2026-08-21**

1. ✅ **Linked the calendar** (§3 C). Entries open `/admin/reservations/[id]`; day headers
   open that day's agenda; an empty day offers `+ Nuova` pre-filled with the date
   (`/admin/reservations/new?data=<iso>`, a new `defaultDate` prop on `ReservationForm`).
   `no_show` also gained its own entry style — it had been falling through to the neutral
   grey and reading as "completata".
2. ✅ **Fixed the porchetta capacity key + scope** (§3 E). Settings now edits
   `porchetta.capacityKgPerDay` under a label that matches the behaviour, seeded from the
   superseded key via a new `legacyKey` field so an existing install shows its real number.
   Resolution uses a null sentinel instead of `||`, so an explicit 0 ("no limit") no longer
   falls through to a stale legacy cap. `/porchetta` now reports availability **per shop**
   through a new `porchettaAvailability()` that reuses the same check the booking path
   enforces. The shop-blind `getPorchettaKgForDate()` was deleted rather than kept as a
   convenience — it is what let the two drift apart.
3. ✅ **Blog form category datalist**, fed by a new `getBlogCategories()` (most-used first).
4. ✅ **Carrier presets** — `store.carriers` setting (one per line, optional
   `| url-with-{codice}`), new `lib/carriers.ts`, a `lines` textarea control in Settings, a
   datalist on the order's carrier field, and a "apri il tracking" link on the order.
   Shipped with **names only, no URLs**: a guessed tracking URL sends a customer to a 404,
   so the templates are for the shop to paste from its own carrier account.

   Found while doing it: the customer could not see the tracking number **anywhere** —
   `/traccia` (the page a customer opens precisely to ask "where is my order") and the
   account order detail both omitted it entirely, and the one email line was plain text.
   All three now show carrier + number, linked when a template is configured.

**Verified:** 243 tests pass (14 new: carrier parsing, per-shop availability, the legacy-key
precedence), `tsc` clean, `eslint` 0 errors. `/porchetta` confirmed rendering two separate
per-shop figures against a live dev server. **Not verified:** the four admin screens as
rendered output — an unauthenticated fetch redirects at the layout, so the page bodies never
ran. They need one click-through.

Also noticed: `test/reservations-admin.test.ts` is not idempotent across runs — rerunning it
without `rm -rf .vitest-tmp` double-counts fixtures and fails five assertions. Pre-existing;
worth fixing when that file is next touched.

### Round 2 — Categorie (§2) ✅ **done 2026-08-21** · migration `0029`

5. ✅ `categories` table (`kind`, `parentId`, `defaultVatRateBps`, `accent`, SEO, order,
   `active`) + `products.categoryId` + `blog_posts.categoryId`. Slugs are unique **per
   kind** — "Formaggi" is both a product category and a news category in the live data, so a
   global unique index would have made the backfill impossible.

   The backfill is hand-written SQL appended to the generated migration, so it runs wherever
   migrations run rather than only where the seed script does. It slugifies in SQL (no regex
   in SQLite: an accent-strip + punctuation replace chain), disambiguates colliding slugs
   with a numeric suffix, seeds `sortOrder` from how much each category is actually used, and
   records `defaultVatRateBps` from the majority rate — the same value `getCategoryVatDefaults()`
   used to re-infer on every render, now recorded once so a mixed category is correctable.
   Verified against a copy of the live DB before being applied: 17 categories, `Specialità
   della casa` → `specialita-della-casa`, **0 unlinked rows**.
6. ✅ `/admin/categories` (+ `new`, `[id]`), admin-only, with the kind switch, usage counts,
   hide/show, and the **merge tool** — the cleanup for a typo that forked the catalogue.
   Also a banner counting rows whose free-text category matches no record, so the residue is
   visible instead of silent.
7. ✅ Product and blog forms are now `<select>`s. `getCategoryVatDefaults()` and the
   stopgap `getBlogCategories()` are gone; `categoryAccent(name, declared)` takes the
   category's own accent and keeps the keyword map as fallback. Renaming a category rewrites
   the denormalised `category` name on every row that points at it, so the storefront
   filters, CSV export and IVA report keep working untouched.
8. ✅ `/negozio/categoria/[slug]` — own copy, own colour, own SEO fields, breadcrumb JSON-LD,
   in the sitemap, and linked from the category label on **every** product page (without
   those inbound links the page would exist but be unreachable).

**Two things found while doing it:**

- **drizzle-kit silently dropped the FK action.** The generated
  `ALTER TABLE products ADD category_id text REFERENCES categories(id)` has no
  `ON DELETE set null` even though the schema declared one, so the real behaviour is
  RESTRICT — and the snapshot it wrote recorded `set null`, which meant the next
  `db:generate` wanted a **full table rebuild of `products` and `blog_posts`** to reconcile
  metadata the database already matched. Caught by a test, not by tsc. Resolved by keeping
  RESTRICT (it is the stronger guarantee — a category holding products cannot be deleted at
  all), making the schema say so, and correcting the 0029 snapshot instead of shipping the
  rebuild. `db:generate` now reports no drift. **Read the generated SQL** — this is the
  second variant of that trap, alongside the one in the memory notes.
- **The CSV importer would have silently unfiled products**, since it only ever wrote the
  category *name*. It now resolves the name onto the taxonomy case-insensitively, and
  deliberately does **not** create categories — an importer that could mint them would
  re-introduce exactly the silent forking this table exists to stop.

**Verified:** 252 tests pass (9 new), `tsc` clean, `eslint` 0 errors, `db:generate` reports
no drift. Migration applied to the dev database; `/negozio`, `/negozio/categoria/salumi`,
`/negozio/categoria/specialita-della-casa`, the filter rail, the product→category links and
all 7 sitemap entries confirmed rendering against the running dev server. **Not verified:**
the admin screens as rendered output (unauthenticated fetches redirect at the layout).

### Round 3 — Consegna/Asporto (§3 B) ✅ **done 2026-08-21** · migration `0030`

9. ✅ `orders.fulfilment` widened to `pickup | delivery | shipping`. SQLite cannot alter a
   CHECK constraint, so this is a full table rebuild of `orders` — see the warning below,
   which is the most dangerous thing found in any round so far.
10. ✅ `delivery_zones` (CAP allow-list, per-zone fee, free-over threshold, minimum order,
    per-kg surcharge, lead time, serving location, note, order, active) and `pickup_slots`
    (per shop, per weekday, start/end, capacity, cut-off). `orders` gained `pickupSlotAt`
    (the resolved instant, not a slot id — so editing the weekly schedule later cannot
    silently move an appointment already made) and `deliveryZoneId`.
11. ✅ Carriage now has **one** pricing authority, `quoteCarriage()` in `lib/orders.ts`,
    used by checkout, by every admin re-price and by the counter form. The zone matching
    itself is in `lib/fulfilment.ts`, which is deliberately isomorphic — the browser quotes
    with the identical function the server charges with, so the figure shown and the figure
    charged cannot drift. A CAP no zone covers falls back to the flat `store.shippingCents`,
    so an order placed before zones existed still re-prices; the two settings are relabelled
    "di riserva" in Settings, because a number that silently stopped applying is worse than
    one that says what it is. The migration seeds "Resto d'Italia" from those exact values,
    so day one changes no price.
12. ✅ Checkout: three modes (delivery appears **only** where a zone exists), a CAP-driven
    live quote showing the zone, its note and its lead time, and a pickup-window picker.
    An unserviceable CAP or an under-minimum basket is refused *next to the CAP field* and
    disables the pay button — the customer used to reach Stripe and be refused there.
    Gates are enforced at checkout and deliberately **not** at the counter: an operator
    taking a phone order has already agreed to it.
13. ✅ `/admin/fulfilment/oggi` — the morning sheet, and the highest-value screen in this
    document. Four sections, scoped differently on purpose: today's pickups grouped by
    window; pickups with no window at all (they belong to no day and would otherwise be
    invisible); the delivery round grouped by zone with addresses; and shipments to pack.
    Printable, one-tap "Consegnato". ✅ `/admin/fulfilment` — three tabs, with **"genera
    dagli orari di apertura"**, because twenty windows typed by hand is the reason a feature
    like this stays unconfigured; re-running upserts rather than duplicating.

**A shop that configures nothing keeps the old behaviour exactly** — no windows offered,
none required, flat shipping. Every part of this is opt-in per location.

**The dangerous thing.** drizzle-kit's generated rebuild of `orders` would have destroyed
data twice over, and neither failure would have raised an error:

- Its `INSERT INTO __new_orders … SELECT …, "pickup_slot_at", "delivery_zone_id" FROM orders`
  selects the two columns *this migration is adding*, so the migration cannot run at all.
  That one is loud.
- `orders_fts` (migration 0024) is an FTS5 **external-content** index over `orders`, kept in
  sync by three AFTER triggers and linked by **rowid**. `DROP TABLE orders` takes those
  triggers with it silently — DROP TABLE fires no triggers, so the index is never told its
  content is gone — and the copy into a fresh rowid table renumbers every row. Admin order
  search would have kept answering, with the wrong orders, for ever. The migration now
  recreates the three triggers verbatim and rebuilds the index.

Verified before applying, against a copy of the live database: 600 orders and 1673 line
items intact, 12 indexes recreated, `pragma foreign_key_check` clean, FTS integrity-check
passing and resolving a known customer to the right order number.

Also fixed on the way through: the customer confirmation and the "ready" email now carry the
pickup window (it is the appointment the customer has to keep); a local delivery no longer
gets told its order is "pronto per il ritiro" while they wait at home; `/traccia`, the
account order page, the packing slip, the orders list and the CSV export all know the third
mode; and the one-tap "Consegnato" now covers deliveries, which is the same act.

### Round 4 — the connections ✅ **done 2026-08-21** · migration `0031`

14. ✅ **`orders.reservationId` + "Converti in ordine"** (§3 D). A `type: 'order'` booking
    now has a button that opens `/admin/orders/new?prenotazione=<id>` pre-filled with the
    customer, the shop and the notes; saving creates the sale **and** closes the booking in
    the same transaction, and the booking then shows a link to the order it became instead
    of offering to convert again. A **unique index** on `orders.reservation_id` is what
    actually prevents a double conversion — a button that hides itself is not a guard, and a
    stale tab can still post. NULLs are distinct in SQLite, so the 600 existing orders are
    unaffected. This was a whole revenue channel the VAT report, the stock ledger and the
    loyalty programme could not see.
15. ✅ **`users.shopSlug` + real enforcement** (§3 F). Null means every location, which is
    what every existing account is — so nothing changes until someone opts in. The scope is
    applied in **three** places (`lib/admin/scope.ts`), because a filtered list is not access
    control: `lockShop` forces the `negozio` facet on the orders, products and reservations
    lists so it cannot be widened from the query string; `assertShopScope` 404s the three
    detail pages; and `requireShopScope` refuses the mutating actions — a single
    `mustFindOrder` chokepoint for all seven order actions, the existing
    `mustFindReservation` for bookings, and both ends of a product move so a scoped operator
    can neither edit another shop's product nor reassign one of their own away. Rows with no
    location (a courier shipment, a global discount) stay visible to everyone. The shop is
    assigned beside the role, in one write, because they are one privilege.

Found here: `ALTER TABLE … ADD COLUMN … REFERENCES` dropped the declared `onUpdate: cascade`
on `users.shop_slug` while the snapshot recorded it — the same drizzle-kit trap as Round 2,
which would have made the next `db:generate` want to rebuild `users` (a table with its own
FTS triggers). Caught by reading the generated SQL, resolved by removing the phantom action;
`saveShop` never writes `slug` on an existing shop, so it was decorative anyway.

### Round 5 — Contenuti (§3 G) ✅ **done 2026-08-21** · migration `0032`

16. ✅ `site_content` (key → value) plus a **code registry** in `lib/site-content.ts` holding
    each entry's label, group, type and — crucially — its **default: the exact text the page
    shows today**. So there is no seed step and no migration that could half-apply: an empty
    table renders the site precisely as it read before, a key nobody edits stores nothing,
    and deleting a row *is* "reset to the original" (which is what saving an empty field
    does). Four shapes cover everything — `text`, `lines`, `rich`, and `records` (one per
    line, fields separated by `|`, the same idiom as `store.carriers` from Round 1) — because
    a repeater UI per record type is a page builder.

    Now editable: the home hero facts, the five service cards, the porchetta recipe, the
    history page's chapters and pillars, the porchetta method and gallery, and **both legal
    pages including their "last updated" dates**.

    The legal pages needed a decision. Their text carries structure — section headings,
    bullet lists, a `mailto:` and an outbound link — so making it editable meant choosing
    between losing that and accepting arbitrary HTML from a textarea. Neither is acceptable
    for a privacy policy, so `components/site/RichText.tsx` parses a closed grammar
    (`## heading`, `- item`, `**bold**`, `[text](/url)`) into React elements. Nothing reaches
    `dangerouslySetInnerHTML`: it is safe by construction rather than by sanitising, and
    `javascript:`, `data:` and protocol-relative destinations degrade to their own label.
    `{legalName}` and `{email}` resolve from `siteConfig`, so a change of registered name is
    not chased through six paragraphs.
17. ✅ `/admin/contenuti`, grouped by the page the text appears on — because that is how
    someone arrives: they have just looked at a page and want to change a line on it. Each
    entry says whether it is still the original, and links to the live page.

### Deliberately out of scope

- **Fornitori / ordini d'acquisto.** `products.supplier` is free text and `costCents` exists,
  so margin reporting works. A purchase-order module is a new product, not a gap.
- **Tavoli as an entity.** `reservations.tableNumber` is free text on purpose
  (`schema.ts:368`) — capacity is enforced on seats. Two rooms don't need a registry.
- **Media library page.** Every form has upload + preview and `sweepOrphanedMedia` runs in
  the maintenance job. A browser adds no capability.
- **`/admin/users/[id]`.** The customer 360 at `/admin/loyalty/[id]` already is it, and the
  users list links there. Worth *renaming* the IA later; not worth a second page.
