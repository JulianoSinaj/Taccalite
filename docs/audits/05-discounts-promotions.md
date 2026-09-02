# System 5 — Discounts & Promotions

**Readiness: 88 / 100** — *production-solid*
*(84 at audit; the one finding fixed 2026-09-02.)*

Scope: discount codes, type and value, validity window, per-code and
per-customer usage limits, redemption records, live validation at checkout.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 90 | 90 | 27.0 |
| Robustness | 25% | 88 | 88 | 22.0 |
| Security & compliance | 20% | 85 | 85 | 17.0 |
| Observability & operability | 15% | 62 | **88** | 13.2 |
| Test & documentation cover | 10% | 78 | **85** | 8.5 |
| **Total** | | **84** | | **87.7 → 88** |

---

## Finding: a coupon honoured past its cap left no trace — **fixed**

The cap is enforced twice, and both times correctly: `validateDiscount` refuses
an exhausted code at checkout, and `recordDiscountUseByCode` re-checks it *in
the same statement that increments* — a compare-and-set that cannot be raced.

So a code with one use left, offered to two customers at once, settles for both
and is counted for one. **Honouring the second is the right call** — refusing to
settle an order somebody has already paid for, because a promotion ran out while
they were typing their card number, is plainly worse. The problem was that
`finalizeOrder` discarded the boolean saying so.

Nothing recorded it. And the books agree with themselves afterwards —
`times_used` and the redemption ledger both stop neatly at the cap — so a
promotion capped at fifty could be honoured sixty times with nothing anywhere to
say so. The overspend was invisible by construction.

**Fixed** — an unsuccessful count now writes `discount.over_redeemed` to the
audit log, naming the code, the order and the amount. One test.

---

## What I checked and found clean

- **The cap increment is a compare-and-set.** `UPDATE … WHERE times_used <
  max_redemptions RETURNING` — the same claim pattern used for stock and
  settlement — so two concurrent settlements cannot both take the last use.
- **Release is anchored to the order, not blind.** `releaseDiscountUseByCode`
  deletes the ledger row first and decrements `times_used` by however many rows
  that actually removed. The comment records why: an order honoured *past* the
  cap has no ledger row, and decrementing unconditionally used to hand a use
  back for it — which is how a `maxRedemptions = 1` code became redeemable again
  after such an order was refunded, with the genuine redemption still standing.
- **The redemption ledger makes per-customer caps enforceable**, counted from
  rows rather than a bare counter, with guests identified by order email —
  imperfect and honestly labelled as such, but it stops the obvious recycling.
- **`firstOrderOnly` checks for any previously settled order.**
- **Every value is clamped**: a percent discount and a fixed discount are both
  capped at the subtotal, and floored at zero.
- **Shop scoping is symmetrical** — a code tied to a location is refused both
  when the customer is at a different one *and* when there is no location at all,
  which is the case that usually gets missed.
- **The coupon is counted at payment, not at checkout**, so an abandoned basket
  cannot burn a redemption or exhaust a capped code on behalf of people who
  never paid.
- `POST /api/discounts/validate` is origin-checked and rate-limited.

---

## Still open

- **Guest per-customer caps key on the order email**, so a customer with two
  addresses gets two allowances. Called out in the code as imperfect; closing it
  properly needs an identity the platform does not have.
- **No alert on over-redemption**, only the audit entry. If a promotion is being
  materially overspent the owner still has to go looking. A digest line would
  close it — that belongs with system 14.
