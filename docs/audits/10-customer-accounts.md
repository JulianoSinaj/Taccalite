# System 10 — Customer Accounts

**Readiness: 87 / 100** — *production-solid*
*(74 at audit; all three findings fixed 2026-09-02.)*

Scope: profile, addresses, order history, preferences, GDPR export and erasure.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 80 | **90** | 27.0 |
| Robustness | 25% | 84 | 86 | 21.5 |
| Security & compliance | 20% | 55 | **88** | 17.6 |
| Observability & operability | 15% | 85 | 85 | 12.8 |
| Test & documentation cover | 10% | 62 | **85** | 8.5 |
| **Total** | | **74** | | **87.4 → 87** |

`vitest` 753 / 60 (was 745 / 59) · `tsc` and `eslint` clean.

---

## Three findings, all in the same two functions

Two opposite failures lived side by side: the export carried something it must
not, and omitted things it must.

### 1. The GDPR export shipped a working second factor — HIGH · **fixed**

`gatherUserData` stripped exactly one field — `passwordHash` — and returned the
rest of the user row. That row holds `totpSecret` and `totpRecoveryCodes`.

A subject-access export is downloaded, emailed, forwarded to a lawyer, dropped
in a cloud folder. Anyone who ended up with that file could generate the
customer's TOTP codes indefinitely, and the customer would have no way of
knowing. Credentials are not personal data, and an export is the worst possible
place for them.

**Fixed** — the secret and the recovery codes are destructured out alongside the
password hash. The test asserts the raw secret string does not appear anywhere
in the serialised export, not merely that the key is absent.

### 2. The export omitted the saved address book — MEDIUM · **fixed**

`addresses` — street, city, postcode, phone, labels the customer chose — was the
one table the export walked straight past. Unambiguously their data, and exactly
what someone exercising a subject-access request expects to find.

Two more were missing for a subtler reason: `stock_notifications` and
`discount_redemptions` hold the customer's **email**, not their account id, so
neither is reachable by the `userId` every other query used. All three are now
included.

### 3. Erasure left the address book, the secret and live links behind — MEDIUM · **fixed**

`anonymizeUser` scrubbed the user row, the reservations and the loyalty card, and
retained orders for the fiscal-retention obligation — all correct. But it never
touched `addresses`, so an erased customer's street address stayed in the
database in full. Unlike an order, a saved delivery address carries no retention
obligation, so there is nothing to weigh against deleting it outright.

It also left `totpSecret` on a row that is meant to hold nothing identifying,
left outstanding `auth_tokens` redeemable against the erased account, and left
`stock_notifications` in place — so the back-in-stock mailer would have gone on
emailing someone who had asked to be forgotten.

---

## What I checked and found clean

- **Orders are deliberately retained**, with the reason stated in the code:
  fiscal retention overrides erasure. The loyalty ledger is reduced to its shape
  — deltas and balances are business records, but the free-text reasons that
  name orders and rewards are scrubbed.
- **The loyalty card is retired and the balance zeroed** on erasure, so the
  in-shop screen cannot go on crediting an account nobody can see or spend from.
  The card number is replaced rather than kept, because it is a quasi-identifier
  the customer was given.
- **Sessions are destroyed** and the password hash is replaced with an unusable
  value.
- `GET /api/account/export` is rate-limited and session-gated.
- `lib/addresses.ts` holds "exactly one default per user" in one place, with the
  reason it is not a database constraint written down.

---

## Still open

- **`email_outbox` still holds the address** of every message ever sent to an
  erased customer, and `audit_log` holds their name in summaries. Both are
  operational records with a reasonable retention argument, but neither is
  currently *articulated* as a retention decision the way orders are — which is
  what the erasure comment does so well for orders.
- **Erasure has no dry run.** The operator cannot see what will be removed before
  committing to an irreversible action.
