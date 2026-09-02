# System 22 — Data Layer & Migrations

**Readiness: 85 / 100** — *production-solid*
*(72 at audit; the one finding fixed 2026-09-02.)*

Audited out of turn: the finding below had already surfaced twice while testing
other systems' concurrency guards, and it undermined all of them.

Scope: the schema, the libSQL client and connection handling, migrations,
seeding, query helpers, settings storage.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 86 | 88 | 26.4 |
| Robustness | 25% | 45 | **86** | 21.5 |
| Security & compliance | 20% | 85 | 85 | 17.0 |
| Observability & operability | 15% | 78 | 78 | 11.7 |
| Test & documentation cover | 10% | 60 | **82** | 8.2 |
| **Total** | | **72** | | **84.8 → 85** |

---

## Finding: every transaction after the first ran with no busy timeout — **fixed**

`applyLocalPragmas` sets `PRAGMA busy_timeout = 5000` at boot, and its comment
already records why that matters — the default of 0 means *any* contention fails
instantly. But `busy_timeout` is a **per-connection** setting, and the libSQL
sqlite3 driver hands each `transaction()` the current connection and then drops
its reference so the next caller lazily opens a **fresh** one:

```js
async transaction(mode = "write") {
    const db = this.#getDb();
    executeStmt(db, transactionModeToBegin(mode), this.#intMode);
    this.#db = null; // A new connection will be lazily created on next use
```

Verified directly against the driver: open a client, set the pragma, take a
transaction, and the next connection reports `busy_timeout: 0` again.

So the pragma protected exactly one connection, and every transaction after the
first ran with **no timeout at all**. Any contention threw a raw `SQLITE_BUSY`
straight out of a checkout, a stock movement, a points debit or a coupon count —
in a codebase that otherwise takes concurrency seriously, and whose comments
claim a transaction "locks the row from the first read and nothing interleaves".

It was also **losing writes**, not merely erroring: eight concurrent
read-modify-write transactions landed fewer than eight increments. And it
lingered — a contended commit left the file busy long enough to knock over the
*next sequential* caller, which is why two test suites had to be ordered around
it.

**Fixed** — `wrapDrizzle` now returns a proxy that retries a whole transaction
on `SQLITE_BUSY`, five attempts with jittered exponential backoff.

Retrying the **callback** is the right shape rather than raising a timeout: a
transaction that lost the write lock has been rolled back, so there is nothing
to resume, only something to redo. Every transaction callback in this codebase
is already safe to re-run — each re-reads its rows inside the transaction and
claims what it needs with a conditional `UPDATE`, so a replay either wins or
refuses on the rule. The jitter stops two racers colliding again in step.

Three tests, two of which were confirmed to fail — throwing, and losing updates
— against the unfixed code.

**What this unlocked.** The concurrency guards audited in systems 6 and 11 now
fail the way they were designed to: their tests previously had to accept "a
refusal *or* a driver error", and can now assert the sentence the operator
actually sees.

---

## What I checked and found clean

- **Foreign keys are on.** I suspected they shared the per-connection problem —
  they do not: the driver enables them by default and a fresh connection reports
  `foreign_keys: 1`. The RESTRICT constraints the codebase leans on (categories,
  shops, delivery zones, reservations) are genuinely enforced, so every comment
  that says "the FK would reject this anyway" is telling the truth.
- **The connection is a true singleton on `globalThis`**, with the reason
  written down: Next bundles server code per route, so a module-level instance
  would be duplicated per route bundle — and in ephemeral demo mode that would
  mean a *separate empty in-memory database* per route.
- **A gated proxy enforces "migrate before first query"** despite module init
  being synchronous, and a broken boot is surfaced loudly rather than as an
  unhandled rejection.
- **Ephemeral mode is loud**, warning that nothing persists — correct for a
  demo, and impossible to mistake for a real deployment.
- **`applyLocalPragmas` orders `busy_timeout` first**, and says why: WAL needs a
  brief exclusive lock, and a throw there used to abort the function before
  `foreign_keys = ON` ran.
- **Expression indexes are hand-written** in `drizzle/0033` with a comment
  warning that a future table rebuild will silently drop them, exactly like the
  FTS tables in `0024`.

---

## Still open

- **The retry ceiling is a guess.** Five attempts over roughly a second suits a
  two-counter shop; a busier install would want the numbers tuned, and there is
  no metric that would say so.
- **Nothing reconciles ledgers against balances** — carried from system 2, and
  still the right home for it.
- **No restore drill.** `scripts/backup.sh` exists; nothing verifies a backup can
  be read back.
- **The remote (Turso) path skips the local pragmas entirely** and is assumed to
  manage journaling and foreign keys itself. True per Turso's documentation, and
  untested here because the suite runs against a file.
