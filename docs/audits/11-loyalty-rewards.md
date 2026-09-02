# System 11 — Loyalty & Rewards

**Readiness: 89 / 100** — *state of the art*
*(85 at audit; the one finding fixed 2026-09-02.)*

Scope: loyalty accounts, the points ledger, the reward catalogue, redemptions,
the QR card, in-store scanning, points expiry.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 88 | **93** | 27.9 |
| Robustness | 25% | 82 | **88** | 22.0 |
| Security & compliance | 20% | 88 | 88 | 17.6 |
| Observability & operability | 15% | 88 | 88 | 13.2 |
| Test & documentation cover | 10% | 80 | **86** | 8.6 |
| **Total** | | **85** | | **88.9 → 89** |

---

## Finding: the per-customer cap was counted outside the write — **fixed**

`redeemReward` claims reward stock and debits the points **inside one
transaction** — correctly, and the comment says exactly why: *"two customers
can't both take the last one"*. But the **per-customer** cap was counted before
that transaction opened.

So a customer with enough points for two could take a "uno per cliente" reward
twice by sending both requests at once: both counted zero standing redemptions,
both passed, both then debited correctly and inserted a redemption. The points
arithmetic stayed honest — they paid for both — so what was lost was the cap,
not the balance. A cap that only holds when nobody is in a hurry is not a cap.

**Fixed** — the count is repeated inside the transaction, where libSQL's
write-mode lock holds the rows it reads until commit. The pre-flight check stays
as the friendlier early failure, exactly like the availability check above it.

**What the test found.** Under a genuine race the loser comes back as a thrown
`SQLITE_BUSY` rather than a refusal, because nothing in the application retries
a busy write. The cap holds either way — one redemption, one debit — but the
caller sees a driver error instead of a sentence. Recorded against **system 22**:
it is the data layer's to fix, and it affects every concurrent-write path in the
app (stock, loyalty, coupons), not just this one.

---

## What I checked and found clean

- **The points ledger is the balance.** Every movement goes through `addPoints`
  in one transaction: read, clamp at zero, write, and insert a
  `loyalty_transactions` row carrying the **applied** delta and the resulting
  balance. The same "record what actually happened, not what was asked for"
  discipline as the stock ledger.
- **Refunds claw points back proportionally**, and cumulatively: any reversal
  already booked is netted out, so a second partial refund — or the webhook and
  the admin action both landing for the same refund — converges instead of
  debiting twice. Points already spent cannot be taken; the debit stops at the
  balance and the ledger says so.
- **Reward stock is claimed with a compare-and-set** inside the debit
  transaction, so two customers cannot take the last one.
- **`rewardAvailability` is shared** between the surfaces that display a reward
  and the action that grants it, so nothing can look claimable and then refuse.
- **The counter card lookup is admin-gated** (`requireAdmin` before anything
  else), so card numbers — which are `TAC-YYYY-NNNNNN` and therefore guessable —
  are not an enumeration surface for holder names and balances.
- **The public redeem route** is origin-checked, rate-limited and requires a
  session.
- **`anonymizeUser` retires the card and zeroes the balance**, so an erased
  account cannot go on accruing (covered by `stock-ledger.test.ts`).
- Card-number collisions are retried rather than surfacing to the customer.

---

## Still open

- **Points accrue on the pre-discount subtotal** — recorded under system 3, and
  needing the owner's decision rather than a fix.
- **Guest accrual has no home.** Points require `order.userId`, so a counter
  sale to somebody without an account earns nothing even if they hold a card.
  The in-shop scan path covers this deliberately; worth knowing it is the only
  path that does.
