# System 24 — Runtime, Config & Deployment

**Readiness: 88 / 100** — *production-solid*
*(82 at audit; the one finding fixed 2026-09-02.)*

Scope: environment variables and their validation, Next config, the Docker image
and compose file, the Caddy reverse proxy, Vercel config, health checks, the
deployment runbook.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 88 | 88 | 26.4 |
| Robustness | 25% | 84 | 84 | 21.0 |
| Security & compliance | 20% | 72 | **90** | 18.0 |
| Observability & operability | 15% | 82 | **90** | 13.5 |
| Test & documentation cover | 10% | 78 | 82 | 8.2 |
| **Total** | | **82** | | **87.1 → 88** |

---

## Finding: default secrets were warned about, never watched — **fixed**

`lib/env.ts` detects two published development defaults still in use outside
development — `CRON_SECRET=dev-cron-secret` and
`ADMIN_PASSWORD=taccalite-admin` — and warns at module load. Deliberately it
does **not** abort: the comment says so, and that is defensible for a
self-hosted shop where refusing to boot over a config nit takes the site down at
three in the morning.

But a warning printed once at startup lives at the top of a log nobody reads
twice. `ADMIN_PASSWORD=taccalite-admin` is in `.env.example` **in this
repository**, and the login page is public — so a deploy that shipped with it is
one guess from full admin, and nothing anywhere would say so after the first
minute of uptime.

**Fixed** — the detection is now an exported `insecureDefaults`, shared by the
boot warning and by `/api/health?checks=full`, which already existed to report
exactly this class of thing: *"the things that fail silently"*. An install on
default secrets now answers **503** to an uptime monitor and names the variables
at fault — **names only, never values**.

That probe is already bearer-authenticated with `CRON_SECRET` and already the
documented place to point a monitor, so this needed no new surface, no new
secret and no change to boot behaviour.

---

## What I checked and found clean

The health check is the best thing here, and it was built for the right reason.

- **`/api/health` runs a real query**, so "healthy" means the process is up *and*
  the database is reachable — not merely that Node is listening. It leaks
  nothing: no versions, paths or error text.
- **`?checks=full` reports what fails silently.** The comment is unusually
  honest: *"A broken relay takes nothing down: the site serves 200 on every
  route while order confirmations and password resets die in the outbox, which
  is how it survived four audits."* It is bearer-gated because "our mail is
  down" is operational detail on a public route, uses a **rolling 24-hour
  window** so an old batch cannot pin the monitor red forever, and treats
  "SMTP host set but credentials blank" as its own degraded state — because the
  relay then rejects every message, where no host at all merely queues them.
- **`isDev` is `NODE_ENV === "development"` exactly**, never `!isProd`, so an
  unset or misspelled `NODE_ENV` cannot unlock development affordances. That is
  what gates simulated payments, which mark an order paid with no money moving.
- **`SESSION_SECRET` was removed, with the reasoning kept.** It was declared,
  warned about and documented as required while nothing read it — so rotating it
  "looked like a revocation lever it never was". Deleting a variable *and*
  writing down why is rarer and better than leaving it.
- **`TRUST_PROXY` gets its own boot warning**, because it fails silently in both
  directions: off behind a proxy means every visitor shares one rate-limit
  bucket and normal traffic hits 429.
- **Security headers travel with the application**, not with one operator's
  reverse proxy (system 20) — two of the three documented deploy paths would
  otherwise ship with none.

---

## Still open

- **Nothing verifies a backup can be restored.** `scripts/backup.sh` and
  `backup-container.sh` exist; no drill reads one back. Carried from system 22.
- **Three deploy paths, one of them unexercised here.** Docker/Caddy, Coolify and
  Vercel/Turso are all documented in `DEPLOYMENT.md`; only the local file path is
  covered by tests, and the remote Turso branch skips the local pragmas on the
  assumption that Turso manages them.
- **The container healthcheck uses the plain probe**, so a container is "healthy"
  with mail entirely broken. That is the right split — but it means the full
  check only helps someone who has actually pointed a monitor at it, and nothing
  in the runbook verifies that anyone did.
- **`ephemeralDatabase` mode on Vercel warns loudly but still serves.** Correct
  for a demo; there is no way to assert "this must never be a real shop".
