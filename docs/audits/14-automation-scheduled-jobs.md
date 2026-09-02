# System 14 — Automation & Scheduled Jobs

**Readiness: 86 / 100** — *production-solid*
*(76 at audit; the one finding fixed 2026-09-02.)*

Scope: nine cron jobs — porchetta and table reminders, reservation auto-close,
points expiry, pickup auto-fulfil, abandoned-order sweep, maintenance, the
owner's digest, Instagram token refresh — plus the secured entry point.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 88 | 88 | 26.4 |
| Robustness | 25% | 84 | 86 | 21.5 |
| Security & compliance | 20% | 90 | 90 | 18.0 |
| Observability & operability | 15% | 40 | **86** | 12.9 |
| Test & documentation cover | 10% | 58 | **74** | 7.4 |
| **Total** | | **76** | | **86.2 → 86** |

---

## Finding: a failing job told nobody — **fixed**

`runCronJob` never throws, records every outcome — success or failure, with the
error message — and one job failing cannot stop the others. All correct.

But those records surfaced in exactly **one** place: a panel on
`/admin/settings`, which an operator opens roughly never. So a job that started
throwing kept throwing, every night, in silence. No porchetta reminders went
out, or no abandoned checkouts were swept, or no scheduled campaign sent — and
the first anybody heard of it was a customer saying nobody had called.

Nine jobs mutate seven other systems with no user watching. Writing the outcome
somewhere nobody reads is not observability.

**Fixed** — a new `automationTrouble()` reports jobs that failed last run or
have not reported in for 36 hours, and the **daily owner digest** carries them.
That is the one message the owner already reads every morning, so a silent
failure becomes a line in it.

Two deliberate choices:
- **Nothing is said on a healthy day.** A line every morning saying "all fine"
  is a line nobody reads by the third week.
- **A job that has never run is not trouble.** Pickup auto-close and points
  expiry both idle until configured; silence there is a setting, not a fault.

This cannot detect the scheduler dying outright — nothing running *inside* the
scheduler can. But that case announces itself by the digest not arriving,
whereas one job quietly failing announced nothing at all.

Four tests.

---

## What I checked and found clean

- **The cron endpoint is properly secured**: the secret is compared with
  `timingSafeEqual`, accepted **only** from the `Authorization` header and never
  the query string — with the reason written down, that a query string leaks
  into proxy and access logs.
- **Every job is idempotent under the frequent `job=all` sweep.** Reminders stamp
  `remindedAt` and exclude stamped rows; the digest self-limits to one send per
  ISO day; the Instagram refresh self-limits to weekly; auto-fulfil and the
  abandoned sweep both work off claim-style predicates.
- **A hard send failure leaves the stamp unset**, so it retries on the next run
  rather than being swallowed for a day. The digest only marks the day done on a
  successful send.
- **The abandoned-order sweep is restricted to card orders**, so it cannot cancel
  a "pago al ritiro" order the shop has already set goods aside for.
- **Jobs are declared in one registry** with operator-facing labels and
  descriptions, which is what makes the settings panel self-documenting.
- The campaigns job is imported lazily to break a genuine circular import, and
  says so.

---

## Still open

- **No alerting on total scheduler death.** Covered only by the absence of the
  digest. A real answer is an external uptime check hitting `/api/health`, which
  belongs to system 24.
- **Job coverage by tests is thin** — `runPickupAutoFulfil` and the new health
  reporting are tested; the other seven jobs are not.
- **`runCronJob` records into `settings`**, so the run history is one record per
  job rather than a series. Enough to answer "is it working", not "when did it
  last do anything".
