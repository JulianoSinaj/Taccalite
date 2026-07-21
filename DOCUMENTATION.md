# Taccalite — Technical Documentation

_Last updated: 2026-07-21. Reflects the current working tree through the **E–I hardening +
feature phases** — the full platform build (Phases 0–7), the committed admin-hardening pass
(Phase A security/correctness, B infra, C reliability, D1 media uploads, D2 reservation
agenda, D3 order history + reward-unlocked emails, D4a cookieless analytics), and now the
E–I work: **E** residual security & correctness, **F** deployability, **G** QA harness & CI,
**H** UX robustness & a11y, and the four **I** feature value-adds (porchetta capacity/
waitlist/ready-emails, customer tracking + owner digest, stock decrement + low-stock alerts,
loyalty QR + in-shop staff points). All **verified**: `tsc` + `build` clean, ESLint 0
errors, **35 Vitest + 8 Playwright** green, and a full production `docker compose` simulation
of every feature. Describes the system as it now
exists in the working tree. Companion docs: [`README.md`](./README.md),
[`ROADMAP.md`](./ROADMAP.md) (build log), [`DEPLOYMENT.md`](./DEPLOYMENT.md),
[`DESIGN.md`](./DESIGN.md)._

---

## 1. Overview

Taccalite is the full digital platform of **Norcineria Taccalite**, a family-run artisanal
deli/butcher in Ancona (Marche, Italy) since 1946, with two shops:

| Shop slug | Name | Specialty | Location |
| --------- | ---- | --------- | -------- |
| `centro` | Taccalite Centro | Formaggi (cheese) | Piazza Kennedy, 10 — Ancona |
| `carni` | Taccalite Mercato del Piano | Carni & Salumi | Mercato Coperto del Piano |

It began as a static marketing site and is now a **self-hostable platform** covering the
business's online operations. Everything is in **Italian**.

### What the platform does

| Capability | Status |
| ---------- | ------ |
| Cinematic marketing site (3D intro, motion) | ✅ |
| Content managed in a database, editable from an admin CMS | ✅ |
| Reservations — table, Saturday porchetta, special order — persisted + emailed | ✅ |
| Customer reservation/order tracking page (`/traccia`, unguessable reference) | ✅ |
| Porchetta weekly capacity limit + automatic waitlist + ready-emails | ✅ |
| Order stock decrement + owner low-stock alerts | ✅ |
| Loyalty QR card + staff in-shop points accrual (`/admin/loyalty/scan`) | ✅ |
| Owner daily digest email (reservations, orders, low stock) | ✅ |
| Customer accounts (email+password) with real loyalty points, ledger, redemptions | ✅ |
| Newsletter with double opt-in + admin broadcasts | ✅ |
| Online store: cart, checkout, Stripe (test) or simulate, order emails, loyalty accrual | ✅ |
| Admin dashboard: reservations, orders (+ per-order detail), products, blog, shops, loyalty, rewards, subscribers, email outbox, users, settings | ✅ |
| Admin user management (roles, password reset) — **admin-only** | ✅ |
| Admin-uploaded product/shop/reward/blog images (media pipeline) | ✅ |
| First-party cookieless page-view analytics (Admin → Analytics) | ✅ |
| CSV export (orders, customers, reservations, subscribers) | ✅ |
| Transactional email via configurable SMTP + dev outbox fallback | ✅ |
| Automation: Saturday porchetta reminders (cron), broadcasts | ✅ |
| Automated scheduler sidecar (cron jobs + nightly backups, no host crontab) | ✅ |
| Automated test suite (35 Vitest + 8 Playwright) + CI | ✅ |
| SEO (sitemap, robots, JSON-LD, OG), GDPR (privacy/cookie + consent) | ✅ |
| Docker + Caddy deployment for Hetzner | ✅ |

---

## 2. Tech stack

| Area | Choice |
| ---- | ------ |
| Framework | Next.js **16.2.10** (App Router, Turbopack, RSC, Server Actions) |
| Runtime | React **19.2.4** · Node.js 20 |
| Language | TypeScript 5 (strict), path alias `@/*` → repo root |
| Styling | Tailwind CSS **v4** (`@theme inline`), `tw-animate-css`, shadcn/ui (Radix) |
| Motion / 3D | `motion` (Framer Motion v12), `three` + `@react-three/fiber` + `drei`, `lenis` |
| Database | **SQLite** (`better-sqlite3`, WAL) via **Drizzle ORM** + `drizzle-kit` |
| Auth | Custom — scrypt password hashing + signed HTTP-only cookie sessions |
| Email | **Nodemailer** (SMTP), provider-agnostic, with DB outbox fallback |
| Payments | **Stripe** Checkout (test mode), env-gated with simulate fallback |
| Validation | **Zod** on every public API boundary |
| Icons | `lucide-react` · Fonts: Playfair Display + Open Sans (`next/font`) |

`next.config.ts`: Turbopack root, Unsplash remote images, `images.qualities [75,82,90]`,
`serverExternalPackages: ["better-sqlite3"]`, `output: "standalone"` +
`outputFileTracingIncludes` for the native `better-sqlite3` binary (lean runtime image).

Build: **clean** (`output: "standalone"`). `tsc`: clean. Lint: **0 errors** (advisory
warnings only). Automated suite: **35 Vitest + 8 Playwright** green (see §9).

---

## 3. Architecture

```
app/
  layout.tsx                 Root: <html>/<body>, fonts, global metadata (no chrome)
  (site)/                    PUBLIC marketing + store (route group)
    layout.tsx               CartProvider + IntroLoader + SmoothScroll + Header + Footer + CookieConsent + CartBar
    page.tsx  negozi/  negozi/[slug]/  porchetta/  negozio/  blog/  blog/[slug]/
    prenotazioni/  account/  checkout/  checkout/success/  newsletter/  privacy/  cookie/
    traccia/                 PUBLIC order/reservation tracking (?ref=<reference>)
    error.tsx  loading.tsx   (site) error + loading boundaries
  admin/
    login/                   Public admin login
    (dash)/                  ROLE-GATED admin (own layout: sidebar, no marketing chrome)
      page.tsx (dashboard) + reservations/ reservations/agenda/ orders/ orders/[id]
      products/[id] blog/[id] shops/[id] loyalty/ loyalty/scan/ rewards/ rewards/[id]
      newsletter/ outbox/ analytics/ users/ settings/
      error.tsx  loading.tsx  admin error + loading boundaries
  not-found.tsx  global-error.tsx   App-wide 404 + global error boundary
    api/admin/export/[entity]/  CSV export (orders|customers|reservations|subscribers)
  api/                       Route handlers (see §5)
  sitemap.ts  robots.ts
lib/
  db/       schema.ts (16 tables) · client.ts (singleton + gated auto-migrate) · queries.ts (read) · admin/*
  admin/    queries.ts (admin reads, paginated) · actions.ts · order-actions.ts · user-actions.ts · action-state.ts (runAction/ActionState)
  auth/     password.ts (scrypt 2^16 + rehash) · session.ts (cookies, sliding idle timeout, requireUser/requireAdmin/requireRole) · service.ts (register/login)
  security/ origin.ts (isSameOrigin — CSRF/Origin guard for JSON routes)
  mail/     mailer.ts (nodemailer + outbox) · templates.ts (branded HTML emails)
  validation/  reservation.ts · auth.ts · order.ts · admin.ts (Zod + parseForm)
  payments/ stripe.ts   loyalty.ts  orders.ts  reservations.ts  newsletter.ts  automation.ts
  csv.ts (CSV build + formula-injection escape)  rate-limit.ts  env.ts  site.ts  seo.ts  format.ts  data.ts (seed source) utils.ts
components/  marketing + admin/* (incl. ActionForm) + store/* + account/* (see §6)
scripts/  seed.ts (idempotent DB seed) · scheduler.sh (cron + backup sidecar) · backup-container.sh
test/                        Vitest unit + DB-integration specs (35 tests)
e2e/                         Playwright end-to-end specs (8 tests)
drizzle/                     Generated SQL migrations 0000–0007 (applied at runtime)
```

- **Two chrome contexts** via route groups: `(site)` (marketing/store) and `admin/(dash)`
  (dashboard). The root layout only provides `<html>`/fonts/metadata.
- **Rendering:** content/admin pages are `dynamic = "force-dynamic"` and read the DB per
  request, so admin edits appear immediately. Static: `/porchetta`, `/privacy`, `/cookie`,
  `/sitemap.xml`, `/robots.txt`.
- **Mutations:** public flows POST to `/api/*` (JSON, Zod-validated). Admin uses **Server
  Actions** (`lib/admin/actions.ts`, `order-actions.ts`, `user-actions.ts`), all funnelled
  through `runAction` (`lib/admin/action-state.ts`) which returns a typed `ActionState`
  (`idle`/`success`/`error` + message) rendered by `components/admin/ActionForm.tsx`
  (`ActionForm`/`PendingButton`/`DeleteForm`, using `useActionState`/`useFormStatus`).
  Every action re-checks the role server-side via `requireAdmin`/`requireRole` — the layout
  gate and nav filtering are UI convenience only.

---

## 4. Data model (SQLite, `lib/db/schema.ts`)

Conventions: nanoid text PKs, integer unix-ms timestamps (both an app `$defaultFn` **and**
a SQL `DEFAULT (unixepoch()*1000)`), integer booleans, JSON text columns, **money as
integer cents**, real foreign keys (`foreign_keys=ON`), and SQL `CHECK` constraints
guarding every text enum and non-negative amount. 16 tables:

| Table | Purpose |
| ----- | ------- |
| `shops` | Two botteghe — info, `hours`/`highlights` (JSON), confirmation flags, and per-shop service switches `porchettaEnabled`/`storeEnabled`/`reservationsEnabled` |
| `products` | Catalogue + commerce fields (`priceCents`, `unit`, `purchasable`, `stock`, `lowStockNotifiedAt` (low-stock alert idempotency), `featured`, `active`) |
| `blog_posts` | News — `content` as JSON paragraph array, `published` |
| `users` | Customers + staff/admin. Login key is **`username`** (unique, not null); `email` is optional. `role` (customer/staff/admin), `passwordHash`, `marketingConsent`, `emailVerifiedAt` |
| `sessions` | Opaque cookie tokens → user, `expiresAt`, `lastSeenAt` (sliding idle-timeout stamp) |
| `loyalty_accounts` | Per-user `points` + unique `cardNumber` |
| `loyalty_transactions` | Points ledger (`delta`, `balanceAfter`, `reason`, `createdByUserId`) |
| `rewards` | Redeemable catalogue (`points`, image) |
| `redemptions` | Reward claims (`status`: pending/fulfilled/cancelled) |
| `reservations` | `type` (table/porchetta/order), status machine, `quantityKg`, `reference`, `adminNotes`, `remindedAt` (porchetta-reminder idempotency stamp), `waitlisted` (over-capacity porchetta), `readyAt` (porchetta ready-email idempotency stamp) |
| `newsletter_subscribers` | Double opt-in (`status`, `token`, `source`) |
| `orders` | `orderNumber`, `status`, `fulfilment`, `shippingAddress` (JSON), cents fields, `stripeSessionId` |
| `order_items` | Line items snapshot (name/price/qty at purchase) |
| `email_outbox` | Every email (audit + dev fallback), `status` queued/sent/failed, `attempts` (retry cap) |
| `settings` | Admin-editable key/value (JSON), e.g. `loyalty.pointsPerEuro`, `store.enabled` |
| `page_views` | Cookieless analytics — `path` + referrer-host + `createdAt` only, **no PII** |

**Migrations** are generated with `npm run db:generate` into `drizzle/`. Eight exist
(`0000`–`0007`): `0000` (base schema); `0001_wakeful_stranger` (re-keys `users` onto
`username`, makes `email` nullable — backfilling `username` from the existing id);
`0002_empty_chat` (a full table-rebuild that adds the `CHECK` constraints, foreign keys,
indexes, and the shop service flags); `0003` (adds `reservations.reminded_at` for
porchetta-reminder idempotency); `0004` (adds `email_outbox.attempts` DEFAULT 0 for the
outbox retry cap); `0005` (adds the `page_views` table + 2 indexes for D4a analytics);
`0006` (adds `sessions.last_seen_at` for the sliding idle timeout); and `0007` (adds
`reservations.waitlisted` + `reservations.ready_at` for porchetta capacity/waitlist/ready,
and `products.low_stock_notified_at` for the low-stock alert). The table count is unchanged
at 16 — `0006`/`0007` add **columns only**. Because `0002` rebuilds tables, auto-migrate on DB connect is now
**gated** behind `RUN_MIGRATIONS_ON_BOOT` (`lib/db/client.ts`): it defaults on in dev and
**off in production**, where migrations run once at container start via
`docker-entrypoint.sh` (never on the request path). **Seeding** (`npm run db:seed`) is
idempotent and loads the
two shops, four products (three purchasable), three posts, three rewards, default settings,
and the bootstrap admin (`ADMIN_USERNAME`/`ADMIN_PASSWORD`).

---

## 5. API routes (`app/api/*`)

All Node runtime; public POST endpoints are Zod-validated, IP rate-limited, and
honeypot-protected. Every hand-rolled **state-changing JSON route** (login, register,
logout, checkout, newsletter, loyalty redeem, prenotazioni, analytics beacon) is now also
guarded by the **CSRF/Origin check** (`lib/security/origin.ts` `isSameOrigin()`) on top of
`SameSite=Lax`. The webhook, cron, and email GET links are excluded by design (no browser
Origin).

| Route | Method | Purpose |
| ----- | ------ | ------- |
| `/api/prenotazioni` | POST | Create a reservation → owner + customer emails |
| `/api/auth/register` | POST | Create customer (+ loyalty account, welcome bonus, session) |
| `/api/auth/login` | POST | Password login → session |
| `/api/auth/logout` | POST | Destroy session |
| `/api/loyalty/redeem` | POST | Redeem a reward (auth required) |
| `/api/newsletter` | POST | Subscribe (pending) → confirmation email |
| `/api/newsletter/confirm` | GET | Double opt-in confirm (token) → `/newsletter?stato=confermato` |
| `/api/newsletter/unsubscribe` | GET | Unsubscribe (token) |
| `/api/checkout` | POST | Create order (server-priced) → Stripe session **or** simulate → success URL |
| `/api/checkout/webhook` | POST | Stripe `checkout.session.completed` → finalize (idempotent) |
| `/api/cron` | GET/POST | Scheduled jobs; `Authorization: Bearer CRON_SECRET` (timing-safe); `job=porchetta-reminders`, `maintenance` (drains + prunes the outbox, GCs sessions), `points-expiry`, `owner-digest` (once-a-day owner summary email), or `all` |
| `/api/admin/export/[entity]` | GET | **Admin-gated** CSV export — `orders` / `customers` / `reservations` / `subscribers` |
| `/api/analytics` | POST | First-party cookieless page-view beacon (records path + referrer-host; skips `/admin` + `/api` paths) |
| `/api/media/[file]` | GET | Serves admin-uploaded images from the persisted uploads dir (path-traversal guarded, immutable cache) |
| `/api/health` | GET | Unauthenticated liveness/readiness probe (pings SQLite); `200` healthy, `503` otherwise |

Reservation flows (`type`): **table** (date+time+guests), **porchetta** (Saturday date +
kg), **order** (free-text request). Statuses: pending→confirmed→completed/cancelled;
confirm/cancel emails the customer.

Two **pages** added this phase (both rendered server-side, not `/api` handlers):
- `/traccia?ref=<reference>` — public order/reservation tracking. The `reference` is an
  unguessable bearer token; nothing is listed without an exact match. Confirmation emails
  link straight to it.
- `/admin/loyalty/scan` — staff in-shop points screen (accrue points against a scanned/typed
  card number for a purchase). **Staff-allowed**; arbitrary +/- adjustment stays admin-only.

---

## 6. Key modules & components

- **Auth** (`lib/auth`): `password.ts` scrypt hash/verify — cost raised to **N=2¹⁶** (r8 p1,
  ~64 MiB) with the params stored inline in the hash; legacy paramless hashes still verify
  and are transparently **re-hashed on next login** (`needsRehash` + upgrade in `loginUser`).
  A dummy-hash equalises login timing. `session.ts` create/get/destroy +
  `requireUser`/`requireAdmin`/`requireRole`, with a **sliding 7-day idle timeout**
  (`lastSeenAt`, refreshed ≤ hourly) atop the 30-day absolute cap;
  `deleteUserSessions()` **invalidates all sessions on password reset + role change**.
  `service.ts` register/login (username-keyed). **Note:** `requireAdmin()` currently
  accepts role `admin` **or** `staff`; only `requireRole("admin")` is admin-exclusive
  (user management, settings, shop create/delete).
- **Security** (`lib/security/origin.ts`): `isSameOrigin()` compares the request `Origin`/
  `Referer` host against the configured site origin; enforced on every hand-rolled
  state-changing JSON route (§5).
- **CSV** (`lib/csv.ts`): shared CSV builder that **neutralizes formula injection** — a
  leading `= + - @` (or tab/CR) in any cell is prefixed with `'` so spreadsheets never
  execute it. Used by all admin exports.
- **Loyalty** (`lib/loyalty.ts`): `getOrCreateLoyaltyAccount`, `addPoints` (ledgered),
  `addPointsForPurchase` (staff in-shop accrual by card, ledgered with the operator),
  `redeemReward`, `getLoyaltySummary`. Accrual on paid orders (`loyalty.pointsPerEuro`).
  The account loyalty card renders a **server-generated QR** of the card number (`qrcode` →
  inline SVG, never client-imported); `/admin/loyalty/scan` drives `addPointsForPurchase`.
- **Orders** (`lib/orders.ts`): `createOrder` (re-prices from DB — never trusts the
  client), `finalizeOrder` (idempotent: mark paid → emails → loyalty, and now **decrements
  product stock** clamped ≥0 for stock-tracked lines, firing a one-per-crossing owner
  **low-stock email** at `store.lowStockThreshold` (default 5) via `lowStockNotifiedAt`).
  Shipping flat €7.
- **Mail** (`lib/mail`): `mailer.sendMail` records to `email_outbox` then delivers (or
  keeps `queued` if no SMTP); `enqueueMail` records without sending; `drainOutbox` retries
  queued/failed rows (below an attempt cap) throttled, oldest-first; templates escape
  user input (`templates.ts`).
- **Automation** (`lib/automation.ts`): `runPorchettaReminders` (idempotent via
  `remindedAt`), `broadcastToSubscribers` (enqueue + throttled drain), `runPointsExpiry`
  (opt-in via `loyalty.pointsExpiryDays`), `runMaintenance` (session GC + outbox
  drain/prune), and `runOwnerDigest` — emails the owner a **once-a-day** summary (today's
  reservations, last-24h orders, low stock), idempotent per day via `digest.lastSentDate`
  (`owner-digest` cron job, also in `job=all`).
- **Reservations / porchetta** (`lib/reservations.ts`): weekly porchetta capacity via
  `porchetta.weeklyCapacityKg` (0 = unlimited) — Saturday pre-orders over the remaining
  capacity are **waitlisted** (+ waitlist email); the agenda shows kg/capacity per day.
  Owner actions `markPorchettaReady` (sends the ready-email, idempotent via `readyAt`) and
  `promoteFromWaitlist`; the reservations list shows a waitlist badge.
- **Media** (`lib/media.ts`): admin image uploads written to `<data-dir>/uploads`
  (allowlist jpg/png/webp/avif, 5MB cap, nanoid filenames), served back via
  `/api/media/[file]`.
- **Analytics** (`lib/analytics.ts`): `recordPageView` (path + referrer-host only, no PII);
  `getAnalyticsSummary` (7/30/total counts + top paths + top referrers + a 14-day series).
- **Store UI** (`components/store`): `cart.tsx` (context + localStorage), `AddToCartButton`,
  `CartBar`, `CheckoutClient`, `ClearCart`.
- **Account** (`components/account`): `AuthForms`, `AccountDashboard` (real loyalty + redeem).
- **Admin actions** (`lib/admin`): `queries.ts` (paginated/searchable reads,
  `getDashboardStats`, `countAdmins`), `actions.ts` (content + loyalty + newsletter +
  settings mutations), `order-actions.ts` (`updateOrderStatus`), `user-actions.ts`
  (`setUserRole` — blocks demoting the last admin — and `resetUserPassword`, both
  admin-only), `action-state.ts` (`runAction`/`ok`/`fail`/`ActionState`).
- **Admin** (`components/admin`): `AdminNav` (role-filtered, admin-only items hidden),
  `AdminLoginForm`, `ui.tsx` (Panel/Badge/etc.), `forms.tsx` (Product/Blog/Shop/Reward
  forms, incl. the `ImageField` upload control), `ActionForm.tsx`
  (`ActionForm`/`PendingButton`/`DeleteForm`/`Feedback`). The admin surface now spans
  analytics, the email outbox, reservations + a reservations/agenda prep view (with a
  print button + porchetta kg/capacity and mark-ready/waitlist actions), per-order detail,
  rewards CRUD, and the `/admin/loyalty/scan` staff points screen. The **settings editor is
  now typed** — per-key number/checkbox/weekday controls with Italian labels + help (unknown
  keys fall back to a raw editor), replacing the old raw-JSON textarea.
- **UX boundaries** (Phase H): `app/not-found.tsx`, `app/global-error.tsx`, and per-group
  `error.tsx` + `loading.tsx` for `(site)` and `admin/(dash)` — previously absent, so a
  failed per-request query no longer falls through to the framework default page.
- **Marketing**: unchanged cinematic components (`SplitHero`, `ScrollFilm`, 3D intro,
  `SaturdayCountdown`, `Reveal`, …) now fed by DB data.
- **SEO/legal**: `JsonLd`, `lib/seo.ts`, `CookieConsent`, `LegalLayout`, `NewsletterForm`.

---

## 7. Configuration (`.env`, see `.env.example` + `lib/env.ts`)

All optional with safe local defaults — the app runs with an empty env file.

| Group | Vars |
| ----- | ---- |
| Site | `NEXT_PUBLIC_SITE_URL` |
| DB | `DATABASE_URL` (SQLite path), `RUN_MIGRATIONS_ON_BOOT` (default off in prod — run via entrypoint) |
| Sessions | `SESSION_SECRET` (**set in prod**) |
| Proxy | `TRUST_PROXY` — whether to trust `X-Forwarded-For` for rate-limit client IP (**only enable behind a proxy that overwrites it**) |
| Email | `SMTP_HOST/PORT/SECURE/USER/PASS`, `MAIL_FROM`, `OWNER_EMAIL` |
| Payments | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Automation | `CRON_SECRET` |
| Scheduler (sidecar) | `CRON_INTERVAL_SEC` (default 900), `BACKUP_HOUR` (default 3), `RETENTION_DAYS` |
| Bootstrap admin | `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_NAME` |

Two feature flags degrade gracefully: **no SMTP → outbox mode** (emails stored, viewable
in Admin → Email); **no Stripe → simulate mode** (orders recorded + confirmed, no charge).

---

## 8. Running it

```bash
npm install
npm run db:seed     # first time (also runs on Docker start)
npm run dev         # http://localhost:3000  → admin at /admin
```

Scripts: `dev`, `build`, `start`, `lint`, `test` (Vitest), `test:e2e` (Playwright),
`db:generate`, `db:seed`, `db:studio`, and `db:compile-seed`/`db:compile-reset` (esbuild the
seed/reset to plain-node `seed.cjs`/`reset.cjs` for the standalone runtime image).
Bootstrap admin defaults: `admin` / `taccalite-admin` (change it).
Deployment: [`DEPLOYMENT.md`](./DEPLOYMENT.md) (Docker + Caddy on Hetzner).

---

## 9. Verification performed

### Automated suite (Phase G) — now the primary gate

- **Vitest** (`npm test`, **35 tests**): units (password KDF + legacy verify + rehash,
  `isSameOrigin`, CSV formula-escape, Zod reservation/auth, `formatEuro`) and DB-integration
  (order pricing, order-number generation, `finalizeOrder` idempotency + single accrual,
  loyalty add/redeem/insufficient/zero-clamp) against a temp migrated `better-sqlite3`
  singleton.
- **Playwright** (`npm run test:e2e`, **8 tests**): boots on a throwaway seeded DB and drives
  the public routes, the admin gate, `/traccia`, and the staff-screen gate.
- **CI** (`.github/workflows/ci.yml`): lint → typecheck → unit → build, plus a Playwright job
  (installs chromium).
- **Full production `docker compose` simulation**: brings up the standalone runtime image +
  scheduler sidecar and exercises every feature (cron jobs, backups, emails via outbox) end
  to end — the E–I work was signed off against it, not just against `npm run dev`.

### Manual end-to-end pass (Phase 7)

_Retained from the original build; the automated suite above now covers the regression-prone
paths._

- Build clean; `tsc` clean; ESLint 0 errors.
- All 13 public routes → 200; all `/admin/*` → 307 redirect to login when unauthenticated.
- Reservations: valid submit, validation errors, honeypot silent-accept, DB persist,
  owner+customer outbox emails, full browser submit (reference issued).
- Auth/loyalty: register (welcome bonus), login (wrong/right), redeem (insufficient +
  success with ledger), logout; newsletter subscribe→confirm→unsubscribe.
- Admin: gate/redirect, login, reservation confirm→email, product create.
- Store: cart persistence, server-authoritative pricing, order+items, order emails,
  loyalty accrual (+38 for €38), success page finalize; cron reminders; admin broadcast.

---

## 10. Known limitations / future work

_Reflects the current working tree through the E–I phases. The hardening + feature work has
now closed the large majority of the original 2026-07 audit items and the residuals found
since; the short list of what remains open is at the end._

### ✅ Resolved in the E–I phases

- **CSRF/Origin now checked on the JSON API routes** (Phase E, `lib/security/origin.ts`) —
  `isSameOrigin()` gates login/register/logout/checkout/newsletter/loyalty/prenotazioni/
  analytics; webhook + cron + email GET links excluded by design.
- **scrypt raised to OWASP-grade + sessions hardened** (Phase E) — cost N=2¹⁶ (~64 MiB) with
  inline params, legacy hashes re-hashed on login; sessions gained a sliding 7-day idle
  timeout atop the 30-day cap, and password reset / role change now invalidate all of a
  user's sessions.
- **CSV export neutralized against formula injection** (Phase E, `lib/csv.ts`) — a leading
  `= + - @` is now escaped.
- **Committed owner email removed** (Phase E) — `.env.example` + `env.ts` now use a
  placeholder.
- **`subscribeNewsletter` is race-safe** (Phase E) — `onConflictDoNothing` upsert.
- **`runPointsExpiry` N+1 removed** (Phase E) — single grouped query.
- **Remaining admin lists paginated** (Phase E) — reservations, subscribers, redemptions,
  users now use the `getOrdersPage`/pagination pattern.
- **Loading/error/not-found boundaries added** (Phase H) — `not-found.tsx`,
  `global-error.tsx`, and per-group `error.tsx`/`loading.tsx`.
- **Settings editor is now typed** (Phase H) — per-key number/checkbox/weekday controls,
  replacing the raw-JSON textarea.
- **Scheduler now ships** (Phase F) — `scripts/scheduler.sh` sidecar runs cron jobs +
  nightly backups, so a bare `docker compose up` runs jobs and backups (host crontab no
  longer required).
- **`output: "standalone"` enabled** (Phase F) — the runtime image (~123 MB) ships only the
  traced server (no full `node_modules`, no `tsx`, no C toolchain); seed/reset are compiled
  to plain-node bundles.
- **Automated test suite added** (Phase G) — 35 Vitest + 8 Playwright + CI (see §9),
  replacing the manual-only pass.

### ✅ Resolved in the earlier hardening pass (Phases A–C)

- **`TRUST_PROXY` now defaults `false`** (Phase A, `lib/env.ts`) — the rate limiter ignores
  `X-Forwarded-For` unless a trusted proxy is opted in. (Trade-off: without one, all clients
  share a single global bucket.)
- **Insecure-default guard now fails closed** (Phase A) — `enforceSecurity = !isDev`, so the
  default admin password / cron secret / non-`Secure` cookie are rejected for **any**
  non-`development` `NODE_ENV`, not only `production`.
- **Email templates now HTML-escape** all user-supplied fields (Phase A, `templates.ts`
  `esc()`); only admin-composed newsletter HTML and server-generated codes/URLs are
  intentionally raw.
- **Porchetta reminders are idempotent** (Phase A) — filtered + stamped via `remindedAt`,
  stamped only on successful send.
- **Loyalty account creation is race-safe** (Phase A) — `getOrCreateLoyaltyAccount` uses an
  `onConflictDoNothing` upsert.
- **Order numbers** are now a 6-digit suffix with a transactional retry loop
  (`MAX_ATTEMPTS=5`) on collision (Phase A).
- **`runAction` no longer leaks raw errors** (Phase A).
- **Outbox is drained + broadcasts batched** (Phase C) — `drainOutbox` retries
  `queued`/`failed` rows below an attempt cap, throttled; broadcasts enqueue + drain in
  batches of 50.
- **Infra hardening** (Phase B) — `/api/health` liveness/readiness probe + healthcheck
  (Caddy waits for `healthy`), nightly online `scripts/backup.sh`, resource (mem/cpu)
  limits, non-root (`gosu`) server user, entrypoint that fails hard (`set -e`) on a
  migration/seed error, full CSP, and a Caddy ACME email placeholder.

### Open — residuals

1. **`requireAdmin()` still allows `staff`** for content edits (by design). Privileged ops
   are correctly gated on `requireRole("admin")` — user role/password changes, settings, CSV
   export, shop create/delete, and arbitrary loyalty +/- adjustment. No staff→admin
   escalation path exists.
2. **CSP still uses `unsafe-inline`** for `script-src` and `style-src` (no nonce) — weaker
   XSS hardening than a nonce-based policy.
3. **`recordPageView` writes one row per request** — no batching/sampling; a SQLite
   write-throughput risk only at high scale.
4. **In-memory rate limiter** (`lib/rate-limit.ts`) is per-instance — fine for one VM; a
   shared store (Redis) is needed only if horizontally scaled.
5. **Media**: admin image upload exists (D1), but many catalogue images are still Unsplash
   placeholders pending real photography.
6. **Stripe** is wired for test mode; going live needs live keys + a configured webhook.
7. **Email deliverability**: Gmail SMTP is for testing; production wants a domain mailbox or a
   provider (Resend/Postmark) — an env-only swap (`lib/mail/mailer.ts` isolates it).
8. **Docker image digest pinning not done** — base images use specific version tags, not
   `@sha256` digests.
9. **Reference material** (`airtable/`, `figma/`, … `DESIGN.md` files, `.superdesign/`,
   `*-prompt.md`) are design studies, not app code, and are excluded from the Docker image.

---

## 11. Owner's guide (day-to-day operations)

Practical how-tos for the shop owner. Everything below lives in the admin dashboard at
`/admin` (log in with your admin account). All labels in the app are in Italian.

**Configuring settings** (`/admin/settings`) — the editor is now typed, so each option has a
proper number/checkbox/weekday control with an Italian label and help text:
- **Punti per euro** (`loyalty.pointsPerEuro`) — how many loyalty points €1 of spend earns.
- **Capacità porchetta a settimana** (`porchetta.weeklyCapacityKg`) — max kg of Saturday
  porchetta you can prepare per week; `0` means unlimited. Pre-orders beyond this are put on
  the waitlist automatically.
- **Soglia scorte basse** (`store.lowStockThreshold`, default 5) — when a product's stock
  drops to/below this after a sale, you get one low-stock email (it won't nag again until
  stock recovers and drops again).
- **Scadenza punti** (`loyalty.pointsExpiryDays`) — optional; if set, points expire after
  this many days of inactivity. Leave empty to never expire.

**Reservations & the porchetta agenda** (`/admin/reservations`, `/admin/reservations/agenda`):
- The reservations list shows table/porchetta/order requests; confirm or cancel each one —
  the customer is emailed automatically. Waitlisted porchetta pre-orders carry a **waitlist**
  badge.
- The **agenda** is your Saturday prep view: it shows kg ordered vs. capacity per day and has
  a print button. When a customer's porchetta is ready, click **mark ready** — they get a
  ready-email (sent once). If capacity frees up, **promote from waitlist** moves a waitlisted
  order into the confirmed list (and off the waitlist).

**Fulfilling orders** (`/admin/orders`, `/admin/orders/[id]`): open an order to see its line
items and shipping details, and advance its status. Paid orders automatically **decrement
product stock** and award loyalty points, so you don't touch points for online sales.

**Adding points in the shop** (`/admin/loyalty/scan`): for in-person purchases, open the
staff points screen, scan or type the customer's **card number** (their app shows a QR of it),
enter the purchase, and submit — points are added and recorded in the ledger against you as
the operator. Staff accounts can use this screen; only admins can make arbitrary +/-
adjustments on the main loyalty page.

**Reading the daily digest**: once a day the platform emails the owner a summary — today's
reservations, orders from the last 24 hours, and any low-stock products — so you can start the
day from your inbox. It's sent automatically by the scheduler; no action needed.

**CSV exports** (`/admin` export buttons / `/api/admin/export/[entity]`): download **orders**,
**customers**, **reservations**, or **subscribers** as CSV for accounting or mailing tools.
The files are safe to open in Excel/Numbers (formula-injection is neutralized).

---

## 12. Glossary

Norcineria = pork butcher/cured-meats shop · Porchetta = slow-roasted seasoned pork ·
Negozi/bottega = shops/shop · Negozio = the online store · Prenotazioni = reservations ·
Scheda fedeltà = loyalty card · Ciauscolo IGP = soft Marche salami · Pecorino di fossa =
pit-aged sheep cheese · Razza marchigiana = Marche cattle breed.
