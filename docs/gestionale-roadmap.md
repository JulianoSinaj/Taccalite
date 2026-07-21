# Gestionale — Feature-Coverage Roadmap

_Generated 2026-07-21 from a per-page intent-vs-reality audit + external benchmark
(Shopify / Square / Toast / Lightspeed / Medusa / Saleor + Italian gestionali Danea,
TeamSystem, Nubble). Branch: `feat/platform-hardening`._

## Verdicts

- **Stack:** no framework change needed. Next 16.2 / React 19 / Tailwind v4 / Drizzle
  are current. shadcn/ui + Radix + lucide + motion are already installed but unused in
  the admin. The "upgrade" is **adoption, not replacement**: bring a data-grid + charts
  layer to the admin using tools already in `package.json`.
- **Design:** the admin is a hand-rolled brown/cream/gold "boutique" system —
  card-per-row lists, `<details>` create forms, native form POSTs. Beautiful, but not
  data-dense. Missing: data tables (sort/bulk/density), charts, dark mode, ⌘K search,
  saved views, breadcrumbs.
- **Priority (per owner):** **functionality coverage first**, UI polish second.

## Already solid (do not rebuild)

Auth + sessions + RBAC (defence-in-depth), Stripe checkout + **real refunds**, reservation
lifecycle + porchetta capacity/waitlist/ready-emails, loyalty (points/ledger/redemptions/
in-shop scan), **double-opt-in newsletter** + segments + outbox, CMS CRUD + image upload,
cookieless analytics, CSV exports, typed settings, pagination.

---

## Roadmap (priority-ordered)

Legend: `[✓]` shipped this session · `[~]` partially shipped · `[ ]` planned.

### P0 — Legally / operationally load-bearing

- **Fiscal / IVA foundation**
  - `[✓]` Per-product VAT rate (4/5/10/22%), VAT snapshot on order lines, VAT-inclusive
    price model, IVA breakdown on order detail.
  - `[✓]` Business fiscal identity settings (ragione sociale, Partita IVA, Cod. Fiscale,
    regime, REA).
  - `[✓]` IVA report (imponibile + imposta per rate over a date range) + CSV export.
  - `[ ]` **Fatturazione elettronica / SdI** (FatturaPA XML) — via certified provider
    integration (Fatture in Cloud / TeamSystem / Danea). Needs external credentials.
  - `[ ]` **Corrispettivi telematici / documento commerciale** (RT device or AdE software).
  - `[ ]` Invoice / credit-note PDF generation; Codice Destinatario / PEC capture on B2B.
- **Food-vertical product data**
  - `[✓]` Sold-by-weight / price-per-kg pricing model.
  - `[✓]` Allergens (EU Reg. 1169/2011 — 14 allergens), ingredients, origin/traceability.
  - `[~]` Lot / batch + expiry (scadenza) tracking → basic product fields shipped; full
    FEFO batch table is a follow-on.
- **GDPR / consent**
  - `[✓]` Data-subject export + right-to-erasure (anonymize) tooling per customer.
  - `[ ]` Cookie-consent banner audit (Garante equal Accept/Reject) — storefront task.

### P1 — Core commerce merchants expect

- `[✓]` **Discount codes / coupons** (percent / fixed / free-shipping, min-spend, usage
  limits, validity window, active) + admin CRUD + server-side validation, applied in
  `createOrder` (+ Stripe ad-hoc coupon so totals match) and shown on order detail.
  `[ ]` Remaining: the customer-facing coupon **input field** in the storefront
  `CheckoutClient` (deliberately deferred — left the live checkout UI untouched while
  running unattended; the whole engine behind it is done and admin-manageable).
- `[✓]` **Audit log** of sensitive actions (refunds, role/price changes, deletes, point
  adjustments, settings) + admin viewer.
- `[ ]` **Manual / draft orders** (phone & counter orders from admin, send payment link).
- `[ ]` **Inventory ops**: stock adjustment-with-reason + movement log, suppliers / POs.
- `[ ]` **Reservation deposits + no-show tracking** (Stripe card-hold).
- `[ ]` Weight-reconciliation at pack time for sold-by-weight orders.

### P2 — Differentiators

- `[✓]` **Dashboard KPI upgrade**: AOV, period-over-period deltas, top products, new-vs-
  returning, revenue trend chart.
- `[ ]` Dynamic customer **segments** reusable across marketing.
- `[ ]` Marketing **automations** (welcome / abandoned-cart / back-in-stock).
- `[ ]` Per-page **SEO** fields + sitemap + schema.org (Product / LocalBusiness / Recipe);
  scheduled blog publishing.
- `[ ]` Reporting: sales-by-product, Stripe payout reconciliation.
- `[ ]` **2FA** for admin accounts.

### P3 — Polish / scale

- `[ ]` shadcn **DataTable** (sort / bulk-select / bulk actions / density) across
  orders / products / customers / reservations.
- `[ ]` **Dark mode** via semantic design tokens (retrofit the raw brown/cream palette).
- `[ ]` **⌘K command palette**, saved filter views, breadcrumbs.
- `[ ]` Gift cards / store credit, B2B price lists, multi-location stock, tiered loyalty.

---

## Implementation notes

- Migrations: edit `lib/db/schema.ts` → `npm run db:generate` → applied on boot
  (`RUN_MIGRATIONS_ON_BOOT` in prod). Keep the CHECK-constraint + cents + nanoid-PK
  conventions already in the schema.
- Every batch is verified `tsc` + `lint` (+ tests where present) and committed green.
- Money stays integer cents; VAT stored as basis points (bps) so 22% = 2200.
