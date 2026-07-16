# Deploying Taccalite to Hetzner

Self-hosted stack: **Docker Compose** running the Next.js app + **Caddy** (automatic
TLS) in front, with **SQLite** persisted on a host volume. Designed for a single small
Hetzner Cloud VM.

---

## 1. Provision the server

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

Set at minimum in `.env`:

| Variable | Value |
| -------- | ----- |
| `NEXT_PUBLIC_SITE_URL` | `https://taccalite.it` |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 16` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | the owner's admin login |
| `OWNER_EMAIL` | where reservation/order notifications go |
| SMTP\_\* / `MAIL_FROM` | when you have real email (see §5) |
| `STRIPE_*` | when you enable payments (see §6) |

Edit **`Caddyfile`** and replace `taccalite.it` with your real domain.

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
(log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` — change the password after first login).

## 4. Scheduled jobs (porchetta reminders)

Add a host cron entry (e.g. every Friday 09:00) to hit the secured cron endpoint:

```bash
crontab -e
# m h  dom mon dow  command
  0 9  *   *   5    curl -s "https://taccalite.it/api/cron?job=porchetta-reminders&secret=YOUR_CRON_SECRET" >/dev/null
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
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, then optionally configure a webhook at
`https://taccalite.it/api/checkout/webhook` and set `STRIPE_WEBHOOK_SECRET`. The success
page also finalizes orders as a webhook-free fallback.

## 7. Backups & restore

The entire dataset is the SQLite file under `./data`.

```bash
# Backup (safe while running — SQLite online backup)
docker compose exec app npx tsx -e "require('better-sqlite3')('/app/data/taccalite.db').backup('/app/data/backup-'+Date.now()+'.db')"
# …or simply copy the folder when low-traffic:
tar czf taccalite-data-$(date +%F).tgz data/
```

Automate with a nightly cron copying `data/` off-box (e.g. to Hetzner Storage Box / S3).
**Restore:** stop the stack, replace `data/taccalite.db`, start again.

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
