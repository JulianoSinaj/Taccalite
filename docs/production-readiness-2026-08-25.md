# Production readiness — what would break on launch day (2026-08-25)

_Method: this pass deliberately does **not** re-read the admin surface (that was
[`admin-gap-audit-2026-08.md`](./admin-gap-audit-2026-08.md), all 30 closed). Instead it asks the
question that static review cannot answer: **build it, run it as production, and see what actually
happens.** A production build was started with `NODE_ENV=production` against a copy of the seeded
database, and every one of the 52 public and admin routes was requested over HTTP; orders were
placed through the real API; auth, CSRF and rate-limit boundaries were probed with live requests._

Baseline before any of this: `tsc --noEmit` clean, **456/456 Vitest pass**, `eslint` 0 errors,
`next build` succeeds. Every finding below is invisible to all four.

---

> **§1–§5 and §11 fixed, 2026-08-25.** Each section is left as written so the reasoning survives;
> [§13](#13-what-shipped) records what each fix was and where it lives. §6 (legal pages), §7 (docs),
> §8 (monitoring), §9 (offsite backups) and §10 (stock reservation) are **still open** — they need
> the owner's policy text, an infrastructure decision, or work larger than this pass.

## 0. Headline

The codebase is in good shape. Auth boundaries hold (`307` on every admin page while signed out,
`403` on every admin API), CSRF rejects cross-origin POSTs, the cron endpoint refuses a wrong
bearer token, all 52 routes render without hitting an error boundary, analytics is genuinely
cookieless, and data retention is implemented.

The problems are of three kinds:

| Kind | Count | Worst example |
| ---- | ----- | ------------- |
| **A green light that is lying** | 1 | Settings reports SMTP "connesso e autenticato" while every email fails |
| **Correct on one deploy path, absent on the others** | 3 | Security headers exist only in the Caddyfile; the *recommended* path is Coolify |
| **Silent partial success** | 2 | A €60 cart becomes a €10 order with no error shown to anyone |

---

## 1. 🔴 BLOCKER — the SMTP status page reports success while every email fails

`.env.example` ships `SMTP_HOST` **pre-filled** with Brevo's relay and the two credentials blank:

```
SMTP_HOST=smtp-relay.brevo.com     # pre-filled
SMTP_USER=                          # blank
SMTP_PASS=                          # blank
```

Three things follow from that host being non-empty, and all three point the wrong way.

**1. The warning banner is suppressed.** `smtpConfigured` is `env.smtp.host !== ""`
([`lib/env.ts`](../lib/env.ts)), so it reads `true`. The red *"Email non configurata"* banner in
[`app/admin/(dash)/layout.tsx:92`](../app/admin/(dash)/layout.tsx#L92) is gated on `!smtpConfigured`
and therefore never renders. Verified against the running server — the banner is absent.

**2. The settings page actively claims success.** `getTransport()` sets
`auth: env.smtp.user ? {...} : undefined`, so with a blank user the transport carries **no
credentials at all**. `checkMailer()` then calls `transport.verify()`, which with no credentials
only connects and greets — it never attempts `AUTH`. Brevo answers the greeting happily, so
`verify()` resolves and `/admin/settings` prints:

> **Stato: connesso e autenticato**

**3. Every actual send fails.** Proven directly against the same transport configuration:

```
verify() with NO auth  -> RESOLVED (reported as 'connesso e autenticato')
sendMail               -> FAILED: Mail command failed: 502 5.7.0 Please authenticate first
```

And in the outbox after placing one real order:

```
failed  att=1  audit@example.it     Ordine ricevuto · ORD-2026-349729   502 5.7.0 Please authenticate first
failed  att=1  owner@example.com    Nuovo ordine · ORD-2026-349729      502 5.7.0 Please authenticate first
```

**Why this is the worst finding.** `drainOutbox` retries to `OUTBOX_MAX_ATTEMPTS = 5` and then stops
forever. So password-reset links, order confirmations, reservation notices and back-in-stock alerts
are not delayed — they are **destroyed**, while the two surfaces built specifically to warn about
exactly this both report green. An operator who follows `.env.example` verbatim and forgets the two
Brevo blanks has no signal anywhere that the whole transactional-email system is dead.

There is a second-order effect: the first sends against an unreachable relay blocked the request for
long enough to time out a 30-second client, and an order sends **two** emails serially. The order row
is committed first, so the customer sees a hung checkout on an order that exists — and retries.

**Fix.** `smtpConfigured` must require credentials, not just a host — and the status check must
exercise the path that actually sends. The pre-filled `SMTP_HOST` in `.env.example` is what converts
a loud failure into a silent one; it should ship empty, with Brevo's host in a comment.

---

## 2. 🔴 A cart silently loses lines, and nobody is told

[`lib/orders.ts:133`](../lib/orders.ts#L133) resolves cart slugs against products that are
`purchasable AND active`, then drops anything it did not find:

```ts
.filter((x): x is NonNullable<typeof x> => x !== null);
if (lines.length === 0) throw new Error("Nessun prodotto valido nel carrello");
```

`length === 0` throws. A **partial** match does not. Confirmed with a test against the real
`createOrder`:

```
>>> customer submitted 2 items totalling 6000c
>>> order created with 1 line(s), total 1000 c
>>> lines: Prodotto disponibile
```

The cart lives in `localStorage` indefinitely ([`components/store/cart.tsx`](../components/store/cart.tsx))
and `CheckoutClient` re-validates only the discount code — never the basket. So any product the shop
deactivates silently rewrites the orders of everyone holding it in a cart. For a card order the
customer lands on Stripe showing a total they never agreed to; for a *pagamento in bottega* order
they arrive at the counter expecting goods that were never on the order.

**Fix.** Compare resolved lines against requested items and refuse the order naming what is gone, the
same way the stock shortage a few lines below already does.

---

## 3. 🟠 Security headers exist on exactly one of the three deploy paths

Every header is in the [`Caddyfile`](../Caddyfile) — HSTS, CSP, `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`. `next.config.ts` defines **no `headers()`**, so:

| Path | Docs say | Security headers |
| --- | --- | --- |
| Coolify (§0) | **"recommended"** | ✗ none |
| Docker Compose + Caddy (§1) | path B | ✓ full set |
| Vercel (§V) | | ✗ none (`vercel.json` has only `crons`) |

The path the deployment guide labels *recommended* is the one that ships with no CSP, no HSTS and no
clickjacking protection. Measured on the running server, the app's own response carries none of them
and adds `X-Powered-By: Next.js`, which leaks on all three paths.

**Fix.** Move the header set into `next.config.ts` `headers()` so it travels with the app rather than
with one operator's reverse proxy, and set `poweredByHeader: false`. Note the CSP's
`img-src 'self'` is already correct — Instagram and Blob images are proxied through `/_next/image`
(verified), so they are same-origin.

---

## 4. 🟠 `robots.txt` bakes in the wrong domain at build time

`app/sitemap.ts` declares `export const dynamic = "force-dynamic"`. [`app/robots.ts`](../app/robots.ts)
does not — so the build output prerenders it as `○ (Static)` and freezes `absoluteUrl()` into
`.next/server/app/robots.txt.body`. The two disagree at runtime:

```
robots.txt   Sitemap: http://localhost:3000/sitemap.xml   ← baked at build
sitemap.xml  <loc>http://localhost:3100/</loc>            ← resolved at request
```

In the Docker image this is worse, because [`.dockerignore`](../.dockerignore) excludes `.env`: the
build has no `NEXT_PUBLIC_SITE_URL` at all, so `robots.txt` ships hardcoded to the
`isProd` fallback `https://taccalite.it` regardless of the domain actually deployed. It happens to be
right if the domain is exactly that, and is wrong — unfixable without a rebuild — for `www.`, a
staging host, or any rename.

**Fix.** One line: `export const dynamic = "force-dynamic"` in `app/robots.ts`, matching `sitemap.ts`.

---

## 5. 🟠 `TRUST_PROXY=false` collapses every rate limit into one global bucket

`clientIp()` returns the **constant string** `"untrusted-proxy"` when `TRUST_PROXY` is off
([`lib/rate-limit.ts:41`](../lib/rate-limit.ts#L41)), so every visitor on the internet shares one
counter. Demonstrated against the running server with twelve distinct source IPs:

```
req  1 from 203.0.113.1   → 400     ← reached the handler
...
req 10 from 203.0.113.10  → 400
req 11 from 203.0.113.11  → 429     ← throttled
req 12 from 203.0.113.12  → 429
```

That is `checkout` at 10/min **for the entire shop**, `prenotazioni` at 6/min, `contatti` at 4 per 5
minutes, `login` at 10/min. The eleventh customer of the minute cannot buy anything.

To be fair to the code: all three deployment paths document setting it (`docker-compose.yml` sets it
directly, §0 and §V.3 both list it). The gap is that getting it wrong is **silent and total** — there
is no boot warning and no admin banner, unlike the same file's treatment of `SESSION_SECRET`.

**Fix.** Add `TRUST_PROXY` to the `enforceSecurity` warning block in `lib/env.ts`, and an admin banner
next to the SMTP one.

---

## 6. 🟡 No terms of sale, and no privacy notice at any point of collection

`app/(site)/` has `privacy` and `cookie`. It has **no** terms-of-sale page, and no statement of
withdrawal rights — including the exemption that actually matters here (fresh and perishable food is
excluded from *diritto di recesso*, Codice del Consumo art. 59). For a shop selling food at a distance
this is pre-contractual information the site is required to give.

Separately, measured on all four data-collection forms — `/checkout`, `/prenotazioni`, `/contatti`,
`/newsletter` — the **only** privacy link on the page is the one in the global footer. GDPR art. 13
wants the notice at the moment data is obtained. The newsletter is the strongest of the four (it does
proper double opt-in via `/api/newsletter/confirm`), and still collects an address with no notice
beside the field.

This one needs the owner's actual policy text, so it is a content task, not only a code task.

---

## 7. 🟡 `SESSION_SECRET` is never read by anything

Grepped across `lib`, `app`, `components`, `scripts`: `env.sessionSecret` has **zero** references
outside the block in `lib/env.ts` that warns about its own default. Sessions are opaque 32-byte
random DB tokens (`lib/auth/session.ts`), which is a good design — but two documents describe it as
load-bearing when it is not:

- `.env.example`: *"Sign cookies … MUST be set in production."* It signs nothing.
- `DEPLOYMENT.md` §9: *"Rotating `SESSION_SECRET` logs everyone out."* It does not; rotating it has
  no effect whatsoever.

Harmless today, but it is a live trap: an operator who believes rotation is their revocation lever
has no working way to revoke sessions, and the next person to add signed tokens will assume a
high-entropy value is guaranteed present.

---

## 8. 🟡 Nothing watches production

No Sentry, no OpenTelemetry, no `instrumentation.ts`, no uptime check. The 16 `console.error` calls go
to the docker `json-file` driver capped at 10 MB × 3 files. `/api/health` exists and is good, but only
Docker and Caddy consume it — nothing pages a human. A 500 at 02:00, a full disk, or the SMTP failure
in §1 all fail invisibly.

Cheapest meaningful step: an external uptime monitor on `/api/health` plus an owner email on repeated
outbox failures (the data is already in the table).

---

## 9. 🟡 Backups never leave the machine

[`scripts/backup.sh`](../scripts/backup.sh) takes a correct online `VACUUM INTO` snapshot and prunes
to `RETENTION_DAYS` — and its own header says *"a copy on the same VM is not a backup"*. `DEPLOYMENT.md`
§7 repeats the warning. Nothing implements it: there is no `rclone`/S3/Storage-Box step anywhere, and
the restore procedure is documented but has never been exercised. Coolify (§0, recommended) has no
`scripts/backup*.sh` at all — it deploys the app container only — so its backup story is "snapshot the
volume", by hand.

---

## 10. 🟡 The Stripe window is unreserved

`orders.stockAppliedAt` is a clean atomic claim, and `in_store`/`on_delivery` orders take stock at
placement. A **card** order takes it only at payment, and the Checkout Session lives 30 minutes
(`SESSION_TTL_SECONDS`). `createOrder`'s shortage check runs before that window opens, and
`applyStockChange` floors at zero. So two customers can both pass the check on the last item, both
pay, and one gets nothing — with no oversell alert anywhere.

Low likelihood at this shop's volume, and the fix (a reservation with a TTL) is real work. Worth
knowing about rather than fixing blind.

---

## 11. 🔵 Smaller things

- **`eslint.config.mjs` doesn't ignore `.claude/`.** 135 of 140 warnings come from vendored skill
  scripts (`modern-screenshot.umd.js` alone contributes 78), burying the 5 real ones. One `ignores`
  entry makes the lint output trustworthy again.
- **CSP uses `script-src 'unsafe-inline'`**, which defeats most of its XSS value. Documented as a
  known limitation in the Caddyfile; Next 16 supports nonces via middleware if it's worth doing.
- **`lib/directions.ts:10` carries `TODO(owner): verify the parking / bus details below on the
  ground`** — unverified wayfinding text on a live page telling customers where to park.

---

## 12. What was verified as working

Recorded so a later pass doesn't re-audit it:

- All 52 routes render — 15 public, 13 dynamic public, 37 admin pages, 6 admin API routes, plus every
  detail page (order, packing slip, reservation, customer, product, blog, shop, category, reward,
  discount). No error boundary hit, no 5xx.
- Signed out: `307` on every `/admin/*` page, `403` on every `/api/admin/*`.
- Cross-origin `POST` to `/api/checkout` and `/api/auth/login` → `403`.
- `/api/cron` → `401` with no token and with a wrong token (constant-time compare).
- `/negozi` → `/sedi` redirects return `308`.
- Analytics stores no IP, no cookie, and refuses self-referrers and `/admin`+`/api` paths.
- Retention is implemented for sessions, auth tokens, rate limits, outbox, audit log **and** page
  views (`analytics.retentionDays`, default 365).
- Admin lists paginate at `PAGE_SIZE = 25`.
- Order creation, VAT snapshot, discount validation and the stock claim all behave as documented.

---

## 13. What shipped

Verified end to end: `tsc` clean, **472 Vitest pass** (456 + 16 new), `eslint` 0 errors and
**5 warnings down from 140**, `next build` clean, and all 46 routes re-requested against a
production server with no error boundary hit.

| § | Fix | Where |
| --- | --- | --- |
| 1 | `smtpAuthConfigured` — host **and** both credentials. Separate from `smtpConfigured`, which still selects the transport, so an anonymous localhost relay keeps working | [`lib/env.ts`](../lib/env.ts) |
| 1 | `checkMailer()` returns `authenticated` separately from `ok`, because `verify()` never issues AUTH without credentials | [`lib/mail/mailer.ts`](../lib/mail/mailer.ts) |
| 1 | Settings gained a third state: **"connesso ma senza credenziali"** (amber) instead of a green lie | [`settings/page.tsx`](../app/admin/(dash)/settings/page.tsx) |
| 1 | Admin banner gated on `!smtpAuthConfigured`, with copy for each of the two failure shapes | [`(dash)/layout.tsx`](../app/admin/(dash)/layout.tsx) |
| 1 | `.env.example` no longer pre-fills `SMTP_HOST`; Brevo's host is a comment, with the trap explained | [`.env.example`](../.env.example) |
| 2 | A basket that loses any line is refused by name/count, not trimmed | [`lib/orders.ts`](../lib/orders.ts) |
| 3 | Full header set + `poweredByHeader: false` moved into the app; `unsafe-eval` and `upgrade-insecure-requests` are production-gated; `IMAGE_HOSTS` sits beside `remotePatterns` so CSP and images cannot drift | [`next.config.ts`](../next.config.ts) |
| 4 | `export const dynamic = "force-dynamic"` — robots.txt went from `○ Static` to `ƒ Dynamic` | [`app/robots.ts`](../app/robots.ts) |
| 5 | Boot warnings for `TRUST_PROXY` off and for either SMTP failure shape | [`lib/env.ts`](../lib/env.ts) |
| 11 | `.claude/**` added to `globalIgnores` | [`eslint.config.mjs`](../eslint.config.mjs) |

16 regressions in [`test/production-readiness.test.ts`](../test/production-readiness.test.ts),
including a fake SMTP relay that greets but never authenticates — the exact shape that produced the
false green.

### Measured before → after

```
banner on /admin (host set, no creds)   absent            → shown
/admin/settings status                  "connesso e autenticato"
                                                          → "connesso ma senza credenziali"
boot warnings on that config            none              → 2
partial basket via POST /api/checkout   201, order trimmed → 400 "non è più disponibile"
security headers on the app itself      none + X-Powered-By → 6 headers, no X-Powered-By
robots.txt vs sitemap.xml               :3000 vs :3100    → :3100 vs :3100
rate limit, 3 IPs × 5 requests          shared bucket → 429 → per-IP, all reached the handler
eslint                                  140 warnings      → 5
```

### Still to do before launch

Nothing in this list is code I could write without a decision from you:

1. **Set `SMTP_USER`/`SMTP_PASS`** (§1). The guards now shout about it, but the mail still does not
   send until the two Brevo values are in. Note the working copy's own `.env` is in exactly the
   broken state — host set, credentials blank — so local dev is hitting Brevo and failing too.
2. **Confirm `TRUST_PROXY=true`** on whichever path you deploy (§5). Compose sets it; Coolify and
   Vercel need it entered by hand.
3. **Terms of sale + recesso, and a privacy link on each form** (§6) — needs the shop's policy.
4. **An uptime check on `/api/health`** and something that notices repeat outbox failures (§8).
5. **Ship `./backups` off-box** (§9), and rehearse a restore once.
6. Correct or remove the `SESSION_SECRET` claims in `.env.example` and `DEPLOYMENT.md` §9 (§7).
