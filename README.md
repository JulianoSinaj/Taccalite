# Taccalite — Norcineria Taccalite (Ancona, dal 1946)

Marketing & customer-experience website for **Norcineria Taccalite**, an artisanal
Italian deli / butcher (norcineria) in Ancona with two shops: a cheese counter in
Piazza Kennedy (*Centro*) and a meat & cured-meats counter at the Mercato Coperto del
Piano (*Carni*). The site tells the family story (three generations since 1946),
showcases the signature Saturday *porchetta*, lists products, publishes news, and lets
visitors request a reservation and join the loyalty club.

Built with **Next.js 16 (App Router)**, **React 19**, **Tailwind CSS v4**, **SQLite +
Drizzle ORM**, and a heavy motion/3D layer (Three.js + Framer Motion + Lenis).

> ✅ **A full, self-hostable platform.** Reservations, customer accounts, a real loyalty
> programme (with a scannable QR card + a staff in-shop points screen), newsletter, an
> online store with Stripe checkout and stock decrement + low-stock alerts, a customer
> reservation/order tracking page (`/traccia`), a role-gated admin/CMS with
> admin-uploaded images (product/shop/reward/blog), first-party cookieless analytics,
> porchetta weekly-capacity + waitlist + ready-emails, an owner daily digest email,
> transactional email, and an automated scheduler (cron + nightly backups) — all
> persisted to a database and covered by a test suite (Vitest + Playwright). See
> [`DOCUMENTATION.md`](./DOCUMENTATION.md) for the complete picture,
> [`ROADMAP.md`](./ROADMAP.md) for the build log, and [`DEPLOYMENT.md`](./DEPLOYMENT.md)
> to ship it to Hetzner.

**Admin panel:** `/admin` (default login `admin` / `taccalite-admin` —
change it). **Without SMTP/Stripe keys** the app still runs fully: email goes to a
viewable outbox and checkout runs in simulate mode.

---

## Quick start

```bash
npm install
npm run db:seed    # first time — creates + seeds the SQLite DB and the admin
npm run dev        # http://localhost:3000
```

### Scripts

| Script | What it does |
| ------ | ------------ |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the unit/integration suite (Vitest) |
| `npm run test:e2e` | Run the end-to-end suite (Playwright — first run: `npx playwright install chromium`) |
| `npm run db:generate` | Generate Drizzle migrations from the schema |
| `npm run db:seed` | Seed content, rewards, settings, and the admin (idempotent) |
| `npm run db:studio` | Open Drizzle Studio to browse the DB |
| `npm run admin:reset` | Reset the bootstrap admin (tsx scripts/reset-admin.ts) |
| `npm run db:compile-seed` / `db:compile-reset` | Bundle seed/reset to plain-node `.cjs` for the lean runtime image (esbuild) |

Requirements: **Node.js 20+**. The database is a local SQLite file under `data/`
(git-ignored); migrations apply automatically on first run.

---

## Project layout

```
app/
  (site)/                Public marketing site + online store (own chrome)
  admin/                 Role-gated admin/CMS (login + dashboard)
  api/                   Route handlers (reservations, auth, checkout, cron, …)
  sitemap.ts robots.ts
components/              Marketing, store/, account/, admin/, ui/ (shadcn)
lib/
  db/                    Drizzle schema, client (auto-migrate), queries, admin
  auth/ mail/ payments/  Sessions+password, Nodemailer+templates, Stripe
  validation/            Zod schemas
  loyalty.ts orders.ts newsletter.ts automation.ts env.ts site.ts seo.ts
scripts/seed.ts          Idempotent database seed
drizzle/                 Generated SQL migrations
data/                    SQLite database (git-ignored)
DESIGN.md                Visual-design specification
<tool>/DESIGN.md         Reference design studies (Vercel, Figma, …) — NOT app code
```

## Documentation

- [`DOCUMENTATION.md`](./DOCUMENTATION.md) — full technical documentation: architecture,
  every route & component, the data model, the design system, and current limitations.
- [`ROADMAP.md`](./ROADMAP.md) — phased plan to reach a production-ready, self-hosted
  (Hetzner) platform: database, auth, reservations, admin/CMS, email automation, SEO,
  GDPR, and deployment.
- [`DESIGN.md`](./DESIGN.md) — the visual-design specification for the brand.

## Deployment

Ships as **Docker Compose + Caddy** (automatic TLS) for a single **Hetzner** VM, with the
SQLite database on a persisted volume. See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full
runbook (provisioning, env, email/Stripe, backups, updates).

```bash
cp .env.example .env   # then edit
docker compose up -d --build
```

## A note on this Next.js

Per [`AGENTS.md`](./AGENTS.md), this project pins a specific Next.js whose conventions may
differ from older docs. Consult `node_modules/next/dist/docs/` before writing framework
code.
