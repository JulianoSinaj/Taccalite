# Taccalite — Systems Map

> A whole-platform decomposition into named systems, so each one can be audited
> on its own and scored for production readiness.
>
> **Status:** map only. The readiness column is deliberately empty — it gets
> filled one system at a time by a dedicated code audit per system.
>
> Last surveyed: 2026-09-02 · 333 source files (`app/`, `components/`, `lib/`),
> 33 tables, 46 migrations, 54 unit suites, 6 e2e suites.

---

## The shape of it

Taccalite is one Next.js application wearing three faces:

- **la vetrina** — the public storefront (`app/(site)`) that sells and tells the story
- **il gestionale** — the back office (`app/admin`) the shop is actually run from
- **le macchine** — the headless bits (`app/api`, cron, mail, webhooks) that keep both honest

Under those three faces sit **24 systems**, grouped into **7 constellations**.
The constellations are for navigation; the systems are the audit unit.

```
                          ┌─────────────────────────┐
                          │   ⑤ LA VETRINA          │  what the customer sees
                          │   content · storefront  │
                          └────────────┬────────────┘
                                       │
   ┌───────────────────────┬───────────┴──────────┬───────────────────────┐
   │  ① IL BANCO           │  ② LA CONSEGNA       │  ③ I CLIENTI          │
   │  catalogue · stock    │  fulfilment          │  identity · accounts  │
   │  orders · payments    │  reservations        │  loyalty              │
   │  discounts            │  locations & hours   │                       │
   └───────────┬───────────┴───────────┬──────────┴───────────┬───────────┘
               │                       │                      │
               │        ┌──────────────┴──────────────┐       │
               │        │  ④ LA VOCE                  │       │
               │        │  mail · newsletter · cron   │       │
               │        └──────────────┬──────────────┘       │
               │                       │                      │
   ┌───────────┴───────────────────────┴──────────────────────┴───────────┐
   │  ⑥ IL REGISTRO — fiscal · analytics · security & audit · admin shell │
   └───────────────────────────────────┬──────────────────────────────────┘
                                       │
   ┌───────────────────────────────────┴──────────────────────────────────┐
   │  ⑦ LE FONDAMENTA — data layer · testing · runtime & deployment       │
   └──────────────────────────────────────────────────────────────────────┘
```

---

## Index

| # | System | Constellation | Readiness |
|---|--------|---------------|-----------|
| 1 | [Catalogue & Products](audits/01-catalogue-products.md) | ① Il Banco | **91** |
| 2 | Inventory & Stock | ① Il Banco | — |
| 3 | Orders & Checkout | ① Il Banco | — |
| 4 | Payments | ① Il Banco | — |
| 5 | Discounts & Promotions | ① Il Banco | — |
| 6 | Fulfilment & Logistics | ② La Consegna | — |
| 7 | Reservations | ② La Consegna | — |
| 8 | Locations, Hours & Closures | ② La Consegna | — |
| 9 | Identity & Authentication | ③ I Clienti | — |
| 10 | Customer Accounts | ③ I Clienti | — |
| 11 | Loyalty & Rewards | ③ I Clienti | — |
| 12 | Transactional Mail & Outbox | ④ La Voce | — |
| 13 | Newsletter, Campaigns & Segments | ④ La Voce | — |
| 14 | Automation & Scheduled Jobs | ④ La Voce | — |
| 15 | CMS & Editorial | ⑤ La Vetrina | — |
| 16 | Storefront Experience | ⑤ La Vetrina | — |
| 17 | Media & Assets | ⑤ La Vetrina | — |
| 18 | Fiscal & Accounting | ⑥ Il Registro | — |
| 19 | Analytics & Reporting | ⑥ Il Registro | — |
| 20 | Security, Audit & Compliance | ⑥ Il Registro | — |
| 21 | Admin Gestionale Shell | ⑥ Il Registro | — |
| 22 | Data Layer & Migrations | ⑦ Le Fondamenta | — |
| 23 | Quality & Testing | ⑦ Le Fondamenta | — |
| 24 | Runtime, Config & Deployment | ⑦ Le Fondamenta | — |

---

# ① IL BANCO — the counter

*Everything that turns a product into money.*

## 1. Catalogue & Products

**Owns** — what the shop sells: products, their categories and category kinds,
slugs, pricing and VAT rate, per-shop availability, sort order, CSV import.

| | |
|---|---|
| **Tables** | `products`, `categories`, `product_batches` |
| **Core** | `lib/categories.ts`, `lib/admin/category-kinds.ts`, `lib/slug.ts`, `lib/slug-core.ts`, `lib/data.ts` |
| **Admin** | `lib/admin/product-import.ts`, `lib/admin/category-actions.ts`, `lib/admin/actions.ts` (product CRUD) |
| **Surfaces** | `/admin/products`, `/admin/products/new`, `/admin/products/[id]`, `/admin/categories/*`, `/negozio`, `/negozio/[slug]`, `/negozio/categoria/[slug]` |
| **Components** | `components/site/ProductTile.tsx`, `ProductPlate.tsx`, `components/store/ProductBuy.tsx`, `components/admin/CategoryOrderList.tsx` |
| **Tests** | `categories.test.ts`, `product-import.test.ts` |

**Readiness: 91/100** — audited 2026-09-02 at 77, remediated the same day; see
[`docs/audits/01-catalogue-products.md`](audits/01-catalogue-products.md).
Strong taxonomy (transactional rename, RESTRICT delete, merge tool, one-level
nesting) and server-side price authority. Findings 1–8 fixed: the create path
now enforces shop scope, both the product form and the CSV import move stock
through the ledger, an archived product cannot be revived onto the storefront,
and allergens are a controlled vocabulary. Residual: a TOCTOU window on derived
slugs, and allergens are not yet in the CSV round-trip.

---

## 2. Inventory & Stock

**Owns** — the stock ledger and everything that moves it: sales, refunds,
manual adjustments, stocktakes, batches/lotti with expiry (HACCP), low-stock
thresholds, back-in-stock notifications, margin inputs.

| | |
|---|---|
| **Tables** | `stock_movements`, `stock_notifications`, `product_batches`, `products.stock` |
| **Core** | `lib/stock.ts` (the single write path), `lib/inventory.ts` (thresholds + margin), `lib/stock-notify.ts` |
| **Admin** | `lib/admin/batch-actions.ts`, `/admin/products/scadenze` |
| **Surfaces** | `POST /api/stock-notify`, `components/store/BackInStockForm.tsx`, `components/admin/BatchPanel.tsx` |
| **Tests** | `stock-ledger.test.ts`, `inventory-automation.test.ts` |

**Invariant to protect** — every stock change goes through `lib/stock.ts`. Any
direct write to `products.stock` elsewhere is a defect.

**Audit questions** — Is the ledger append-only and reconcilable against
`products.stock`? Are claims released on cancel/expiry? Does batch expiry
actually block sale?

---

## 3. Orders & Checkout

**Owns** — the cart, the checkout flow, order creation, the order lifecycle
(pending → paid → prepared → fulfilled/cancelled), order editing, refunds,
counter/phone sales, guest orders, order tracking, packing slips.

| | |
|---|---|
| **Tables** | `orders`, `order_items` |
| **Core** | `lib/orders.ts` (lifecycle), `lib/validation/order.ts` |
| **Admin** | `lib/admin/order-actions.ts` (1.4k lines — the biggest single surface) |
| **Surfaces** | `POST /api/checkout`, `/checkout`, `/checkout/success`, `/traccia`, `/admin/orders`, `/admin/orders/new`, `/admin/orders/[id]`, `/admin/orders/[id]/packing-slip` |
| **Components** | `components/store/cart.tsx`, `CartDrawer.tsx`, `CartBar.tsx`, `CheckoutClient.tsx`, `AddToCartButton.tsx`, `StickyBuyBar.tsx`, `components/admin/OrderEditor.tsx`, `ManualOrderForm.tsx` |
| **Tests** | `order-lifecycle.test.ts`, `order-edit.test.ts`, `refunds.test.ts`, `cancel-settled-order.test.ts`, `settled-order-guards.test.ts`, `domain-db.test.ts` |

**Audit questions** — Are state transitions total and guarded? Can a settled
order be mutated? Does editing an order correctly reverse stock, loyalty and
coupon effects? Is the cart authoritative on the server?

---

## 4. Payments

**Owns** — how an order is *meant* to be paid vs. how it *was* paid (two
orthogonal fields), Stripe checkout + webhook, cash/contrassegno/POS at the
counter, simulated payments in dev, settlement, refund money movement.

| | |
|---|---|
| **Tables** | payment columns on `orders` |
| **Core** | `lib/payments/methods.ts` (isomorphic — client and server share it), `lib/payments/config.ts`, `lib/payments/stripe.ts` |
| **Surfaces** | `POST /api/checkout`, `POST /api/checkout/webhook` |
| **Tests** | `payments.test.ts` |

**Audit questions** — Is the webhook signature-verified and idempotent? Can the
client influence the accepted method set? Is simulated payment truly
unreachable outside `NODE_ENV=development`? Do refunds reconcile with Stripe?

---

## 5. Discounts & Promotions

**Owns** — discount codes, their type/value, validity window, per-code and
per-customer usage limits, redemption records, live validation at checkout.

| | |
|---|---|
| **Tables** | `discount_codes`, `discount_redemptions` |
| **Core** | `lib/discounts.ts` |
| **Admin** | `lib/admin/discount-actions.ts` |
| **Surfaces** | `POST /api/discounts/validate`, `/admin/discounts/*` |
| **Tests** | `discounts.test.ts`, `discount-limits.test.ts` |

**Audit questions** — Are limits enforced atomically (no race between validate
and apply)? Is the discount re-derived server-side at order creation? Does
cancelling an order free the redemption?

---

# ② LA CONSEGNA — getting it to the customer

## 6. Fulfilment & Logistics

**Owns** — the three ways an order leaves the shop (pickup, local delivery,
shipping): pickup slots and windows, delivery zones and fees, carriers and
tracking links, the day sheet, auto-fulfil.

| | |
|---|---|
| **Tables** | `pickup_slots`, `delivery_zones` |
| **Core** | `lib/fulfilment.ts`, `lib/pickup-slots.ts`, `lib/carriers.ts`, `lib/addresses.ts`, `lib/directions.ts` |
| **Admin** | `lib/admin/fulfilment-actions.ts` |
| **Surfaces** | `/admin/fulfilment` (zones & windows), `/admin/fulfilment/oggi` (day sheet) |
| **Tests** | `fulfilment.test.ts`, `fulfilment-actions.test.ts`, `fulfilment-db.test.ts`, `carriers.test.ts` |

**Audit questions** — Are slots capacity-bounded and closure-aware? Can a
delivery be booked outside its zone? Is the day sheet correct across shops and
timezones?

---

## 7. Reservations

**Owns** — table bookings and porchetta pre-orders: availability, agenda and
calendar views, reminders, auto-close of stale bookings.

| | |
|---|---|
| **Tables** | `reservations` |
| **Core** | `lib/reservations.ts`, `lib/agenda-range.ts`, `lib/calendar.ts`, `lib/validation/reservation.ts` |
| **Admin** | `lib/admin/reservation-actions.ts` |
| **Surfaces** | `POST /api/prenotazioni`, `/prenotazioni`, `/admin/reservations`, `/admin/reservations/agenda`, `/admin/reservations/calendar`, `/admin/reservations/new`, `/admin/reservations/[id]` |
| **Components** | `components/ReservationForm.tsx`, `components/admin/ReservationForm.tsx` |
| **Tests** | `reservations-admin.test.ts`, `calendar.test.ts` |

**Audit questions** — Is double-booking prevented? Do closures and hours gate
availability? Is the reminder cadence idempotent?

---

## 8. Locations, Hours & Closures

**Owns** — multi-shop: each sede's identity, address, weekly opening hours,
holidays, ad-hoc closures, and the per-operator scope that keeps staff to their
own shop.

| | |
|---|---|
| **Tables** | `shops`, `shop_closures` |
| **Core** | `lib/hours.ts` (526 lines), `lib/closures.ts`, `lib/holidays.ts`, `lib/site.ts`, `lib/time.ts` (Rome timezone) |
| **Admin** | `lib/admin/scope.ts`, `/admin/shops/*`, `/admin/chiusure` |
| **Surfaces** | `/sedi`, `/sedi/[slug]`, `components/ShopLocator.tsx`, `components/admin/HoursEditor.tsx`, `ClosureCard.tsx`, `ClosureForm.tsx`, `ClosureHolidays.tsx` |
| **Tests** | `hours.test.ts`, `closures.test.ts`, `holidays.test.ts`, `shop-scope.test.ts`, `shops-admin.test.ts` |

**Audit questions** — Is shop scope enforced on *every* admin query, not just
the list pages? Does DST/Rome time handling hold at boundaries?

---

# ③ I CLIENTI — the people

## 9. Identity & Authentication

**Owns** — who you are and how you prove it: password hashing, sessions,
email verification, password reset, order claiming, TOTP 2FA, recovery codes,
rate limiting, staff roles.

| | |
|---|---|
| **Tables** | `users`, `sessions`, `auth_tokens`, `rate_limits` |
| **Core** | `lib/auth/service.ts`, `session.ts`, `password.ts`, `tokens.ts`, `totp.ts`, `recovery-codes.ts`, `claim.ts`, `enrolment.ts`, `lib/rate-limit.ts`, `lib/validation/auth.ts` |
| **Surfaces** | `/api/auth/*` (login, logout, me, register, password/request, password/reset, email/verify, email/resend, claim-order), `/admin/login`, `/password/recupera`, `/password/reimposta` |
| **Components** | `components/account/AuthForms.tsx`, `PasswordForms.tsx`, `components/admin/AdminLoginForm.tsx`, `RecoveryCodes.tsx` |
| **Tests** | `password.test.ts`, `totp.test.ts`, `auth-recovery.test.ts` |

**Audit questions** — Session fixation/rotation? Token single-use and expiry?
Is the login rate limit per-identity *and* per-IP? Is 2FA enforceable for
admins?

---

## 10. Customer Accounts

**Owns** — the customer's own view: profile, addresses, order history,
preferences, GDPR data export and erasure.

| | |
|---|---|
| **Tables** | `users`, `addresses` |
| **Core** | `lib/account/actions.ts`, `lib/addresses.ts`, `lib/gdpr.ts` |
| **Admin** | `lib/admin/user-actions.ts`, `GET /api/admin/gdpr/[userId]` |
| **Surfaces** | `/account`, `/account/impostazioni`, `/account/ordini/[number]`, `GET /api/account/export`, `/admin/users`, `/admin/users/new` |
| **Components** | `components/account/AccountDashboard.tsx`, `AccountForm.tsx`, `AccountSettings.tsx`, `StatusChip.tsx`, `components/site/AccountBadge.tsx`, `components/store/ClaimOrderOffer.tsx` |
| **Tests** | `account-services.test.ts` |

**Audit questions** — Does the export cover every table holding personal data?
Is erasure real or soft? Can a customer read another's order by number?

---

## 11. Loyalty & Rewards

**Owns** — points earning and spending: loyalty accounts, the transaction
ledger, the reward catalogue, redemptions, the QR loyalty card, in-store
scanning at the counter, points expiry.

| | |
|---|---|
| **Tables** | `loyalty_accounts`, `loyalty_transactions`, `rewards`, `redemptions` |
| **Core** | `lib/loyalty.ts`, `lib/loyalty-rules.ts` |
| **Admin** | `lib/admin/loyalty-actions.ts` |
| **Surfaces** | `POST /api/loyalty/redeem`, `/api/admin/loyalty/card`, `/admin/loyalty`, `/admin/loyalty/scan`, `/admin/loyalty/[id]`, `/admin/rewards/*` |
| **Components** | `components/LoyaltyCard.tsx`, `components/admin/InStoreLoyalty.tsx`, `ScanForm.tsx`, `NewCardForm.tsx`, `RedemptionStatusForm.tsx` |
| **Tests** | `loyalty-refund.test.ts`, `rewards-availability.test.ts` |

**Audit questions** — Is the points ledger the only source of balance? Do
refunds claw back points? Can a redemption be double-spent? Is the QR card
forgeable?

---

# ④ LA VOCE — how the shop speaks

## 12. Transactional Mail & Outbox

**Owns** — every one-to-one email: order confirmations, status changes,
reservation notices, auth emails, contact-form relay — plus the durable outbox
that records what was sent and what failed.

| | |
|---|---|
| **Tables** | `email_outbox` |
| **Core** | `lib/mail/mailer.ts` (SMTP via nodemailer), `lib/mail/templates.ts` (1.2k lines) |
| **Admin** | `lib/admin/outbox-actions.ts`, `/admin/outbox` |
| **Surfaces** | `POST /api/contatti`, `scripts/mail-check.ts` |
| **Components** | `components/site/ContactForm.tsx` |
| **Tests** | `outbox.test.ts`, `mail-text.test.ts` |

**Audit questions** — Is send failure surfaced rather than swallowed? Is retry
bounded? Do templates render correctly in plain text? Is SMTP configured and
verified in production?

---

## 13. Newsletter, Campaigns & Segments

**Owns** — one-to-many marketing: double opt-in subscription, confirmation and
unsubscribe, campaign composition and sending, customer segmentation rules.

| | |
|---|---|
| **Tables** | `newsletter_subscribers`, `newsletter_campaigns`, `customer_segments` |
| **Core** | `lib/newsletter.ts`, `lib/newsletter-campaigns.ts`, `lib/segments.ts` |
| **Admin** | `lib/admin/campaign-actions.ts`, `/admin/newsletter` |
| **Surfaces** | `POST /api/newsletter`, `/api/newsletter/confirm`, `/api/newsletter/unsubscribe`, `/newsletter` |
| **Components** | `components/NewsletterForm.tsx`, `components/admin/CampaignComposer.tsx` |
| **Tests** | — *(no dedicated suite; gap)* |

**Audit questions** — Is opt-in genuinely double? Is unsubscribe one-click and
honoured everywhere? Are segment rules evaluated safely (no injection via rule
JSON)? Is send throttled?

---

## 14. Automation & Scheduled Jobs

**Owns** — everything that happens without anyone clicking: porchetta and table
reminders, reservation auto-close, points expiry, pickup auto-fulfil, abandoned
order sweep, maintenance, the owner's digest, Instagram token refresh — plus
the secured cron entry point and its run-status reporting.

| | |
|---|---|
| **Tables** | run records in `settings` |
| **Core** | `lib/automation.ts` (635 lines, 9 jobs) |
| **Admin** | `lib/admin/automation-actions.ts`, status shown in `/admin/settings` |
| **Surfaces** | `GET`/`POST` `/api/cron?job=…` (Bearer `CRON_SECRET`, constant-time compare), `scripts/scheduler.sh` |
| **Tests** | `inventory-automation.test.ts` (partial) |

**Audit questions** — Is every job idempotent under the frequent `job=all`
sweep? Does a failing job block the rest? Is there alerting when the scheduler
stops firing? Is the digest self-limiting?

---

# ⑤ LA VETRINA — the shop window

## 15. CMS & Editorial

**Owns** — the copy the owner can change without a deploy: site content blocks,
the blog/news with its article grammar and templates, per-shop editorial text.

| | |
|---|---|
| **Tables** | `site_content`, `blog_posts` |
| **Core** | `lib/site-content.ts`, `lib/site-content-parse.ts`, `lib/blog-article.ts`, `lib/db/demo-blog.ts` |
| **Admin** | `lib/admin/content-actions.ts`, `/admin/contenuti`, `/admin/blog/*` |
| **Surfaces** | `/blog`, `/blog/[slug]` |
| **Components** | `components/admin/ContentEditor.tsx`, `components/BlogCard.tsx`, `components/site/blog/*`, `RichText.tsx`, `inline-markup.tsx` |
| **Tests** | `site-content.test.ts`, `blog-article.test.ts` |

**Audit questions** — How much of the storefront is actually editable vs.
hardcoded? Is the rich-text renderer XSS-safe? Are drafts/scheduling real?

---

## 16. Storefront Experience

**Owns** — the public site as a designed artefact: layout and navigation, the
"Carta e Inchiostro" design language, motion and scroll behaviour, SEO and
structured data, cookie consent, the Instagram feed, legal pages.

| | |
|---|---|
| **Core** | `lib/seo.ts`, `lib/intro.ts`, `lib/instagram/*`, `lib/use-media-query.ts`, `lib/use-reduced-motion-after-mount.ts`, `lib/use-scroll-lock.ts`, `lib/format.ts` |
| **Surfaces** | `/`, `/porchetta`, `/la-nostra-storia`, `/contatti`, `/privacy`, `/cookie`, `/termini` |
| **Components** | `components/site/*` (22 + subfolders), `SiteHeader.tsx`, `SiteFooter.tsx`, `PageHero.tsx`, `ParallaxMedia.tsx`, `RevealLines.tsx`, `ScrollProgress.tsx`, `SealStamp.tsx`, `Magnetic.tsx`, `components/CookieConsent.tsx`, `IntroLoader.tsx`, `InstagramFeed.tsx`, `JsonLd.tsx`, `SmoothScroll.tsx` |
| **Design** | `DESIGN.md` |
| **Tests** | `instagram.test.ts`, `phone-type.test.ts`, `theme-tokens.test.ts`, e2e `smoke.spec.ts`, `forms.spec.ts` |

**Audit questions** — Accessibility (contrast, focus, reduced motion, keyboard)?
Core Web Vitals with the motion stack? Does consent actually gate anything?
Mobile type floor honoured everywhere?

---

## 17. Media & Assets

**Owns** — images and video: upload, storage (local `data/uploads` in dev,
Vercel Blob in prod), serving, attachment to products/shops/posts/rewards,
orphan cleanup, placeholders and credits.

| | |
|---|---|
| **Core** | `lib/media.ts` |
| **Surfaces** | `GET /api/media/[file]`, `public/images/*`, `public/video/*` |
| **Components** | `components/ImagePlaceholder.tsx`, `components/site/PhotoCredit.tsx` |
| **Scripts** | `scripts/fix-image-labels.ts` |
| **Tests** | — *(no dedicated suite; gap)* |

**Audit questions** — Is upload type/size validated and the filename
non-traversable? Are orphans reclaimed? Is the local/blob split correct in both
directions?

---

# ⑥ IL REGISTRO — the ledger and the lens

## 18. Fiscal & Accounting

**Owns** — the legally-serious part: VAT split and rates, the VAT report,
fattura elettronica XML, fiscal IDs (P.IVA / codice fiscale), fiscal periods,
the invoice registry, till closing (chiusura di cassa).

| | |
|---|---|
| **Core** | `lib/fiscal.ts`, `lib/fattura.ts`, `lib/fiscal-id.ts`, `lib/fiscal-period.ts` |
| **Surfaces** | `GET /api/admin/invoice/[orderId]/xml`, `/admin/reports/iva`, `/admin/reports/fatture`, `/admin/reports/cassa` |
| **Tests** | `fiscal.test.ts`, `fiscal-id.test.ts`, `fiscal-period.test.ts`, `vat-report.test.ts`, `security-fiscal.test.ts` |

**Audit questions** — Is VAT derived from gross exactly once and rounded
consistently? Does the XML validate against the SDI schema? Is a closed fiscal
period immutable? *(History: a VAT over-declaration was the single critical
finding of the 2026-07 gap analysis — verify it stayed fixed.)*

---

## 19. Analytics & Reporting

**Owns** — the numbers the owner steers by: cookieless first-party page views,
sales analysis by product/counter/period, margin, the analytics dashboard, CSV
exports.

| | |
|---|---|
| **Tables** | `page_views` |
| **Core** | `lib/analytics.ts`, `lib/sales-analysis.ts`, `lib/csv.ts` |
| **Surfaces** | `POST /api/analytics`, `GET /api/admin/export/[entity]`, `/admin/analytics`, `/admin/reports/vendite`, `/admin` (dashboard) |
| **Components** | `components/Analytics.tsx` |
| **Tests** | `analytics.test.ts`, `sales-analysis.test.ts`, `csv.test.ts`, `csv-export.test.ts`, e2e `admin-reports.spec.ts` |

**Audit questions** — Are aggregates correct across shops and refunds? Is page
view recording genuinely PII-free? Do exports respect shop scope? Does the
dashboard scale past a few thousand orders?

---

## 20. Security, Audit & Compliance

**Owns** — the cross-cutting guarantees: origin/CSRF checking, the audit log,
role and shop authorisation, the security console, session management for
staff, GDPR posture, secrets handling.

| | |
|---|---|
| **Tables** | `audit_log`, `sessions`, `rate_limits` |
| **Core** | `lib/security/origin.ts`, `lib/audit.ts`, `lib/admin/scope.ts`, `lib/gdpr.ts` |
| **Admin** | `lib/admin/security-actions.ts`, `/admin/security`, `/admin/audit` |
| **Config** | `next.config.ts` (headers/CSP), `Caddyfile` |
| **Tests** | `origin.test.ts`, `security-fiscal.test.ts`, `production-readiness.test.ts` |

**Audit questions** — Is every server action origin-checked? Is the audit log
complete for destructive actions and tamper-evident? Are headers/CSP actually
set in production? Any secrets reachable from the client bundle?

---

## 21. Admin Gestionale Shell

**Owns** — the back-office as a *tool*: navigation and grouping, data tables,
filters and saved views, bulk actions, the ⌘K command palette, form state and
unsaved guards, toasts, confirm dialogs, breadcrumbs, theming, search (FTS),
pagination, printing.

| | |
|---|---|
| **Tables** | `saved_views`, `settings` |
| **Core** | `lib/admin/queries.ts` (2.7k lines), `lib/admin/actions.ts`, `filters.ts`, `search.ts`, `view-actions.ts`, `action-state.ts`, `theme.ts`, `theme-actions.ts`, `lib/validation/admin.ts` |
| **Surfaces** | `app/admin/(dash)/layout.tsx`, `/admin`, `/admin/settings`, `GET /api/admin/search`, `/api/admin/customers/search` |
| **Components** | `components/admin/*` (35 files): `AdminNav.tsx`, `DataTable.tsx`, `FilterBar.tsx`, `SavedViews.tsx`, `CommandPalette.tsx`, `BulkBar.tsx`, `ActionForm.tsx`, `UnsavedGuard.tsx`, `ConfirmDialog.tsx`, `Toasts.tsx`, `Streamed.tsx` |
| **Tests** | `admin-filters.test.ts`, `search-fts.test.ts`, `pagination.test.ts`, `action-state.test.ts`, `validation.test.ts`, e2e `admin-forms.spec.ts`, `admin-operations.spec.ts`, `admin-category-reorder.spec.ts` |

**Audit questions** — Is `queries.ts` at 2.7k lines still coherent, or does it
need splitting per-domain? Are list pages consistently Suspense-shelled? Is
every mutating form guarded the same way?

---

# ⑦ LE FONDAMENTA — the foundations

## 22. Data Layer & Migrations

**Owns** — the schema itself, the SQLite/libSQL client and connection handling,
generated migrations, seeding (real and demo), query helpers, settings storage.

| | |
|---|---|
| **Core** | `lib/db/schema.ts` (1.4k lines, 33 tables), `lib/db/client.ts`, `lib/db/connection.ts`, `lib/db/queries.ts`, `lib/db/seed-data.ts` |
| **Migrations** | `drizzle/` — 46 SQL migrations + `meta/` |
| **Scripts** | `scripts/seed.ts`, `seed-demo.ts`, `reset-admin.ts`, `backup.sh`, `backup-container.sh` |
| **Config** | `drizzle.config.ts` |
| **Tests** | `domain-db.test.ts`, `fulfilment-db.test.ts` |

**Known gotcha** — drizzle-kit has a rebuild-migration bug in this project;
check before regenerating.

**Audit questions** — Are migrations forward-only and tested against a
production-shaped DB? Is there a restore drill, not just a backup script? Are
indexes present for the hot admin queries?

---

## 23. Quality & Testing

**Owns** — the confidence layer: 54 Vitest suites, 6 Playwright e2e suites,
the form harness and its settle signal, stubs, lint config, CI.

| | |
|---|---|
| **Core** | `vitest.config.ts`, `playwright.config.ts`, `eslint.config.mjs`, `test/global-setup.ts`, `test/stubs/`, `e2e/_helpers.ts` |
| **CI** | `.github/workflows/` |
| **Coverage gaps** | newsletter/campaigns, media, payments webhook end-to-end, automation jobs |

**Audit questions** — What is the real coverage of the money paths? Do e2e
tests run in CI on every push? Is there a flake budget?

---

## 24. Runtime, Config & Deployment

**Owns** — how it actually runs: environment variables and their validation,
Next.js config, Docker image and compose, Caddy reverse proxy, Vercel config,
health checks, the deployment runbook.

| | |
|---|---|
| **Core** | `lib/env.ts` (227 lines of validated config), `next.config.ts` |
| **Infra** | `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`, `Caddyfile`, `vercel.json`, `.dockerignore` |
| **Surfaces** | `GET /api/health` |
| **Docs** | `DEPLOYMENT.md`, `README.md` |
| **Tests** | `production-readiness.test.ts` |

**Audit questions** — Does the app refuse to boot on missing critical config,
or degrade silently? Is the health check deep enough to be useful? Are both
deploy targets (Docker + Vercel) actually current?

---

## How to read a readiness score

When each system is audited, it gets a percentage against five axes,
weighted for a platform that handles money, food safety and personal data:

| Axis | Weight | Asks |
|---|---|---|
| **Correctness** | 30% | Does it do the right thing, including at the edges? Are the invariants enforced in code, not by convention? |
| **Robustness** | 25% | Failure paths, concurrency, idempotency, recovery. What happens when the third party is down? |
| **Security & compliance** | 20% | Authz on every path, input validation, GDPR/fiscal obligations met. |
| **Observability & operability** | 15% | Can the owner see it working, and diagnose it when it isn't? Audit trail, alerting, admin surface. |
| **Test & documentation cover** | 10% | Is the behaviour pinned by tests, and written down? |

Rough bands: **90–100** state of the art · **75–89** production-solid with
known edges · **60–74** works, has real gaps · **40–59** functional prototype ·
**<40** not ready.

---

## Cross-system seams worth watching

These are the places where a bug in one system silently corrupts another —
worth checking in *every* audit, not just the owning one:

- **Orders → Stock → Loyalty → Discounts.** One order write touches four
  ledgers. Cancel, edit and refund must reverse all four, together.
- **Payments ↔ Orders.** `paymentMethod` (intent) and settlement (fact) are
  separate fields on purpose; conflating them mis-reports both the till and
  what the driver must collect.
- **Fulfilment ↔ Locations & Hours ↔ Closures.** Availability is computed from
  three systems; a closure that doesn't reach the slot generator sells a pickup
  on a shut day.
- **Automation → everything.** Nine cron jobs mutate seven systems with no user
  watching. Idempotency is the whole safety story.
- **Shop scope → every admin query.** A single unscoped query leaks one sede's
  data into another's list.
- **Mail & Outbox → Orders, Reservations, Auth, Newsletter.** Four systems
  depend on delivery; the outbox is the only place a failure becomes visible.

---

## Related documents

- [`DOCUMENTATION.md`](../DOCUMENTATION.md) — technical reference (stack, data model, API)
- [`DESIGN.md`](../DESIGN.md) — the storefront design language
- [`docs/gestionale-gap-analysis.md`](gestionale-gap-analysis.md) — 2026-07 intent-vs-reality audit
- [`docs/admin-gap-audit-2026-08.md`](admin-gap-audit-2026-08.md) — 2026-08 admin audit (30 findings, all fixed)
- [`docs/admin-gestione-audit-2026-09.md`](admin-gestione-audit-2026-09.md) — 2026-09 "can the owner run the shop from it" audit
- [`docs/production-readiness-2026-08-25.md`](production-readiness-2026-08-25.md) — launch readiness pass
- [`ROADMAP.md`](../ROADMAP.md) — planned work
