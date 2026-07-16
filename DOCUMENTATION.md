# Taccalite — Technical Documentation

_Last updated: 2026-07-16, after the full platform build (Phases 0–7). Describes the
system as it now exists. Companion docs: [`README.md`](./README.md),
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
| Customer accounts (email+password) with real loyalty points, ledger, redemptions | ✅ |
| Newsletter with double opt-in + admin broadcasts | ✅ |
| Online store: cart, checkout, Stripe (test) or simulate, order emails, loyalty accrual | ✅ |
| Admin dashboard: reservations, orders, products, blog, shops, loyalty, subscribers, email outbox, settings | ✅ |
| Transactional email via configurable SMTP + dev outbox fallback | ✅ |
| Automation: Saturday porchetta reminders (cron), broadcasts | ✅ |
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
`serverExternalPackages: ["better-sqlite3"]`.

Build: **clean** (20 routes). Lint: **0 errors** (advisory warnings only).

---

## 3. Architecture

```
app/
  layout.tsx                 Root: <html>/<body>, fonts, global metadata (no chrome)
  (site)/                    PUBLIC marketing + store (route group)
    layout.tsx               CartProvider + IntroLoader + SmoothScroll + Header + Footer + CookieConsent + CartBar
    page.tsx  negozi/  negozi/[slug]/  porchetta/  negozio/  blog/  blog/[slug]/
    prenotazioni/  account/  checkout/  checkout/success/  newsletter/  privacy/  cookie/
  admin/
    login/                   Public admin login
    (dash)/                  ROLE-GATED admin (own layout: sidebar, no marketing chrome)
      page.tsx (dashboard) + reservations/ orders/ products/[id] blog/[id] shops/[id]
      loyalty/ newsletter/ outbox/ settings/
  api/                       Route handlers (see §5)
  sitemap.ts  robots.ts
lib/
  db/       schema.ts (15 tables) · client.ts (singleton + auto-migrate) · queries.ts (read) · admin/*
  auth/     password.ts (scrypt) · session.ts (cookies) · service.ts (register/login)
  mail/     mailer.ts (nodemailer + outbox) · templates.ts (branded HTML emails)
  validation/  reservation.ts · auth.ts · order.ts (Zod)
  payments/ stripe.ts        loyalty.ts  orders.ts  newsletter.ts  automation.ts
  rate-limit.ts  env.ts  site.ts  seo.ts  format.ts  data.ts (seed source) utils.ts
components/  marketing + admin/* + store/* + account/* (see §6)
scripts/seed.ts              Idempotent DB seed (content, rewards, settings, admin)
drizzle/                     Generated SQL migrations (applied at runtime)
```

- **Two chrome contexts** via route groups: `(site)` (marketing/store) and `admin/(dash)`
  (dashboard). The root layout only provides `<html>`/fonts/metadata.
- **Rendering:** content/admin pages are `dynamic = "force-dynamic"` and read the DB per
  request, so admin edits appear immediately. Static: `/porchetta`, `/privacy`, `/cookie`,
  `/sitemap.xml`, `/robots.txt`.
- **Mutations:** public flows POST to `/api/*` (JSON, Zod-validated). Admin uses **Server
  Actions** (`lib/admin/actions.ts`, `order-actions.ts`).

---

## 4. Data model (SQLite, `lib/db/schema.ts`)

Conventions: nanoid text PKs, integer unix-ms timestamps, integer booleans, JSON text
columns, **money as integer cents**. 15 tables:

| Table | Purpose |
| ----- | ------- |
| `shops` | Two botteghe — info, `hours`/`highlights` (JSON), confirmation flags |
| `products` | Catalogue + commerce fields (`priceCents`, `unit`, `purchasable`, `stock`, `featured`, `active`) |
| `blog_posts` | News — `content` as JSON paragraph array, `published` |
| `users` | Customers + staff/admin (`role`), `passwordHash`, `marketingConsent` |
| `sessions` | Opaque cookie tokens → user, `expiresAt` |
| `loyalty_accounts` | Per-user `points` + unique `cardNumber` |
| `loyalty_transactions` | Points ledger (`delta`, `balanceAfter`, `reason`, `createdByUserId`) |
| `rewards` | Redeemable catalogue (`points`, image) |
| `redemptions` | Reward claims (`status`: pending/fulfilled/cancelled) |
| `reservations` | `type` (table/porchetta/order), status machine, `quantityKg`, `reference`, `adminNotes` |
| `newsletter_subscribers` | Double opt-in (`status`, `token`, `source`) |
| `orders` | `orderNumber`, `status`, `fulfilment`, `shippingAddress` (JSON), cents fields, `stripeSessionId` |
| `order_items` | Line items snapshot (name/price/qty at purchase) |
| `email_outbox` | Every email (audit + dev fallback), `status` queued/sent/failed |
| `settings` | Admin-editable key/value (JSON), e.g. `loyalty.pointsPerEuro`, `store.enabled` |

**Migrations** are generated with `npm run db:generate` into `drizzle/` and applied
automatically on first DB connection (`lib/db/client.ts` → `migrate()`), so a fresh
checkout or deploy just works. **Seeding** (`npm run db:seed`) is idempotent and loads the
two shops, four products (three purchasable), three posts, three rewards, default settings,
and the bootstrap admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`).

---

## 5. API routes (`app/api/*`)

All Node runtime; public POST endpoints are Zod-validated, IP rate-limited, and
honeypot-protected.

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
| `/api/cron` | GET/POST | Scheduled jobs; `?secret=CRON_SECRET`; `job=porchetta-reminders` |

Reservation flows (`type`): **table** (date+time+guests), **porchetta** (Saturday date +
kg), **order** (free-text request). Statuses: pending→confirmed→completed/cancelled;
confirm/cancel emails the customer.

---

## 6. Key modules & components

- **Auth** (`lib/auth`): `password.ts` scrypt hash/verify; `session.ts`
  create/get/destroy + `requireUser`/`requireAdmin`; `service.ts` register/login.
- **Loyalty** (`lib/loyalty.ts`): `getOrCreateLoyaltyAccount`, `addPoints` (ledgered),
  `redeemReward`, `getLoyaltySummary`. Accrual on paid orders (`loyalty.pointsPerEuro`).
- **Orders** (`lib/orders.ts`): `createOrder` (re-prices from DB — never trusts the
  client), `finalizeOrder` (idempotent: mark paid → emails → loyalty). Shipping flat €7.
- **Mail** (`lib/mail`): `mailer.sendMail` records to `email_outbox`, sends if SMTP set
  else keeps queued; `templates.ts` — branded responsive HTML (reservation, status,
  welcome, newsletter confirm, order, porchetta reminder, broadcast).
- **Automation** (`lib/automation.ts`): `runPorchettaReminders`, `broadcastToSubscribers`.
- **Store UI** (`components/store`): `cart.tsx` (context + localStorage), `AddToCartButton`,
  `CartBar`, `CheckoutClient`, `ClearCart`.
- **Account** (`components/account`): `AuthForms`, `AccountDashboard` (real loyalty + redeem).
- **Admin** (`components/admin`): `AdminNav`, `AdminLoginForm`, `ui.tsx` (Panel/Badge/etc.),
  `forms.tsx` (Product/Blog/Shop forms → server actions).
- **Marketing**: unchanged cinematic components (`SplitHero`, `ScrollFilm`, 3D intro,
  `SaturdayCountdown`, `Reveal`, …) now fed by DB data.
- **SEO/legal**: `JsonLd`, `lib/seo.ts`, `CookieConsent`, `LegalLayout`, `NewsletterForm`.

---

## 7. Configuration (`.env`, see `.env.example` + `lib/env.ts`)

All optional with safe local defaults — the app runs with an empty env file.

| Group | Vars |
| ----- | ---- |
| Site | `NEXT_PUBLIC_SITE_URL` |
| DB | `DATABASE_URL` (SQLite path) |
| Sessions | `SESSION_SECRET` (**set in prod**) |
| Email | `SMTP_HOST/PORT/SECURE/USER/PASS`, `MAIL_FROM`, `OWNER_EMAIL` |
| Payments | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Automation | `CRON_SECRET` |
| Bootstrap admin | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` |

Two feature flags degrade gracefully: **no SMTP → outbox mode** (emails stored, viewable
in Admin → Email); **no Stripe → simulate mode** (orders recorded + confirmed, no charge).

---

## 8. Running it

```bash
npm install
npm run db:seed     # first time (also runs on Docker start)
npm run dev         # http://localhost:3000  → admin at /admin
```

Scripts: `dev`, `build`, `start`, `lint`, `db:generate`, `db:seed`, `db:studio`.
Bootstrap admin defaults: `admin@taccalite.local` / `taccalite-admin` (change it).
Deployment: [`DEPLOYMENT.md`](./DEPLOYMENT.md) (Docker + Caddy on Hetzner).

---

## 9. Verification performed (Phase 7)

- Build clean (20 routes); ESLint 0 errors.
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

1. **In-memory rate limiter** (`lib/rate-limit.ts`) is per-instance — fine for one VM; a
   shared store (Redis) is needed only if horizontally scaled.
2. **Porchetta reminders** have no "already sent" flag — run the cron once per cycle
   (e.g. Fridays). A `reminded_at` column would make it fully idempotent.
3. **Media uploads**: product/shop images are URLs (no file upload UI yet); many images
   are still Unsplash placeholders pending real photography.
4. **Stripe** is wired for test mode; going live needs live keys + a configured webhook.
5. **Email deliverability**: Gmail SMTP is for testing; production wants a domain mailbox
   or a provider (Resend/Postmark) — an env-only swap (`lib/mail/mailer.ts` isolates it).
6. **Reference material** (`airtable/`, `figma/`, … `DESIGN.md` files, `.superdesign/`,
   `*-prompt.md`) are design studies, not app code, and are excluded from the Docker image.
7. **Automated test suite** (Playwright/unit) not yet added — verification so far is the
   manual end-to-end pass in §9.

---

## 11. Glossary

Norcineria = pork butcher/cured-meats shop · Porchetta = slow-roasted seasoned pork ·
Negozi/bottega = shops/shop · Negozio = the online store · Prenotazioni = reservations ·
Scheda fedeltà = loyalty card · Ciauscolo IGP = soft Marche salami · Pecorino di fossa =
pit-aged sheep cheese · Razza marchigiana = Marche cattle breed.
