# Deploying Taccalite

Three supported paths:

- **V) Vercel + Turso** — serverless; the database lives in Turso (hosted libSQL)
  and uploads in Vercel Blob. See **§V** just below.
- **A) Coolify** on a VPS (recommended if you already run Coolify) — see §0 below.
- **B) Plain Docker Compose + Caddy** on a VPS — see §1 onward. Uses
  `docker-compose.yml` + `Caddyfile` in the repo.

Paths A and B run a single Next.js container with **SQLite persisted on a volume**.
Path V has no disk at all, which is why it needs Turso + Blob.

---

## V. Deploying on Vercel (Turso + Vercel Blob)

Vercel functions run on a **read-only, ephemeral filesystem** — a `./data/*.db`
SQLite file cannot exist there. The app therefore talks to the database through
`@libsql/client`, which speaks to a **local file** in dev/Docker and to a
**remote Turso** database on Vercel with no code change — only `DATABASE_URL`
differs.

> **Zero-config deploy = demo mode.** Import the repo into Vercel and deploy with
> no variables at all: the site comes up and works, running on an **in-memory
> database that is migrated + seeded on every cold start**. Nothing written
> (orders, bookings, admin edits, logins, uploads) survives — each serverless
> instance has its own copy and it is wiped on restart. The admin shows a yellow
> "Modalità demo" banner and the logs a `[db] ⚠ … EPHEMERAL` warning. Good for
> previewing; **not** for a real shop. To persist data do V.1–V.4 below — it is a
> one-time, dashboard-only setup.

### V.1 Create the Turso database

```bash
# https://docs.turso.tech/cli/installation
turso auth signup            # or: turso auth login
turso db create taccalite --location fra   # pick a region near your users
turso db show taccalite --url              # → libsql://taccalite-<org>.turso.io
turso db tokens create taccalite           # → the auth token
```

(You can also do this from the Turso dashboard, or via the **Turso** integration
in the Vercel Marketplace, which injects the two variables for you.)

### V.2 Attach a Vercel Blob store (image uploads)

Vercel project → **Storage** → **Create Database** → **Blob** → connect it to the
project. Vercel injects `BLOB_READ_WRITE_TOKEN` automatically. Admin uploads
(product/shop/reward/post photos) are then stored in Blob and the row keeps the
blob's public URL; without the token, uploads fall back to local disk and would
fail on Vercel with a read-only-filesystem error.

### V.3 Environment variables

Vercel project → **Settings → Environment Variables** (Production, and Preview if
you use it):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `libsql://taccalite-<org>.turso.io` (`TURSO_DATABASE_URL`, as injected by the Vercel Marketplace integration, is accepted too) |
| `DATABASE_AUTH_TOKEN` | the Turso token (`TURSO_AUTH_TOKEN` is accepted too) |
| `CRON_SECRET` | `openssl rand -hex 32` — Vercel Cron sends it as `Authorization: Bearer` automatically |
| `ADMIN_PASSWORD` | your real admin password (used only when the admin user is first created) |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` |
| `OWNER_EMAIL`, `SMTP_*`, `MAIL_FROM` | as in `.env.example` |
| `STRIPE_*`, `INSTAGRAM_*` | when ready |
| `TRUST_PROXY` | `1` (Vercel's edge sets `x-forwarded-for`, so rate limiting sees real client IPs) |
| `BLOB_READ_WRITE_TOKEN` | injected by the Blob store (§V.2) |

Do **not** set `NODE_ENV` yourself. Do **not** set `RUN_MIGRATIONS_ON_BOOT`.

### V.4 Migrations & seed run at build time

`package.json` has a `vercel-build` script — `tsx scripts/seed.ts && next build` —
which Vercel runs instead of `build`. `scripts/seed.ts` applies the Drizzle
migrations from `drizzle/` and upserts the base content, default settings and the
bootstrap admin (all `ON CONFLICT DO NOTHING`, so re-running on every deploy is
safe and never overwrites your edits). If migrations fail the build fails — you
never get a server pointed at an un-migrated database. `DATABASE_URL` /
`DATABASE_AUTH_TOKEN` must therefore also be available to the **build**
environment (they are, unless you scoped them to runtime only).

### V.5 Scheduled jobs (Vercel Cron)

`vercel.json` declares one cron — `GET /api/cron?job=all` at **06:00 UTC daily**
— which Vercel calls with `Authorization: Bearer $CRON_SECRET`. That cadence fits
the **Hobby** plan (max one run per day). On **Pro** you can tighten it to match
the Docker scheduler (`"*/15 * * * *"`) — porchetta reminders, pickup auto-fulfil
and the outbox drain benefit from running more often. Edit the `schedule` field
and redeploy.

### V.6 What is different on Vercel

- **Rate limiting** is per function instance (in-memory), so it's softer than on a
  single container. Turn on Vercel's WAF / Attack Challenge Mode for the login
  route if you need hard limits.
- **Backups**: Turso keeps point-in-time restore for the retention of your plan
  (`turso db shell taccalite .dump > backup.sql` for a manual copy). The
  `scripts/backup*.sh` files are for the Docker paths only.
- **`/api/media/[file]`** only serves disk uploads; Blob images are served by
  Vercel's CDN directly from their own URL.
- Everything else (auth, orders, loyalty, FTS search, transactions) is unchanged —
  libSQL transactions open in write mode (`BEGIN IMMEDIATE`) so the read-then-write
  atomicity the code relies on holds.

---
> ✅ **Scheduled jobs & backups run automatically with Docker Compose (path B).**
> The stack ships a **`scheduler`** sidecar (a second container built from the same
> image) that triggers `/api/cron?job=all` every 15 minutes and takes a nightly
> online backup — no host crontab, no Docker socket. So a plain `docker compose up`
> drains the outbox, sends porchetta reminders, expires points, GCs sessions, and
> snapshots the DB on its own. See **§4** (how it works / tuning) and **§7**
> (backups). A host crontab remains a supported alternative if you prefer to remove
> the sidecar.
>
> ⚠️ **Coolify (path A) is the exception:** it deploys only the app container, so
> the sidecar is not present — you must add Coolify **Scheduled Tasks** (see §0
> step 8).

---

## 0. Deploying with Coolify (recommended)

Coolify already provides the reverse proxy + automatic HTTPS, so you deploy **only the app
container** — ignore `docker-compose.yml` and `Caddyfile` (those are for path B).

1. **New Resource → Application**, connect this Git repo, branch `main`.
2. **Build Pack: `Dockerfile`** (not Nixpacks, not Docker Compose — the repo ships a
   Dockerfile that also migrates + seeds on start).
3. **Ports Exposes:** `3000`.
4. **Domains:** set your FQDN (e.g. `taccalite.it`); Coolify issues Let's Encrypt TLS.
   Point the DNS A-record at the server first.
5. **Persistent storage (critical):** add a Storage volume mounted at **`/app/data`** —
   this is the SQLite database. Without it, every redeploy wipes all data.
6. **Environment variables:** `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL=/app/data/taccalite.db`,
   `CRON_SECRET`, `ADMIN_USERNAME`/`ADMIN_PASSWORD`/`ADMIN_NAME`,
   `OWNER_EMAIL`, `NODE_ENV=production` (**required** — the app only enforces its
   secure-secret guard and the `Secure` cookie flag in production), `TRUST_PROXY=true`
   (safe here because Coolify's proxy overwrites `X-Forwarded-For`), and (when ready)
   `SMTP_*`/`MAIL_FROM` and `STRIPE_*`. See §5–6 for those. Migrations run at container
   start via the entrypoint, so you do **not** set `RUN_MIGRATIONS_ON_BOOT`.
7. **Deploy.** First boot applies migrations + seeds content and the admin (idempotent).
8. **Cron:** Coolify → app → **Scheduled Tasks**. The secret goes in the
   `Authorization: Bearer` header (never the query string). Add three tasks:
   - `*/15 * * * *` — outbox drain + housekeeping:
     `curl -s -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron?job=maintenance"`
   - `0 9 * * 5` — Friday porchetta reminders:
     `curl -s -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron?job=porchetta-reminders"`
   - `0 3 * * *` — points expiry (no-op unless `loyalty.pointsExpiryDays` is set):
     `curl -s -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron?job=points-expiry"`

Open `https://<domain>/admin`, log in with `ADMIN_USERNAME`/`ADMIN_PASSWORD`, change the
password. Backups: snapshot the `/app/data` volume (see §7).

---

## 1. Provision the server _(path B — plain Docker Compose)_

1. Create a **Hetzner Cloud** VM (CX22 or larger is plenty), Ubuntu 24.04, add your SSH key.
2. Point your domain's DNS **A record** (`taccalite.it` and `www`) at the VM's IPv4.
3. SSH in and install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
4. (Recommended) Enable the firewall, allowing only SSH + HTTP + HTTPS:
   ```bash
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
   ```

## 2. Get the code + configure

```bash
git clone <your-repo-url> taccalite && cd taccalite
cp .env.example .env
nano .env
```

> ⚠️ **The shipped `.env.example` contains insecure defaults — override them.** It
> carries `CRON_SECRET=dev-cron-secret` and `ADMIN_PASSWORD=taccalite-admin` (and a
> placeholder `OWNER_EMAIL=owner@example.com`). You **must** set fresh
> `CRON_SECRET` and `ADMIN_PASSWORD`, and set a real
> `OWNER_EMAIL` — the app's production guard **logs a loud warning at startup** if the
> insecure defaults are still in place when `NODE_ENV=production` (it no longer
> refuses to boot, so check the logs after the first start).

Set at minimum in `.env`:

| Variable | Value |
| -------- | ----- |
| `NEXT_PUBLIC_SITE_URL` | `https://taccalite.it` |
| `NODE_ENV` | `production` (**required** — gates the secure-secret guard + `Secure` cookie) |
| `CRON_SECRET` | `openssl rand -hex 16` |
| `TRUST_PROXY` | `true` (only because Caddy overwrites `X-Forwarded-For`; never enable without such a proxy) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | the owner's admin login (must NOT be the `taccalite-admin` default in prod) |
| `OWNER_EMAIL` | where reservation/order notifications go |
| SMTP\_\* / `MAIL_FROM` | when you have real email (see §5) |
| `STRIPE_*` | when you enable payments (see §6) |

Edit **`Caddyfile`** and replace **both**: the domain (`taccalite.it` /
`www.taccalite.it`) with your real domain, **and** the ACME `email` in the global
block (currently the placeholder `admin@taccalite.it`) with a real mailbox you
monitor — Let's Encrypt sends certificate-expiry notices there.

## 3. Launch

```bash
docker compose up -d --build
```

On first start the container applies migrations and seeds content + the admin account.
Caddy obtains TLS certificates automatically (ports 80/443 must be reachable and DNS must
resolve). Check status:

```bash
docker compose ps
docker compose logs -f app
```

Visit `https://taccalite.it`. The admin panel is at `https://taccalite.it/admin`
(log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` — change the password after first login).
Shop staff can accrue purchase-tied loyalty points in-shop at
`https://taccalite.it/admin/loyalty/scan` (arbitrary point adjustments stay admin-only).

**Lost admin password?** The seed only creates the bootstrap admin when none exists,
so re-seeding won't reset an existing one. Reset it in place from the lean image with:

```bash
docker compose exec app node reset.cjs <username> <password>
```

## 4. Scheduled jobs (cron)

**Path B (Compose): handled for you by the `scheduler` sidecar.** It calls
`/api/cron?job=all` every `CRON_INTERVAL_SEC` seconds (default 900 = 15 min),
authenticating with the `CRON_SECRET` in the `Authorization: Bearer` header over
the internal Compose network. `job=all` runs the outbox drain/retry + housekeeping,
porchetta reminders (idempotent — each reservation is emailed once, stamped via
`reminded_at`, so a frequent sweep is safe), points-expiry (a no-op unless
`loyalty.pointsExpiryDays` is set), and the **owner daily digest** (today's
reservations, last-24h orders, low stock) — the digest is idempotent per calendar
day, so the frequent sweep fires it exactly once/day with no separate schedule —
and the **Instagram token refresh** (no-op unless a token is configured; rolls the
60-day token once a week so the homepage feed never goes stale).
Tune with `CRON_INTERVAL_SEC` (default 900) / `BACKUP_HOUR` (default 3) env vars on
the `scheduler` service; nightly backups honour `RETENTION_DAYS` (default 14, see
§7). Watch it with `docker compose logs -f scheduler`.

The cron endpoint is always reachable directly too (secured by the `CRON_SECRET`
bearer header — never the query string, which leaks into access logs), e.g. to run
a job on demand:

```bash
docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/cron?job=maintenance',{method:'POST',headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>console.log(r.status))"
```

**Alternative (host crontab).** If you remove the `scheduler` service, schedule the
jobs from the host instead — a frequent maintenance sweep (drains the outbox so
newsletter/retry mail goes out), Friday porchetta reminders, and a daily points pass:

```bash
crontab -e
# m  h  dom mon dow  command   (replace YOUR_CRON_SECRET)
  */15 * *   *   *   curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" "https://taccalite.it/api/cron?job=maintenance" >/dev/null
  0    9 *   *   5   curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" "https://taccalite.it/api/cron?job=porchetta-reminders" >/dev/null
  0    3 *   *   *   curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" "https://taccalite.it/api/cron?job=points-expiry" >/dev/null
  0    4 *   *   1   curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" "https://taccalite.it/api/cron?job=instagram-refresh" >/dev/null
```

## 5. Email (make it real)

Until a domain mailbox exists, the app runs in **outbox mode** — every email is stored and
readable under **Admin → Email**, but nothing is sent. To send for real:

- **Quick test with Gmail:** create an *App Password* (Google Account → Security → 2-Step
  Verification → App passwords) and set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`,
  `SMTP_SECURE=false`, `SMTP_USER=<you>@gmail.com`, `SMTP_PASS=<app-password>`,
  `MAIL_FROM="Norcineria Taccalite <you@gmail.com>"`.
- **Production:** use the agency's domain mailbox or a service (Resend/Postmark) — same
  SMTP variables, or swap `lib/mail/mailer.ts` for the provider SDK. Then
  `docker compose up -d` to apply.

Use **Admin → Impostazioni → "Invia prova"** to verify delivery.

## 6. Payments (Stripe)

Without keys, checkout runs in **simulate mode** (orders are recorded and confirmed, no
charge). To enable real (test or live) payments, set `STRIPE_SECRET_KEY` and
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, then configure a webhook at
`https://taccalite.it/api/checkout/webhook` and set `STRIPE_WEBHOOK_SECRET`. The success
page also finalizes orders as a webhook-free fallback.

### 6a. Webhook events to enable

In the Stripe dashboard (**Developers → Webhooks → your endpoint → Select events**),
subscribe to **all four**. Only the first is needed to take money; the other three keep
the gestionale's picture of reality in sync, and skipping them causes the silent drift
noted beside each.

| Event | What it does | If you don't enable it |
| --- | --- | --- |
| `checkout.session.completed` | Marks the order paid: decrements stock, accrues loyalty points, counts the coupon, emails the customer. | Orders only finalize when the customer lands back on the success page — one closed tab and the sale is stuck as pending. |
| `checkout.session.async_payment_succeeded` | Same, for delayed methods where the money lands after checkout. | Bank-transfer-style payments never finalize. |
| `checkout.session.expired` | Cancels an abandoned checkout (~24h). | Abandoned attempts pile up as "pending" in the orders list forever. |
| `charge.refunded` | Mirrors a refund issued **from the Stripe dashboard** back into the order — restocks the goods and frees the coupon on a full refund. | A refund taken in Stripe leaves the order reading "paid" here: stock stays wrong and the VAT report over-declares. |

> Refunds issued from the **gestionale** (Ordine → Rimborsa) don't depend on this — they
> call Stripe directly. `charge.refunded` is what covers the other direction. Both paths
> record the amount cumulatively, so the same refund arriving twice is a no-op.

Partial refunds are supported: leave the amount blank to refund everything outstanding,
or enter a smaller figure. Stock returns and the coupon is released only when an order
reaches a **full** refund — a partial refund is treated as a price adjustment, not a return.

## 7. Backups & restore

The entire dataset is the SQLite file under `./data`.

**Automatic (Compose).** The `scheduler` sidecar runs `scripts/backup-container.sh`
once a day (the first tick past `BACKUP_HOUR`, default 03:00) — a **safe online
backup** (no downtime) compressed into `./backups`, pruning copies older than
`RETENTION_DAYS` (default 14). Nothing to configure. Run one on demand:

```bash
docker compose exec scheduler sh /app/scripts/backup-container.sh
```

**Host-cron alternative.** If you run without the sidecar, `scripts/backup.sh`
does the same thing from the host (it wraps `docker compose exec` around the online
backup):

```bash
# Nightly at 03:00 (crontab -e)
0 3 * * *  cd /opt/taccalite && ./scripts/backup.sh >> /var/log/taccalite-backup.log 2>&1
```

> A backup on the same VM is **not** disaster recovery — sync `./backups` off-box
> (Hetzner Storage Box / S3 / `rclone`) on a schedule.

**Restore:** stop the stack (`docker compose down`), replace `data/taccalite.db`
(and delete any stale `-wal`/`-shm` sidecars), then `docker compose up -d`.

## 7a. Health & readiness

The app exposes an unauthenticated **`GET /api/health`** that returns `200` only
when the process is up and SQLite is reachable (`503` otherwise). Both the
Dockerfile and `docker-compose.yml` define a healthcheck against it, and Caddy is
configured to wait for the app to become **healthy** before proxying — so a
redeploy never serves traffic mid-migration. The container also **fails to start**
if migrations/seeding error (the entrypoint no longer swallows failures), so a bad
migration surfaces immediately instead of booting against an un-migrated DB.

The container runs the server as the unprivileged **`node`** user (the entrypoint
only uses root briefly to fix the data-volume ownership).

### Monitoring the failures that don't take the site down

Liveness is the easy half. The failure that has actually bitten this app is the
silent one: a mail relay that rejects every message while all 76 routes keep
answering `200`. Order confirmations and password-reset links die in the outbox,
and nothing external notices.

**`GET /api/health?checks=full`** reports that, and answers **`503`** when
anything is degraded — so a plain uptime monitor alerts on it without parsing
JSON. It carries operational detail, so it needs the same bearer the scheduler
uses:

```bash
curl -si -H "Authorization: Bearer $CRON_SECRET" "https://taccalite.it/api/health?checks=full"
```

```json
{ "status": "degraded", "database": "ok",
  "mail": { "configured": true, "authenticated": false, "failed24h": 12 } }
```

`authenticated: false` with `configured: true` is degraded on its own, before a
single message has failed — that is the state where `SMTP_HOST` is set and the
credentials are blank, and it is worth catching before the first customer meets
it. `failed24h` is a rolling window, so a batch you have already dealt with
stops counting.

Point UptimeRobot, Better Stack or Healthchecks.io at that URL with the header
(all three support custom headers on the free tier), alongside a plain check on
`/api/health` for liveness. Without this, the only place a dead relay shows up
is the Gestionale dashboard, which requires someone to go and look.

## 8. Updates

```bash
git pull
docker compose up -d --build
```

Migrations apply automatically on startup; seeding is idempotent.

## 9. Notes & scaling

- SQLite (WAL) is ample for two shops. If the business ever needs horizontal scaling,
  the data layer (`lib/db`) is isolated behind Drizzle and can move to Postgres; the
  in-memory rate limiter (`lib/rate-limit.ts`) would then need a shared store.
- Keep `.env` secret and backed up. There is no session secret to rotate: sessions
  are opaque random tokens in the `sessions` table, so revocation means deleting the
  rows — Gestionale → **Sicurezza** → "Chiudi le altre sessioni", or `revokeSessions()`.
  They also expire after 30 days, or 7 days of inactivity.
- **Lean runtime image (~123 MB):** `output: "standalone"` is enabled, so the runner
  ships only the traced server (with `@libsql/client` and its native binding) — **no full
  `node_modules`, no `tsx`, no C build toolchain.** The migrate/seed step runs from
  a precompiled plain-node bundle (`npm run db:compile-seed` → `seed.cjs`) and the
  server from Next's `server.js`, both via the entrypoint. For stricter
  reproducibility, pin the base images by digest in the `Dockerfile` / `Caddyfile`.
- **Scheduler:** the `scheduler` sidecar reuses the app image; it needs no extra
  build and no Docker socket. Container + scheduler logs are rotated (json-file,
  10 MB × 3) via the compose `logging` block.
