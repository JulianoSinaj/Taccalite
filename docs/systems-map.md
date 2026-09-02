# Taccalite — Systems Map

> A whole-platform decomposition into named systems, so each one can be audited
> on its own and scored for production readiness.
>
> **Status:** in progress — **14 of 24 systems audited**. The rest of the
> readiness column is deliberately empty; it gets filled one system at a time by
> a dedicated code audit. See **Programme status** below for what is outstanding
> and what has been recorded-but-not-built.
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
| 2 | [Inventory & Stock](audits/02-inventory-stock.md) | ① Il Banco | **84** |
| 3 | [Orders & Checkout](audits/03-orders-checkout.md) | ① Il Banco | **90** |
| 4 | Payments | ① Il Banco | — |
| 5 | [Discounts & Promotions](audits/05-discounts-promotions.md) | ① Il Banco | **88** |
| 6 | [Fulfilment & Logistics](audits/06-fulfilment-logistics.md) | ② La Consegna | **88** |
| 7 | [Reservations](audits/07-reservations.md) | ② La Consegna | **88** |
| 8 | Locations, Hours & Closures | ② La Consegna | — |
| 9 | [Identity & Authentication](audits/09-identity-authentication.md) | ③ I Clienti | **89** |
| 10 | [Customer Accounts](audits/10-customer-accounts.md) | ③ I Clienti | **87** |
| 11 | [Loyalty & Rewards](audits/11-loyalty-rewards.md) | ③ I Clienti | **89** |
| 12 | [Transactional Mail & Outbox](audits/12-transactional-mail-outbox.md) | ④ La Voce | **89** |
| 13 | Newsletter, Campaigns & Segments | ④ La Voce | — |
| 14 | [Automation & Scheduled Jobs](audits/14-automation-scheduled-jobs.md) | ④ La Voce | **86** |
| 15 | CMS & Editorial | ⑤ La Vetrina | — |
| 16 | Storefront Experience | ⑤ La Vetrina | — |
| 17 | Media & Assets | ⑤ La Vetrina | — |
| 18 | [Fiscal & Accounting](audits/18-fiscal-accounting.md) | ⑥ Il Registro | **90** |
| 19 | Analytics & Reporting | ⑥ Il Registro | — |
| 20 | [Security, Audit & Compliance](audits/20-security-audit-compliance.md) | ⑥ Il Registro | **88** |
| 21 | Admin Gestionale Shell | ⑥ Il Registro | — |
| 22 | [Data Layer & Migrations](audits/22-data-layer-migrations.md) | ⑦ Le Fondamenta | **85** |
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

**Readiness: 84/100** — audited 2026-09-02 at 69, remediated the same day; see
[`docs/audits/02-inventory-stock.md`](audits/02-inventory-stock.md). The ledger
itself is strong (atomic, records the delta *actually* applied, floors at zero)
and every lot action is shop-scoped. Fixed: FEFO no longer drains expired lots
off the HACCP report, lot writes and their movements are one transaction, and a
product cannot become made-to-order while lots still hold units. **Recorded but
not built:** lot→order traceability (the recall question) and ledger-vs-on-hand
reconciliation — see that document's "Not done here".

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

**Readiness: 90/100** — audited 2026-09-02 at 80, remediated the same day; see
[`docs/audits/03-orders-checkout.md`](audits/03-orders-checkout.md). The most
mature system in the codebase: the status machine refuses by name every
transition that would move goods without moving money, idempotency is *claimed*
rather than assumed at four separate points, and pricing is server-authoritative
throughout. Fixed: a basket naming one product twice bypassed the oversell guard
entirely, a refunded order could be settled again by a redelivered webhook, and
`/traccia` was the only public entry point in the app with no rate limit —
leaving a customer's address one million unthrottled guesses away.

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

**Readiness: 88/100** — audited 2026-09-02 at 84, remediated the same day; see
[`docs/audits/05-discounts-promotions.md`](audits/05-discounts-promotions.md).
The cap increment is a compare-and-set that cannot be raced, release is anchored
to the order rather than blind, and the coupon is counted at payment so an
abandoned basket cannot burn one. Fixed: a code honoured past its cap — the
right call, when somebody has already paid — left no trace at all, so a
promotion capped at fifty could be honoured sixty times invisibly.

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

**Readiness: 88/100** — audited 2026-09-02 at 81, remediated the same day; see
[`docs/audits/06-fulfilment-logistics.md`](audits/06-fulfilment-logistics.md).
Slot options test the whole window against closures, the cut-off runs from the
window opening, an unmatched CAP always errors, and a card checkout holds its
place for only an hour. Fixed: a capped window counted its bookings outside the
transaction that wrote the order, so two customers could take the same last
place and the shop found out when both turned up.

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

**Readiness: 88/100** — audited 2026-09-02 at 82, remediated the same day; see
[`docs/audits/07-reservations.md`](audits/07-reservations.md). Every gate is
enforced at the write rather than only in the form — master switches, ISO dates,
past dates, opening hours, closures with their time, the porchetta cut-off — and
each comment records the version that was form-only. Fixed: the porchetta kilos
were summed inside the insert transaction but the **seats** check sat outside it,
so Saturday dinner could be double-booked by exactly the mechanism the kilo cap
was written to prevent.

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

**Readiness: 89/100** — audited 2026-09-02 at 83, remediated the same day; see
[`docs/audits/09-identity-authentication.md`](audits/09-identity-authentication.md).
Emailed tokens are hashed at rest, single-use via an atomic claim, and supersede
each other on resend; rate limiting is DB-backed so it survives a restart;
password reset is not an enumeration oracle. Fixed: the login lockout was a
ratchet rather than a budget — once locked, an account got one attempt per
fifteen minutes forever, and anyone who knew the address could hold it shut with
four requests an hour.

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

**Readiness: 87/100** — audited 2026-09-02 at 74, remediated the same day; see
[`docs/audits/10-customer-accounts.md`](audits/10-customer-accounts.md). Orders
are retained for fiscal obligation with the reason written down, the loyalty card
is retired on erasure, sessions are destroyed. Fixed three findings in the same
two functions: the export shipped the **TOTP secret and recovery codes** while
omitting the saved address book, and erasure left the address book, the secret
and live reset links behind.

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

**Readiness: 89/100** — audited 2026-09-02 at 85, remediated the same day; see
[`docs/audits/11-loyalty-rewards.md`](audits/11-loyalty-rewards.md). The points
ledger records the *applied* delta in one transaction, refunds claw back
proportionally and cumulatively, reward stock is claimed with a compare-and-set,
and the guessable card number is admin-gated. Fixed: the per-customer cap was
counted outside the write, so two simultaneous claims could both take a "uno per
cliente" reward.

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

**Readiness: 89/100** — audited 2026-09-02 at 83, remediated the same day; see
[`docs/audits/12-transactional-mail-outbox.md`](audits/12-transactional-mail-outbox.md).
Outbox-first by design so no message is ever lost; drain passes claim a row
before attempting it; retries are capped; the SMTP timeouts exist because the
settings page once took two minutes to not load. Fixed: only `sent` rows were
pruned, so a failed message kept the customer's address and basket forever — and
on an install with no SMTP, where every message stays queued, the outbox grew
without bound.

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

**Readiness: 86/100** — audited 2026-09-02 at 76, remediated the same day; see
[`docs/audits/14-automation-scheduled-jobs.md`](audits/14-automation-scheduled-jobs.md).
The endpoint compares its secret with `timingSafeEqual` and accepts it only from
the header, every job is idempotent under the frequent `job=all` sweep, and a
failed send leaves its stamp unset so it retries. Fixed: a failing job wrote its
error to a settings panel nobody opens, so it kept failing in silence — the
daily owner digest now carries any job that failed or has gone quiet.

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

**Readiness: 90/100** — audited 2026-09-02, **no code defects found**; see
[`docs/audits/18-fiscal-accounting.md`](audits/18-fiscal-accounting.md). The
2026-07 VAT over-declaration is properly closed, and not by a patch: `splitGross`
is exact, the cart discount is apportioned pro-rata across rate buckets by
largest-remainder, and a refund is booked as a credit note in the period it
happened. The fiscal dates are immutable once written. Gaps are business
decisions: the XML is produced but not transmitted to SdI, and there is no
concept of a closed period.

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

**Readiness: 88/100** — audited 2026-09-02 at 81, remediated the same day; see
[`docs/audits/20-security-audit-compliance.md`](audits/20-security-audit-compliance.md).
CSP and the security headers travel with the app rather than one operator's
proxy, `isSameOrigin` fronts every hand-rolled POST with three correctly-reasoned
exemptions, and the audit log is insert-only across 50+ action types. Fixed: the
second factor could be turned off — and fresh recovery codes minted — with
nothing but a live session, which is the one thing 2FA exists to survive.

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

**Readiness: 85/100** — audited 2026-09-02 at 72, remediated the same day; see
[`docs/audits/22-data-layer-migrations.md`](audits/22-data-layer-migrations.md).
Audited out of turn because its one finding undermined every other system's
concurrency guard: `busy_timeout` is per-connection and the libSQL driver opens
a **fresh** connection for each transaction, so every transaction after the
first ran with no timeout — contention threw a raw `SQLITE_BUSY` out of
checkouts, stock movements and points debits, and lost writes. `wrapDrizzle` now
retries a contended transaction with jittered backoff.

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

## Programme status

**Audited: 14 of 24.** Systems 1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 14, 18, 20 and 22.
All remediated in the same pass except 18, which had no defects.

**A shape worth naming.** Three systems held a capacity rule by reading a count
*outside* the transaction that wrote the row — loyalty per-customer caps, pickup
windows and table seating. All three are now decided where the write happens.
When auditing what remains, a `count()` followed later by an `insert()` is the
thing to look for.
Everything else in the index is unexamined — an empty cell means "not looked
at", never "fine".

### Scope questions outstanding

- **④ Payments (system 4)** — the owner has indicated payments will most likely
  **not** be taken through this platform, which would change what "ready" means
  for that system entirely: the Stripe checkout, its webhook and the settlement
  fields would become dead weight rather than the money path. *Not yet
  confirmed, and not yet decided what replaces it* (counter-only cash/POS? an
  external terminal? a payment link from elsewhere?). **Do not audit or score
  system 4 until this is settled** — scoring it against the wrong intent is
  worse than leaving it blank. The answer also reaches systems 3, 18 and 19,
  which read the settlement fields — system 3's audit records exactly which of
  its guards survive the decision and which become dead weight.

### Recorded but not built

Work identified during an audit, designed, and deliberately deferred. These are
the reason the audited systems are not scored higher, and they are the backlog —
not oversights.

| System | Item | Why deferred |
|---|---|---|
| 2 | **Lot → order traceability.** `consumeBatchesFefo` computes which lots went out and both callers discard it, so a recall cannot name the affected customers. Design: `order_id` + `lots` on `stock_movements`. | Schema change; feature work, not a defect |
| 2 | **Ledger ↔ on-hand reconciliation.** Nothing surfaces a divergence, and legacy rows have no opening movement so the sum is expected to differ. Design: backfill opening balances, then a divergence report. | Migration + new report surface |
| 2 | A half-applied `applyOrderStock` is now *logged* but still not *recoverable*. | Depends on the reconciliation report above |
| 3 | **Loyalty accrues on the pre-discount subtotal**, so a 50 %-off coupon still earns full points. A business decision to make deliberately, not a defect. | Needs the owner's call |
| 3 | `order_items.product_id` has no FK; the reservation lookup on `/traccia` is single-factor (reference only, now throttled). | Low value against the risk |
| 1 | TOCTOU window on derived slugs; allergens absent from the CSV round-trip; `unit` is free text. | Low value against the risk |
| 23 | **The e2e suite is not repeatable.** Fixtures accumulate across runs until a capped resource refuses; the suite cannot cold-start (seed runs before migrations); two tests are load-sensitive. All 52 pass on a correctly seeded DB. | Its own system's audit |

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
