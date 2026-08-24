# Account infrastructure — audit and plan

> **Status (2026-08-24): Phases 1–4 implemented; Phase 0 is still the operator's.**
> See §8 for what shipped, what was verified against a running server, and the one
> thing that remains outstanding. The audit in §§1–2 describes the state *before*
> that work and is kept as the record of why it was done.

_2026-08-24. Method: read the whole auth surface — `lib/auth/*`, `lib/db/schema.ts` (users,
sessions, orders, reservations, loyalty), every route under `app/api/auth`, the storefront
account and checkout pages, the back-office user/security surfaces, and the mail + rate-limit
+ origin layers. Cross-checked against
[`gestionale-gap-analysis.md`](./gestionale-gap-analysis.md) §4.3, whose "missing
`password_reset_tokens`" line this document turns into a plan._

---

## 0. Headline

**The plumbing is good; the flows are missing.** One `users` table, one `sessions` table, one
cookie, scrypt N=2^16 with rehash-on-login, sliding idle timeout, RBAC enforced in the layout
*and* re-checked in every action, TOTP with recovery codes, Origin/CSRF guard, Zod at every
entry point. None of that needs rebuilding.

What does not exist is everything *around* it:

> **A customer who forgets their password is locked out permanently.** There is no reset
> flow, for anyone — customer, staff or admin. `scripts/reset-admin.ts` on the server is the
> only net. And because `users.email` is optional and never verified, even adding a reset
> flow does not rescue the accounts that have no address on file.

Second-order, and worth more money: **the loyalty programme has no funnel.** Guest orders
never attach to an account, guests are shown a points promise that is never paid, and staff
at the counter are not allowed to create the account a walk-in would need.

This document plans four phases. Phase 0 is a prerequisite that lives in environment
variables, not code. Phase 1 makes accounts recoverable. Phase 2 connects accounts to the
business. Phase 3 is self-service. Phase 4 is hardening.

---

## 1. Who exists today

| Actor | How they get in | How they get back in |
| --- | --- | --- |
| Guest shopper | No account — checkout takes name + email | `/traccia` with order number **and** email, or the tokenised success link |
| Guest booker | No account — name + phone, email optional | `/traccia` with the reference code alone |
| Registered customer | `username` + password | **Nothing.** No reset, often no email on file |
| Walk-in loyalty customer | **Cannot be enrolled** — account creation is admin-only | — |
| Staff | Admin creates the account | Admin resets by hand |
| Admin | Seeded from `ADMIN_USERNAME`/`ADMIN_PASSWORD` | `npx tsx scripts/reset-admin.ts` on the server |

The bootstrap admin is seeded with **no email at all** (`lib/db/seed-data.ts:151`), so the
one account that can rescue every other account is itself unrecoverable except by shell.

---

## 2. Gaps

Severity is about the business, not about exploitability.

### Blocking

| # | Gap | Evidence |
| - | --- | --- |
| **B1** | **No password reset exists.** No table, no route, no email, no UI. | absence; `docs/gestionale-gap-analysis.md` §4.3 item 1 |
| **B2** | **Email is optional and never verified.** `emailVerifiedAt` is written *only* by an admin checkbox — there is no token flow, and the action's own docstring promises a "send the verification again" that does not exist. | [`lib/admin/user-actions.ts:309`](../lib/admin/user-actions.ts#L309), [`lib/validation/auth.ts`](../lib/validation/auth.ts) |
| **B3** | **Mail delivery is not configured.** The repo `.env` sets no `SMTP_*`. Every message queues in the outbox and is never delivered — so any email-based recovery is dead on arrival. | `.env`; [`lib/mail/mailer.ts`](../lib/mail/mailer.ts) `getTransport()` returns null |
| **B4** | **Registering with an already-used email returns HTTP 500.** `registerUser` checks username uniqueness only, but `users.email` is `UNIQUE`; the constraint violation escapes an uncaught route handler. | [`lib/auth/service.ts:21`](../lib/auth/service.ts#L21), [`app/api/auth/register/route.ts`](../app/api/auth/register/route.ts) |

### High

| # | Gap | Evidence |
| - | --- | --- |
| **H1** | **Guest orders never attach to an account.** `orders.userId` is set only when the buyer was signed in at checkout, and nothing links them afterwards. Register later with the same address → history and points are gone. | [`app/api/checkout/route.ts:39`](../app/api/checkout/route.ts#L39) |
| **H2** | **Checkout promises points it will not pay.** The preview renders whenever the programme is on, regardless of sign-in; accrual is gated on `order.userId`. A guest is told "guadagnerai ~N punti" and receives zero. | [`components/store/CheckoutClient.tsx:539`](../components/store/CheckoutClient.tsx#L539) vs [`lib/orders.ts:643`](../lib/orders.ts#L643) |
| **H3** | **Customers have no account management at all** — a literal `TODO` in the dashboard. No change-password, profile edit, session list, 2FA, or self-service export. Every one of those already exists for admins. | [`components/account/AccountDashboard.tsx:187`](../components/account/AccountDashboard.tsx#L187) |
| **H4** | **Staff cannot enrol a walk-in customer.** `createUser` is `requireRole("admin")` and `/admin/users/new` gates on `isAdmin()`. The counter screen can credit an existing card but cannot create one. | [`lib/admin/user-actions.ts:168`](../lib/admin/user-actions.ts#L168) |
| **H5** | **The marketing-consent checkbox is dead.** Registration stores `users.marketingConsent`; campaigns send only to confirmed `newsletter_subscribers`. Consent is collected and never acted on. | [`lib/auth/service.ts:33`](../lib/auth/service.ts#L33) vs [`lib/segments.ts:46`](../lib/segments.ts#L46) |
| **H6** | **The storefront login form has no 2FA field.** Latent today (customers cannot reach enrolment), but the login API already returns `twoFactorRequired` — the day 2FA reaches a customer, that account is locked out of the storefront. | [`components/account/AuthForms.tsx`](../components/account/AuthForms.tsx) vs [`app/api/auth/login/route.ts`](../app/api/auth/login/route.ts) |
| **H7** | **No login auditing and no per-account throttle.** No `lastLoginAt`, no failed-attempt counter, no audit row for login / logout / 2FA failure. The limiter is per-IP and in-memory — one bucket per process. | [`lib/rate-limit.ts`](../lib/rate-limit.ts); no `logAudit` call anywhere under `lib/auth/` |
| **H8** | **The header never shows signed-in state.** "Area personale" renders identically logged in or out; no name, no points, no sign-out. | [`components/site/SiteHeader.tsx:35`](../components/site/SiteHeader.tsx#L35) |

### Medium

| # | Gap | Evidence |
| - | --- | --- |
| **M1** | `getCurrentUser` does not filter `users.active`. Deactivation deletes sessions so it is correct today, but the session read is the enforcement point and should carry the check. | [`lib/auth/session.ts:41`](../lib/auth/session.ts#L41) |
| **M2** | Username-first identity is wrong for this business. Every other system of record — orders, reservations, invoices, newsletter — keys on email. `username` exists only to log in, and nobody remembers theirs a year later. | [`lib/validation/auth.ts`](../lib/validation/auth.ts) |
| **M3** | No saved addresses. `orders.shippingAddress` is per-order JSON; a repeat customer retypes their address every time. | [`lib/db/schema.ts:743`](../lib/db/schema.ts#L743) |
| **M4** | No self-service GDPR export or erasure. `gatherUserData` / `anonymizeUser` exist and are admin-only. Legally acceptable, operationally a chore. | [`lib/gdpr.ts`](../lib/gdpr.ts) |

### Already fixed (do not re-report)

The 2026-07 gap analysis listed several account defects that have since been closed and were
re-verified for this document: reservations *are* linked to the signed-in user
(`app/api/prenotazioni/route.ts:53`); `accruePurchase` *does* refuse a deactivated card
(`lib/loyalty.ts:113`); `anonymizeUser` *does* retire the loyalty card and scrub the ledger
(`lib/gdpr.ts:108`); card-number collisions retry (`lib/loyalty.ts:38`).

---

## 3. Target architecture

Five decisions, taken deliberately.

### D1 — Email-first identity, username kept as a legacy alias

Email becomes the identity for every new account. `username` stays in the schema (it is
`NOT NULL UNIQUE` and dropping it means a table rebuild — see §4) and is **auto-derived**
from the email local part at signup, slugified against the existing charset with a numeric
suffix on collision. The public signup form stops asking for it; the back office keeps
showing it.

Login accepts **either**: an identifier containing `@` resolves by email (lowercased), any
other by username. Existing customers keep working unchanged.

### D2 — Email required for self-service, optional only at the counter

A norcineria genuinely has loyalty customers with no email address. So:

- **Web signup:** email required, unique-checked, verified by token. Recovery always works.
- **Counter enrolment (new, staff-accessible):** name + phone is enough; the account is
  created `emailVerifiedAt = null` and flagged card-only. It can earn and spend points but
  cannot sign in to the website until an address is added and verified.

This is enforced in the application layer, not the schema — `users.email` stays nullable
because making it `NOT NULL` requires a table rebuild (§4).

### D3 — One `auth_tokens` table, not two

Password reset and email verification differ only in `purpose`. One table, one GC sweep, one
set of tests:

```
auth_tokens
  id          text pk (nanoid)
  user_id     text not null → users.id on delete cascade
  purpose     text not null  check in ('password_reset','email_verify')
  token_hash  text not null unique     -- sha-256 of a 32-byte random token
  email       text                     -- snapshot: the address being proven
  expires_at  integer not null
  used_at     integer
  created_at  integer
  index (user_id, purpose)
  index (expires_at)
```

The token is stored **hashed**, so a database read cannot mint a session — same reasoning as
the 2FA recovery codes, and a fast hash is correct for a 256-bit random value. The plaintext
token exists only in the email. `email` is snapshotted so an address change can be verified
before it is written to `users`.

TTLs: 1 hour for `password_reset`, 24 hours for `email_verify`. Single-use. Using a reset
token invalidates every session for that user.

### D4 — Anti-enumeration is a requirement, not a nicety

`POST /api/auth/password/request` always answers with the same message and the same rough
timing whether or not the address exists — mirroring what `loginUser` already does with
`DUMMY_PASSWORD_HASH`. Rate-limited per IP *and* per address.

### D5 — Claiming guest orders is bounded

On successful email verification, orders whose `lower(email)` matches the verified address
and whose `user_id` is null are attached to the account, and settled ones (`paid`/`refunded`)
back-credit loyalty points. Bounded so a decade-old address cannot mint a windfall:

- only orders newer than `loyalty.claimLookbackDays` (new setting, default 365);
- only when `loyalty.enabled`;
- the `user_id` write is itself the idempotency guard — an attached order can never be
  claimed twice;
- one ledger line per order, reasoned `Ordine <number> (recuperato)`, and one audit row.

---

## 4. Migration constraints

`users`, `orders` and `reservations` carry FTS5 external-content indexes and triggers from
`drizzle/0024_fts_search.sql`. Two traps, both of which have bitten this repo before:

- **Adding plain columns is safe** — drizzle-kit emits `ALTER TABLE ... ADD COLUMN`.
- **Adding a column *and* a new CHECK in the same migration is not** — SQLite forces a table
  rebuild, drizzle-kit's generated `INSERT INTO __new_x SELECT` references the new columns on
  the old table, and the rebuild silently destroys the FTS index and its triggers.

Therefore: **no new CHECK constraints on `users`.** New enums on `users` are enforced by
Drizzle types + Zod only, exactly as `orders.paymentMethod` already is
(`lib/db/schema.ts:768`). New tables (`auth_tokens`, `addresses`) may carry CHECKs freely —
a `CREATE TABLE` has nothing to rebuild.

If a rebuild of an FTS-indexed table ever does become unavoidable, the migration must end by
re-creating that index: `DROP TRIGGER IF EXISTS x_fts_a{i,d,u}`, `DROP TABLE IF EXISTS x_fts`,
then the `CREATE VIRTUAL TABLE` / backfill `INSERT` / three `CREATE TRIGGER` statements copied
verbatim from `0024`. Nothing else catches the omission — tsc, eslint and the build all stay
green while admin search for that entity silently returns nothing; only
`test/search-fts.test.ts` fails.

Every migration in this plan must be read after generation, before it is applied. And because
drizzle records a migration as applied by journal timestamp rather than by content hash,
`rm -rf .vitest-tmp` after touching any migration file — otherwise the suite keeps running
against the stale schema.

---

## 5. Phases

### Phase 0 — Unblock (environment, not code)

Nothing below works until mail leaves the building.

- [ ] Set `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` in production.
- [ ] Confirm `DATABASE_URL` points at the Turso database. The code already warns loudly on
      the ephemeral fallback (`lib/db/client.ts:63`), but on Vercel without it every account
      created is destroyed on the next cold start.
- [ ] Confirm `TRUST_PROXY=1` behind Caddy/Vercel, or the rate limiter collapses to a single
      global bucket.

**Code deliverable:** an admin banner and a `/admin/settings` warning when `smtpConfigured`
is false, worded as an outage now that account recovery depends on it — today the outbox
failing silently is merely inconvenient, and after Phase 1 it is a lockout.

### Phase 1 — Recoverable accounts

1. **Migration** — `auth_tokens` per §D3.
2. **`lib/auth/tokens.ts`** — `issueToken(userId, purpose, email?)` → plaintext;
   `consumeToken(plaintext, purpose)` → `{ userId, email } | null`, marking `usedAt` inside
   the same statement so a token cannot be redeemed twice by concurrent requests.
3. **Password reset**
   - `POST /api/auth/password/request` — anti-enumeration per §D4, audited.
   - `POST /api/auth/password/reset` — consume, rehash, `deleteUserSessions`, audit.
   - Pages `/password/recupera` and `/password/reimposta`, plus a "Password dimenticata?"
     link on both `AuthForms` and `AdminLoginForm`.
   - Templates `passwordResetEmail`, `passwordChangedEmail` (the second is the tripwire that
     tells a customer their account was taken).
4. **Email verification**
   - Issued on registration and on any email change; `GET /api/auth/email/verify?token=`
     stamps `emailVerifiedAt` and triggers the Phase-2 claim.
   - Resend endpoint, rate-limited.
   - Make the admin's `setEmailVerified` docstring true by wiring its "send again" branch.
5. **Registration changes** — email required and pre-checked (fixes **B4**); username
   auto-derived (§D1); `loginSchema` accepts email or username.
6. **Backfill prompt** — an account with no email is asked for one at next sign-in; nothing
   is forced, but the account page carries a standing "aggiungi un'email per non perdere
   l'accesso" notice.
7. **GC** — purge expired tokens in the existing `maintenance` cron job
   (`lib/automation.ts:495`), beside `deleteExpiredSessions`.

**Tests:** token single-use + expiry + wrong-purpose rejection; reset invalidates sessions;
identical response for known and unknown addresses; duplicate-email registration returns 409
with a message rather than 500.

### Phase 2 — Connect accounts to the business

1. **Guest-order claiming** per §D5, on verification and on any email change that verifies.
2. **Fix the points promise (H2)** — guests see "Accedi o registrati per guadagnare ~N
   punti" linking to `/account`; signed-in buyers keep the current copy.
3. **One-tap signup on the success page** — the address is already proven by the order token,
   so the account is created verified, with the order attached and its points credited.
4. **Wire `marketingConsent` (H5)** — registration with consent calls
   `subscribeNewsletter(email, "registrazione")`; unticking it in the account area
   unsubscribes. Consent and delivery stop disagreeing.
5. **Counter enrolment (H4)** — a narrow `createCustomer` action available to `staff`,
   separate from the admin `createUser`: name + phone/email, creates the account and the
   loyalty card, audited, and reachable from `/admin/loyalty/scan` where the need arises.
6. **Header state (H8)** — a small dynamic island showing name + points + sign-out. It must
   not make the whole storefront dynamic; the layout stays static and the island fetches.

### Phase 3 — Self-service account area

Replaces the TODO at `AccountDashboard.tsx:187`. Most of this is wiring functions that
already exist to customer-facing forms.

- Profile edit (name / email / phone); an email change re-verifies before it is written.
- Change password — requires the current password, then `deleteOtherUserSessions`.
- Active sessions list + "esci da tutti i dispositivi" (`listUserSessions`,
  `deleteOtherUserSessions` — both already implemented and unused outside the admin).
- Optional 2FA for customers, reusing `lib/auth/totp.ts` and the recovery-code stack. **The
  code field in `AuthForms` (H6) ships before or with this, never after.**
- Self-service GDPR export (`gatherUserData`) and an erasure request that routes to the admin
  rather than firing `anonymizeUser` unattended.
- Saved addresses — new `addresses` table, default address prefills checkout.

### Phase 4 — Hardening

- `users.lastLoginAt`, `users.failedLoginCount`, `users.lockedUntil` (plain columns, no
  CHECK — §4). Per-account exponential backoff on top of the per-IP limit.
- Audit rows for `auth.login`, `auth.login_failed`, `auth.logout`, `auth.2fa_failed`,
  `auth.password_reset_requested`, `auth.password_changed`.
- `getCurrentUser` filters `users.active` (**M1**).
- A durable rate-limit store if the deployment stays serverless — the in-memory map is
  per-lambda, which on Vercel is close to no limit at all.
- Session-list surfacing of user agent / IP so "questo dispositivo" means something.

---

## 6. Explicitly out of scope

- **Social / OAuth login.** One shop, one country, an audience that mostly does not have a
  developer-grade password manager. It adds a provider dependency and a second identity
  reconciliation problem to solve a problem magic links already solve better.
- **Magic-link-only login.** Tempting, and a reasonable future step, but it makes email
  deliverability a hard dependency for *every* sign-in rather than only for recovery.
  Revisit once Phase 0 has proven the SMTP path in production.
- **SMS/phone recovery.** Costs money per message and needs a provider; the counter path
  (D2) covers the no-email customer without it.
- **Passkeys/WebAuthn.** Right answer eventually, wrong order — recovery first.
- **Merging two existing accounts.** Claiming (D5) attaches *guest* orders; it deliberately
  does not merge two real accounts, which is a support conversation, not a button.

---

## 7. Verify workflow

Per the project's standing checklist, for every change in this plan:

```
edit schema → npm run db:generate → READ the generated SQL (no table rebuild on users)
→ npx tsc --noEmit → npx eslint → rm -rf .vitest-tmp && npx vitest run
→ load any touched page against npm run dev and grep for "Errore nel gestionale"
```

### Acceptance criteria

- A customer with only an email address can regain access to their account unaided.
- A staff member locked out on a Saturday can regain access unaided.
- No endpoint reveals whether an address is registered.
- A guest who has ordered three times and then registers sees all three orders and their
  points.
- No screen promises loyalty points that will not be credited.
- Every authentication event is in the audit log.


---

## 8. What shipped (2026-08-24)

Migrations `0036` and `0037`. Both were read before applying, and both are plain
`CREATE TABLE` + `ALTER TABLE ADD COLUMN` — no table rebuild, so `users_fts` and its
three triggers survived (verified against the dev database, not assumed).

### Phase 0 — Unblock
- `[✓]` **Admin outage banner** when `smtpConfigured` is false, worded as an outage
  because it now is one: with no SMTP host a customer who forgets their password has
  no way back. `app/admin/(dash)/layout.tsx`.
- `[ ]` **`SMTP_*` in production — still outstanding, and it gates the value of Phase 1.**
- `[ ]` Confirm `DATABASE_URL` and `TRUST_PROXY` in production.

### Phase 1 — Recoverable accounts
- `[✓]` `auth_tokens` table + `lib/auth/tokens.ts` (SHA-256 at rest, single-use via an
  atomic `UPDATE … WHERE used_at IS NULL RETURNING`, purpose-scoped, superseding).
- `[✓]` Password reset: `POST /api/auth/password/{request,reset}`, `/password/recupera`,
  `/password/reimposta`, recovery links on both the storefront and admin login forms.
- `[✓]` Email verification: `GET /api/auth/email/verify`, resend endpoint, and the
  admin "segna verificata" action left intact beside it.
- `[✓]` Email required + pre-checked at registration (**the duplicate-email 500 is now a
  409 with a message**), `username` auto-derived by `deriveUsername`, login accepts
  email *or* legacy handle, legacy `{username}` request bodies still accepted.
- `[✓]` Token GC in the `maintenance` cron sweep.

### Phase 2 — Connected to the business
- `[✓]` `claimGuestOrders` on verification, bounded by `loyalty.claimLookbackDays`
  (default 365); refunded orders attach but earn nothing; idempotent by construction.
- `[✓]` `attachOrderToUser` — the narrower token-scoped variant, so holding one order's
  id never reaches another order on the same address.
- `[✓]` Checkout no longer promises points to guests; it offers the account instead.
- `[✓]` One-tap account creation on the confirmation page (`ClaimOrderOffer`), which
  creates the account **unverified** — the order token proves the order, not the mailbox.
- `[✓]` `marketingConsent` now routes into the double opt-in instead of setting a
  column nothing read.
- `[✓]` `createCustomerAccount` — counter enrolment available to **staff**, on
  `/admin/loyalty/scan`.
- `[✓]` Header account badge (name + points + unverified mark) as a fetched island, so
  the storefront stays static.

### Phase 3 — Self-service
- `[✓]` `/account/impostazioni`: profile (email changes re-verify before they are
  written), change password, device list, optional 2FA, marketing preference, saved
  addresses, self-service GDPR export, erasure request.
- `[✓]` 2FA mechanics extracted to `lib/auth/enrolment.ts` and shared with the admin
  surface, rather than copied.
- `[✓]` The 2FA code field now exists on the storefront login form — closing **H6**
  before customers could reach enrolment, not after.
- `[✓]` `addresses` table + `lib/addresses.ts`; checkout prefills the default.

### Phase 4 — Hardening
- `[✓]` `users.lastLoginAt` / `failedLoginCount` / `lockedUntil`, with a 10-attempt,
  15-minute lock that a password reset always clears.
- `[✓]` Auth events in the audit log: `auth.login`, `auth.login_failed`,
  `auth.2fa_failed`, `auth.logout`, `auth.password_changed`,
  `auth.password_reset_requested`, `account.register`, `account.email_verified`,
  `account.orders_claimed`, `account.order_attached`, `gdpr.export_self`,
  `gdpr.erase_requested`.
- `[✓]` `getCurrentUser` filters `users.active` (**M1**).
- `[✓]` `rateLimitDurable` — DB-backed sliding window on the auth routes, falling back
  to the in-memory bucket if the store is unavailable. `rate_limits` table + GC.
- `[✓]` `sessions.userAgent` / `sessions.ip`, surfaced on both the customer and admin
  session lists.

### Verified against a running server

Not merely typechecked. On `next dev`, end to end: registration; the duplicate-email
409; login by email, by derived username, and via the legacy `{username}` body;
identical responses for a wrong password and an unknown account; reset request →
emailed link → redeem → replay refused → old password dead, new one live;
verification link → `?verifica=ok&ordini=2&punti=65` with both guest orders attached,
a 115-point balance (50 welcome + 65 claimed), a readable ledger and three audit rows;
the settings page, `/api/auth/me` and the self-service export under a real session; and
every admin page rendering without its error boundary. Fixtures were removed afterwards.

**One bug was caught only by that runtime pass**: `describeUserAgent`'s `` word
boundaries had been written into the file as literal backspace bytes (0x08), so every
pattern silently failed and every device read "Browser". tsc, eslint and 424 tests were
all green, and the control characters are invisible in a terminal. It is now fixed and
pinned by three tests, one of which fails if any C0 control character reappears in
`lib/auth/session.ts`.

### Test coverage added
`test/auth-recovery.test.ts` (24) and `test/account-services.test.ts` (14), plus the
rewritten auth-schema cases in `test/validation.test.ts`. Suite: **427 passing**.

### Still open
- **Phase 0 SMTP** — the one item that blocks the rest from mattering in production.
- Magic-link login and passkeys remain deliberately out of scope (§6).
- `orders.shippingAddress` is still not written back to the address book after a guest
  checkout; the book is populated by hand from the settings page.
