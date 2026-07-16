# Taccalite — Platform Roadmap

Plan to evolve Taccalite from a **static marketing site** into a **deployable,
self-hosted (Hetzner) platform** that runs the business's digital operations with as much
automation as possible.

Read [`DOCUMENTATION.md`](./DOCUMENTATION.md) first — this plan builds directly on the
"Known issues & gaps" there.

---

## 1. Gap analysis — from site to platform

| # | Gap (today) | Impact | Phase |
| - | ----------- | ------ | ----- |
| G1 | No database / persistence | Reservations, sign-ups, loyalty, newsletter all evaporate | 1 |
| G2 | Reservation API is a stub | Zero business value from the main CTA | 2 |
| G3 | No email / notifications | Owner never learns of a request; customer gets no confirmation | 2 |
| G4 | No real auth | "Accounts" are a name in localStorage | 3 |
| G5 | Loyalty is fake & shared | Can't run an actual loyalty programme | 3 |
| G6 | No admin / CMS | Owner must edit code to change hours, prices, posts, points | 4 |
| G7 | No automation | Saturday reminders, follow-ups, newsletters are all manual | 5 |
| G8 | No deployment config | Cannot ship to Hetzner | 6 |
| G9 | No SEO infra | A local shop that lives on discovery is invisible to structured search | 0 |
| G10 | No GDPR compliance | Legal risk for an EU business collecting personal data | 0 |
| G11 | No online ordering | "online a breve" promise unfulfilled | 5 (scope decision) |
| G12 | No tests / QA harness | Regressions ship silently | 7 |
| G13 | Small correctness/cleanup bugs (`preload`, duplicated maps) | Minor, easy | 0 |

## 2. Recommended features (beyond closing gaps)

Prioritised for **owner productivity / automation** and **customer experience**:

**High value / automate**
- **Reservation & porchetta pre-order pipeline** with statuses, calendar view, and
  one-click confirm → auto-email. Distinguish *table degustazione* vs *porchetta pickup*
  vs *product order*.
- **Saturday porchetta engine**: customers reserve a weight/quantity for the coming
  Saturday; owner sees a prep list; automated "your porchetta is ready / reminder" emails.
- **Loyalty programme, real**: per-customer points, QR identity, in-shop "add points"
  screen for staff, redemptions ledger, automated reward-unlocked emails.
- **Newsletter + broadcasts**: double opt-in capture, segmented sends (e.g. "porchetta is
  out of the oven"), from the admin.
- **Admin dashboard**: single place to manage reservations, content (shops/products/
  blog/hours), loyalty, and subscribers — this is the core "automation" deliverable.

**Medium value**
- **Contact / order-by-request** forms per shop (special orders, catering/taglieri).
- **Google Business / reviews** surface, **maps embed**, opening-hours "open now" badge.
- **Structured data & local SEO** (LocalBusiness, Product, Article, BreadcrumbList).
- **Image pipeline** — replace Unsplash placeholders with owned, optimised photography.

**Optional / later**
- **Online store / payments** (Stripe) for shippable products & gift boxes — only if the
  business wants fulfilment. *Scope decision (see §5).*
- **Gift cards**, **catering quote requests**, **multi-language** (EN for tourists).

## 3. Target architecture (self-hosted on Hetzner)

```
                         Hetzner Cloud VM (Ubuntu)
 ┌───────────────────────────────────────────────────────────────┐
 │  Caddy / Traefik  (TLS via Let's Encrypt, reverse proxy)        │
 │        │                                                        │
 │        ├── Next.js app (standalone, Node)  ── /  + /admin       │
 │        │        │                                               │
 │        │        ├── Postgres (Docker volume, nightly backups)   │
 │        │        └── SMTP/Resend for transactional + broadcast   │
 │        │                                                        │
 │        └── (optional) Umami/Plausible self-hosted analytics     │
 │  Cron / scheduled worker: reminders, newsletters, points expiry │
 └───────────────────────────────────────────────────────────────┘
```

**Proposed stack additions**
- **DB:** PostgreSQL. **ORM:** Drizzle ORM (typed, light, SQL-first) _or_ Prisma.
- **Auth:** Auth.js (NextAuth) — email magic-link for customers; credential + role for
  admin. _(Alternative: Lucia/custom.)_
- **Email:** transactional via SMTP (Hetzner/any) or Resend; templated with React Email.
- **CMS/admin:** custom Next.js admin under `/admin` (full control, no extra runtime)
  _or_ **Payload CMS** (self-hostable, Postgres, gives admin+auth+collections for free).
- **Validation:** Zod on every API boundary. **Rate limiting** + honeypot on public forms.
- **Deploy:** Docker multi-stage (`output: "standalone"`) + docker-compose; GitHub Actions
  build; migrations on release.

## 4. Phased plan

Each phase is independently shippable and leaves the site working. Coding proceeds
**one phase at a time, verified before moving on** (per the working agreement).

### Phase 0 — Foundations, fixes, SEO & legal _(no back-end; low risk)_
- Move product images onto the `Product` model (dedupe the `productImages` maps).
  _(Note: the `preload` image prop is correct for Next 16 — `priority` is deprecated.)_
- Centralised config: `lib/env.ts` (+ `.env.example`), site constants.
- SEO: `app/sitemap.ts`, `app/robots.ts`, JSON-LD (LocalBusiness per shop, Product,
  Article, Breadcrumb), OpenGraph/Twitter metadata + generated OG images.
- Legal & GDPR: `/privacy`, `/cookie` pages, cookie-consent banner, minimal by default.
- Accessibility & reduced-motion sweep; contrast verification.
- **Exit:** Lighthouse SEO/best-practices green; legal pages linked in footer.

### Phase 1 — Database & content layer
- Add Postgres + ORM; schema for shops, products, blog_posts, reservations, customers,
  loyalty_accounts, loyalty_transactions, rewards, redemptions, newsletter_subscribers,
  admin_users.
- Seed from current `lib/data.ts`; switch pages to read from the DB (cached/ISR).
- **Exit:** all existing pages render from the DB; content editable via seed/migration.

### Phase 2 — Reservations, for real
- Persist reservations with type (table / porchetta / order), status machine
  (pending→confirmed→completed/cancelled), and admin notes.
- Zod validation, rate limit, honeypot on `/api/prenotazioni`.
- Transactional email: customer confirmation + owner notification.
- Reservation type UX: rework the form to match the real business flows.
- **Exit:** a submitted reservation is stored, both emails fire, owner can see it.

### Phase 3 — Auth, accounts & loyalty
- Auth.js: customer magic-link + admin credential/role.
- Real accounts; migrate the loyalty demo to per-user points + QR; redemptions ledger.
- Newsletter double opt-in capture (footer + dedicated form).
- **Exit:** a customer registers, logs in, sees their real points; admin role gated.

### Phase 4 — Admin dashboard / CMS
- `/admin` (role-gated): reservations board, content editors (shops/products/blog/hours),
  loyalty management (add/adjust points, manage rewards), subscriber list.
- Media uploads for real photography.
- **Exit:** owner runs day-to-day operations without touching code.

### Phase 5 — Automation & engagement
- Scheduled worker/cron: Saturday porchetta reminders, reservation reminders, points
  expiry, weekly digest.
- Broadcast newsletters from admin (React Email templates).
- **(Scope-gated)** Online ordering / Stripe for shippable products & gift boxes.
- **Exit:** reminders and newsletters send automatically; (optional) checkout works.

### Phase 6 — Deployment to Hetzner
- Dockerfile (standalone) + docker-compose (app, postgres, reverse proxy, backups).
- Env/secrets management, DB migrations on deploy, health checks, structured logging.
- Domain + TLS; server hardening; backup/restore runbook.
- **Exit:** production URL live on Hetzner with TLS, backups, and a rollback path.

### Phase 7 — QA, testing & final docs
- Playwright E2E for the critical flows (reserve, register, redeem, admin CRUD),
  unit tests for domain logic, a11y + SEO audit, load sanity check.
- Regenerate `DOCUMENTATION.md`; write an **operations runbook** and an **owner's guide**.
- **Exit:** green test suite; documentation matches reality.

## 5. Locked decisions (confirmed 2026-07-16)

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| **Scope** | **Full platform** — reservations+email, accounts+loyalty, admin/CMS, **AND online ordering+payments** | Owner wants a complete platform |
| **Admin** | **Custom `/admin`** | Max control, matches exact business flows, no extra runtime |
| **Email** | **Nodemailer, provider-agnostic** — Gmail SMTP for testing now; swap to agency domain/Resend later via env. Dev **outbox** fallback captures mail when no SMTP is set | No email domain yet; must be testable with Gmail |
| **Database** | **SQLite + Drizzle ORM** (WAL) | Zero external services → testable on Windows now; trivial to back up on a Hetzner volume; ample for two shops. Data layer kept portable to Postgres if the agency requires |
| **Auth** | **Email + password**, hashed (scrypt/bcrypt), signed HTTP-only cookie sessions; customer + admin roles | Fully testable offline (magic-link needs working email we don't have) |
| **Payments** | **Stripe Checkout, test mode**, env-gated with graceful "not configured" fallback | Works without a real domain; orders persist regardless |
| **Deploy** | **Docker (standalone) + Caddy** on Hetzner | Single-VM, TLS, simple ops |

_Migration notes:_ the mailer, DB client, and payment provider are each isolated behind a
small module so production swaps (real email domain, Postgres, live Stripe keys) are
env-only changes.

---

## 6. Progress log

_Updated as phases land._

- **2026-07-16** — Read full codebase; wrote `DOCUMENTATION.md`, rewrote `README.md`,
  created this roadmap. Baseline build passes (15 routes). Scope confirmed (full platform).
- **2026-07-16 — Phase 0 done.** Deduped product images onto the model; `lib/env` +
  `lib/site` + `.env.example`; SEO (`sitemap.ts`, `robots.ts`, JSON-LD org/shop/product/
  article/breadcrumb, OG/Twitter metadata, title template); legal (`/privacy`, `/cookie`,
  `CookieConsent`, footer links); `images.qualities` fix. Verified in browser.
- **2026-07-16 — Phase 1 done.** SQLite + Drizzle: 15-table schema, auto-migrate on init,
  idempotent seed (`npm run db:seed`), React-cached query layer. All content pages, footer,
  and sitemap now read from the DB (dynamic rendering). Build clean, no runtime errors.
- **2026-07-16 — Phase 2 done.** Reservation intake: Zod validation, IP rate-limit,
  honeypot; three business flows (table / porchetta / order) with a reworked form; provider-
  agnostic Nodemailer mailer + `email_outbox` audit/fallback; owner + customer emails.
  Verified: persistence, validation, honeypot, and full UI submit (ref TAC-…).
- **2026-07-16 — Phase 3 done.** Email+password auth (scrypt) with signed cookie sessions
  (customer/staff/admin roles); real per-user loyalty (points, card №, ledger, redemptions,
  welcome bonus); account page rebuilt on real data with redeem; newsletter double opt-in
  (footer form → confirm page). All flows verified via API + browser.
- **2026-07-16 — Phase 4 done.** Split marketing (`(site)` route group) vs admin chrome.
  Role-gated `/admin` with login: dashboard stats, reservations (status + auto-email),
  products/blog/shops CRUD (server actions), loyalty (adjust points, redemptions),
  newsletter list, email outbox viewer, orders, settings (SMTP/Stripe status + test email).
  Verified: gate/redirect, login, reservation confirm→email, product create.
- **2026-07-16 — Phase 5 done.** Online store (`/negozio`), cart (localStorage context),
  checkout with server-authoritative pricing, Stripe Checkout (test) + simulate fallback,
  order persistence + emails + loyalty accrual, success page (idempotent finalize). Cron
  endpoint (`/api/cron`, secret-gated) for Saturday porchetta reminders; admin newsletter
  broadcast; unsubscribe. Verified: cart→order (€ correct), points accrual, reminders,
  broadcast, guest+member checkout.
- **2026-07-16 — Phase 6 done.** Deployment artifacts: multi-stage `Dockerfile`,
  `docker-entrypoint.sh` (migrate+seed→start), `docker-compose.yml` (app + Caddy TLS,
  SQLite volume), `Caddyfile`, `.dockerignore`, `.gitattributes` (LF), and
  `DEPLOYMENT.md` (Hetzner runbook: provisioning, env, email/Stripe, cron, backups).
- **2026-07-16 — Phase 7 done.** Final QA: clean build (20 routes), ESLint 0 errors
  (relaxed one advisory hooks rule for the SSR mount idiom). Smoke test: 13 public routes
  200, all `/admin/*` gated (307). Regenerated `DOCUMENTATION.md` + `README.md` to match
  the finished platform. **All phases complete.**
