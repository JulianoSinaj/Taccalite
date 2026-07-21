# Deploying Taccalite to Hetzner

Two supported paths:

- **A) Coolify** (recommended if you already run Coolify) — see §0 below.
- **B) Plain Docker Compose + Caddy** — see §1 onward. Uses `docker-compose.yml` +
  `Caddyfile` in the repo.

Either way the app is a single Next.js container with **SQLite persisted on a volume**.

> ⚠️ **Scheduled jobs & backups are NOT automatic.** A bare `docker compose up`
> runs **ZERO** cron jobs and **ZERO** backups. The container ships no scheduler —
> nothing drains the email outbox, sends porchetta reminders, expires points, or
> snapshots the database until **you** add host crontab entries for
> `/api/cron?job=all` (with the `CRON_SECRET` bearer token) and for
> `scripts/backup.sh`. This is the single biggest operational gap. See **§4**
> (cron) and **§7** (backups). *(Coolify users: use its Scheduled Tasks instead —
> see §0 step 8.)*

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
   `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_USERNAME`/`ADMIN_PASSWORD`/`ADMIN_NAME`,
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

> ⚠️ **The shipped `.env.example` contains insecure defaults and a real address —
> override them.** It carries `SESSION_SECRET=dev-insecure-secret-change-me-in-production`,
> `CRON_SECRET=dev-cron-secret`, and `ADMIN_PASSWORD=taccalite-admin`, and it hard-codes
> the owner's **real** `OWNER_EMAIL` (`norcineriataccalitepaolo@gmail.com`). You **must**
> set fresh `SESSION_SECRET`, `CRON_SECRET`, and `ADMIN_PASSWORD`, and confirm
> `OWNER_EMAIL` — the app's production guard **refuses to boot** with the insecure
> defaults when `NODE_ENV=production`.

Set at minimum in `.env`:

| Variable | Value |
| -------- | ----- |
| `NEXT_PUBLIC_SITE_URL` | `https://taccalite.it` |
| `NODE_ENV` | `production` (**required** — gates the secure-secret guard + `Secure` cookie) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
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

## 4. Scheduled jobs (cron)

> ⚠️ **Required for path B — nothing schedules these for you.** Until you add the
> crontab entries below, the outbox never drains (no newsletter/retry mail goes
> out), reminders never fire, and points never expire.

The cron endpoint is secured by the `CRON_SECRET` passed in the **`Authorization:
Bearer`** header (never the query string, which leaks into access logs). Add host
cron entries — a frequent maintenance sweep (which **drains the email outbox**, so
newsletter broadcasts and any retried mail actually go out), the Friday porchetta
reminders, and a daily points-expiry pass:

```bash
crontab -e
# m  h  dom mon dow  command   (replace YOUR_CRON_SECRET)
  */15 * *   *   *   curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" "https://taccalite.it/api/cron?job=maintenance" >/dev/null
  0    9 *   *   5   curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" "https://taccalite.it/api/cron?job=porchetta-reminders" >/dev/null
  0    3 *   *   *   curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" "https://taccalite.it/api/cron?job=points-expiry" >/dev/null
```

`job=all` runs every job at once if you prefer a single entry — but note it also
fires porchetta reminders, so don't schedule `all` frequently or reminders go out
as soon as a booking is made rather than on the Friday.

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
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, then optionally configure a webhook at
`https://taccalite.it/api/checkout/webhook` and set `STRIPE_WEBHOOK_SECRET`. The success
page also finalizes orders as a webhook-free fallback.

## 7. Backups & restore

The entire dataset is the SQLite file under `./data`. The repo ships
`scripts/backup.sh`, which takes a **safe online backup** (no downtime), compresses
it under `./backups`, and prunes copies older than `RETENTION_DAYS` (default 14):

```bash
# One-off
cd /opt/taccalite && ./scripts/backup.sh

# Nightly at 03:00 (crontab -e)
0 3 * * *  cd /opt/taccalite && ./scripts/backup.sh >> /var/log/taccalite-backup.log 2>&1
```

A backup on the same VM is **not** disaster recovery — sync `./backups` off-box
(Hetzner Storage Box / S3 / `rclone`) on a schedule. A quick manual alternative:

```bash
docker compose exec -T app node -e "require('better-sqlite3')('/app/data/taccalite.db').backup('/app/data/backup-'+Date.now()+'.db').then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"
```

better-sqlite3's `.backup()` returns a **Promise**; the older one-liner that
dropped the `.then().catch()` could let the process exit before the copy
finished. The form above (matching `scripts/backup.sh`) waits for completion.

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
- Keep `SESSION_SECRET` and `.env` secret and backed up. Rotating `SESSION_SECRET`
  logs everyone out.
- **Image size (pending optimization, not a blocker):** `output: "standalone"` is
  **not yet enabled** in `next.config.ts` (the line is commented out). The runtime
  image therefore still ships the full `node_modules` plus `tsx` (the entrypoint
  runs `npx tsx scripts/seed.ts` and `npx next start`), which means a larger image
  and wider attack surface than a trimmed standalone build. Enabling standalone
  (with `outputFileTracingIncludes` for the native better-sqlite3 binary + the
  `drizzle/` migrations) is a known follow-up.
