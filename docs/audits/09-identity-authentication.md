# System 9 — Identity & Authentication

**Readiness: 89 / 100** — *state of the art, with named residuals*
*(83 at audit; the one finding fixed 2026-09-02.)*

Scope: password hashing, sessions, email verification, password reset, order
claiming, TOTP 2FA, recovery codes, rate limiting, staff roles.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 84 | **92** | 27.6 |
| Robustness | 25% | 86 | **90** | 22.5 |
| Security & compliance | 20% | 86 | 88 | 17.6 |
| Observability & operability | 15% | 88 | 88 | 13.2 |
| Test & documentation cover | 10% | 62 | **82** | 8.2 |
| **Total** | | **83** | | **89.1 → 89** |

`vitest` 743 / 59 (was 739 / 58) · `tsc` and `eslint` clean.

---

## Finding: the lockout was a ratchet, not a budget — **fixed**

`failedLoginCount` was only ever reset by a **successful** login. So once an
account had been locked once, it stayed pinned at the threshold: the next single
wrong password — fifteen minutes later, or a month later — was attempt eleven of
ten, and locked the account for another quarter of an hour.

Two consequences, both quiet:

- A customer who mistypes their password once, months after an old lockout, is
  told to wait fifteen minutes. Ten tries had silently become **one try per
  fifteen minutes, permanently**.
- Anyone who knows an address can hold that account shut indefinitely with one
  request every fifteen minutes — a lockout DoS that costs the attacker four
  requests an hour.

**Fixed** — serving the lock pays the debt. When `registerFailedAttempt` sees a
lock stamp that has already elapsed, the count restarts at 1 and the stale stamp
is cleared, so `lockedUntil` always describes a lock that is either live or
absent. Four tests; two of them confirmed to fail against the unfixed code.

---

## What I checked and found clean

This is a carefully built system, and most of what I went looking for was
already there.

- **Emailed tokens are exemplary.** Only a SHA-256 lands in the database, so a
  backup or a read-only injection cannot mint a session. Redemption is a single
  atomic `UPDATE … WHERE used_at IS NULL RETURNING`, so two clicks on the same
  link cannot both succeed. Issuing supersedes any outstanding token of the same
  purpose — so "resend the email" kills the first link, which is exactly the
  moment a customer suspects something is wrong. Reset lives one hour,
  verification twenty-four, and expired rows are garbage-collected by the
  maintenance sweep.
- **Rate limiting is layered and durable.** Sensitive routes use
  `rateLimitDurable`, backed by the `rate_limits` table rather than process
  memory, so limits survive a restart. Password reset carries **both** a per-IP
  and a per-address limit; login carries a per-IP limit *and* the account
  lockout above, which is the stronger of the two answers to credential
  stuffing.
- **Password reset is not an oracle.** It returns the same message and does
  roughly the same work whether or not the address is registered, and a
  malformed address gets the identical answer because anything reaching there
  having failed client validation is probing.
- **The account-lock check runs before the password verdict is acted on**, so a
  locked account answers the same way whether or not the guess was right.
- **`DUMMY_PASSWORD_HASH` equalises timing** for an unknown identifier.
- **2FA is genuinely enforced at login**, with single-use recovery codes marked
  spent *before* the session is issued, so a code cannot be replayed. Failed
  password and failed 2FA attempts are audited separately.
- **Hashes are opportunistically upgraded** when KDF parameters change — the one
  moment the plaintext is in hand — so accounts harden without anyone being told
  to rotate.
- **Session cookies**: 32 random bytes, `httpOnly`, `secure` (env-gated for
  local http), `sameSite=lax`, bounded `maxAge`. Sessions are destroyed on
  password change and reset.
- Weakening the second factor now requires the password (system 20).

---

## Still open

- **A locked account announces itself.** "Troppi tentativi falliti, riprova tra
  N minuti" can only be produced by an account that exists, so it confirms
  registration to anyone probing. This is a deliberate usability trade-off and I
  have left it: telling a locked-out shopkeeper why they cannot get in, while
  they are typing the right password, is worth more than closing an oracle that
  the reset flow already refuses to open.
- **`clientIp` collapses to one shared bucket unless `TRUST_PROXY` is set**,
  because forwarded headers are otherwise spoofable. Conservative rather than
  bypassable, but it makes every per-IP limit far blunter than it reads.
  Production behind Caddy should set it.
- **No re-authentication window** — see system 20.
- **Login has no per-identity rate limit**, only the lockout. That is the right
  primary control, but a distributed attacker gets `LOCK_THRESHOLD` guesses per
  account per fifteen minutes regardless of how many IPs they spend.

---

## Files changed

| File | Change |
|---|---|
| `lib/auth/service.ts` | a served lockout restarts the failure budget and clears the stale stamp |
| `test/auth-lockout.test.ts` | **new** — 4 tests |
