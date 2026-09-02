# System 23 — Quality & Testing

**Readiness: 84 / 100** — *production-solid with a known operational edge*
*(78 at audit; the finding documented and given a remedy 2026-09-02.)*

Scope: the unit suite, the e2e suite, the form harness, stubs, lint config, CI.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 86 | 86 | 25.8 |
| Robustness | 25% | 62 | **78** | 19.5 |
| Security & compliance | 20% | 88 | 88 | 17.6 |
| Observability & operability | 15% | 70 | **84** | 12.6 |
| Test & documentation cover | 10% | 84 | 88 | 8.8 |
| **Total** | | **78** | | **84.3 → 84** |

At the start of this audit programme: **54 unit suites / 685 tests**.
Now: **71 suites / 827 tests**, plus two new e2e tests — the product form and
the lot-recall lookup, neither of which had ever been driven by a browser.

---

## Finding: a local run never reseeds — and I mis-diagnosed it twice

`playwright.config.ts` sets `reuseExistingServer: !process.env.CI`. That skips
the **whole** `webServer.command` when something is already listening on the
port — and the command is `npm run db:seed && npm run dev`. So from the second
local run onwards, **the seed does not run**. The database is seeded once and
every later run inherits whatever the previous one left.

Fixtures therefore accumulate until a capped resource refuses. The first to go
is `admin-operations.spec.ts` "a filtered list can be saved as a view", which
fails with the application correctly reporting *"Hai già 12 viste salvate su
questa pagina"* — the app enforcing its own limit against my leftovers.

**Two corrections to what I reported earlier in this programme.**

1. I said the suite **could not cold-start**, because deleting `.pw-tmp` and
   running produced seven failures. That was wrong: `scripts/seed.ts` opens with
   `{ migrate: true }` and creates its own directory — verified directly. What
   actually happened is the above: a reused server had already recreated an
   empty database, and the seed was skipped, so the tests ran against nothing.
2. I said two tests were **genuinely load-sensitive**, then corrected that to
   "the same accumulated state". **Both were wrong**, and the second correction
   was itself an over-correction made because one fresh run came back green.

   Investigated properly afterwards: `admin-forms.spec.ts` "a table booking
   saves with covers" fails about one run in four, on a fresh database, in
   isolation, and with every change from this programme stashed. The write
   always succeeds — every failed run left the row at `confirmed` — so what
   races is the reservation page reflecting it. Recorded against system 7, where
   it belongs.

   The lesson for this document: one green run is not evidence of
   determinism, and I twice treated it as such.

**Remedy** — `npm run test:e2e:fresh` drops `.pw-tmp` before running, and the
config now carries a comment explaining the trade and naming the canary test.
The default is deliberately unchanged: a full server boot per run is slow, and
the reuse is a reasonable trade for someone iterating on one spec. What was
missing was anyone knowing about it.

---

## What I checked and found clean

- **The unit suite is fast and DB-backed where it matters.** A shared migrated
  SQLite singleton with `fileParallelism: false`, a global setup that wipes the
  file first — with the comment recording why: without it "the fixtures
  accumulate and the suite only passes on its first ever run", which is exactly
  the lesson the e2e side had not yet learned.
- **`server-only` is stubbed** so guarded modules can be exercised under Node,
  and env is pinned to a dev-like profile so `lib/env`'s production secret guard
  does not fire.
- **`submitAndSettle` fails on the action being *refused***, not merely on a row
  not appearing — so a broken form reports its own reason rather than a mystery
  "row not found". That is why the saved-view failure was legible enough to
  diagnose from one line.
- **E2E fixtures are namespaced by a per-run `RUN` constant** in most specs,
  which is the right pattern — it simply has not been applied to saved views.
- **The e2e admin password is pinned in the config**, not inherited, so the
  seeded value is identical locally and on CI.

---

## Still open

- **The `RUN` namespacing is not universal.** Applying it to saved views (and
  anything else capped) would make the suite genuinely re-runnable without the
  reset.
- **No retries configured, and there is at least one real intermittent failure**
  (system 7's status-display race). Until that is fixed, a full run is green
  roughly three times in four — so "the suite passed" needs a moment's thought
  before it means anything.
- **Coverage is uneven rather than thin.** The money paths are now well covered;
  seven of the nine cron jobs still have no test, and neither does the storefront
  beyond smoke.
- **No coverage measurement at all**, so "well covered" is a judgement rather
  than a number.
