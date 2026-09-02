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
Now: **67 suites / 797 tests**, plus one new e2e test — the product form, which
had never been driven by a browser.

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
2. I said two tests were **genuinely load-sensitive**, passing alone and failing
   in a full run. On a freshly seeded database the full suite has now passed
   **twice consecutively, 52/52**. The most likely explanation for those
   failures is the same accumulated state, not load. I over-attributed to
   flakiness on thin evidence.

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
- **No retries configured.** Correct while failures are deterministic; if a real
  flake ever appears, one will fail the whole run.
- **Coverage is uneven rather than thin.** The money paths are now well covered;
  seven of the nine cron jobs still have no test, and neither does the storefront
  beyond smoke.
- **No coverage measurement at all**, so "well covered" is a judgement rather
  than a number.
