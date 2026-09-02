# System 20 — Security, Audit & Compliance

**Readiness: 88 / 100** — *production-solid*
*(81 at audit; the one finding fixed 2026-09-02.)*

Cross-cutting: origin/CSRF checking, the audit log, role and shop
authorisation, the security console, staff session management, GDPR posture,
security headers.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 88 | 90 | 27.0 |
| Robustness | 25% | 85 | 85 | 21.3 |
| Security & compliance | 20% | 70 | **88** | 17.6 |
| Observability & operability | 15% | 90 | 92 | 13.8 |
| Test & documentation cover | 10% | 72 | **85** | 8.5 |
| **Total** | | **81** | | **88.2 → 88** |

`vitest` 739 / 58 (was 733 / 57) · `tsc` and `eslint` clean.

---

## Finding: the second factor could be removed with only a session — **fixed**

`disableTotp` and `regenerateRecoveryCodes` (admin) and `disableOwnTotp` /
`regenerateOwnRecoveryCodes` (customer) all did their work behind
`requireAdmin()` / `requireUser()` and a confirm dialog — nothing more.

Holding a live session was therefore the only thing between somebody at an
unlocked gestionale, or riding a stolen session cookie, and an account back down
to a single factor. Worse, the same session could mint a **fresh batch of
recovery codes** — a durable, offline way back in — with the legitimate holder
none the wiser until they next tried their own. A second factor exists precisely
to survive a compromised first one; removable by the session it is protecting,
it is decoration.

**Fixed** — a shared `assertPassword` guard in `lib/auth/enrolment.ts` fronts
both operations, so the fix lands once for the back office and the storefront
alike (the module was already written guardless and route-agnostic for exactly
this reason). A failed attempt writes `security.reauth_failed` to the audit log,
so grinding at it leaves a trail. The password is the right proof rather than a
TOTP code: the threat is somebody with the session but not the credentials, and
demanding the authenticator would also lock out the person whose legitimate
reason for disabling 2FA is that they no longer have it.

Both UIs now carry a "Conferma con la password" field. Six tests, covering
blank, wrong and correct passwords on both operations.

---

## What I checked and found clean

- **CSP is thorough and travels with the app**, not with one operator's reverse
  proxy — `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`,
  `form-action 'self'`, and `unsafe-eval` explicitly confined to dev. Plus
  nosniff, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS
  in production. The comments show it was moved out of the `Caddyfile` after
  someone noticed two of the three documented deploy paths shipped with none of
  it.
- **`isSameOrigin` is applied to every hand-rolled `POST /api/*`**, and its
  three documented exemptions are each correct: the Stripe webhook is
  signature-authenticated, cron is bearer-authenticated, and the newsletter
  GET links are followed from email so carry no same-origin header. A missing
  Origin *and* Referer is treated as cross-origin and refused.
  - The `host`-derived fallback origin is not a hole: a browser sets `Host` from
    the URL it is fetching, so it cannot be forged into matching an attacker's
    `Origin`, and a non-browser client that could forge both has no victim
    cookie to spend.
- **The audit log is insert-only.** Nothing in the codebase updates or deletes
  `audit_log`; the admin surface reads and filters it, nothing more. Coverage is
  broad — 50+ distinct action types across orders, catalogue, categories,
  fulfilment, loyalty, GDPR, closures, campaigns, automation and auth — and
  `logAudit` swallows its own errors by design so an audit write can never fail
  the action it records.
- **Sessions are destroyed on password change and reset** (`deleteUserSessions`),
  and `signOutOtherSessions` gives an operator a self-service revoke.
- **2FA is genuinely enforced at login**, with single-use recovery codes as the
  fallback.
- **Shop scope is applied at all three of its documented points** — list query,
  detail page, mutating action — with the two gaps found in systems 1 and 3 now
  closed.

---

## Still open

- **No re-authentication window.** The new guard asks for the password every
  time. That is the right default for two rare operations, but there is no
  general "recently authenticated" concept, so any future step-up will re-invent
  this.
- **The rate limiter is in-memory and per-process** (`lib/rate-limit.ts` says
  so). Correct for the single-instance deployment this ships as; it silently
  stops being a limit if the app is ever horizontally scaled.
- **`TRUST_PROXY` must be set in production** or every client shares one rate
  limit bucket. Conservative rather than bypassable, but it makes the limits far
  blunter than they read.
- **The audit log is append-only by convention, not by constraint.** Nothing
  stops a future `db.delete(auditLog)`, and there is no hash chain, so it is
  tamper-*evident* only to the extent that nobody has written the code to tamper
  with it.

---

## Files changed

| File | Change |
|---|---|
| `lib/auth/enrolment.ts` | `assertPassword` step-up guard; both weakening operations take a password |
| `lib/admin/security-actions.ts`, `lib/account/actions.ts` | pass the posted password through |
| `app/admin/(dash)/security/page.tsx`, `components/account/AccountSettings.tsx` | password confirmation fields |
| `test/security-reauth.test.ts` | **new** — 6 tests |
