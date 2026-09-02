# System 3 — Orders & Checkout

**Readiness: 90 / 100** — *state of the art, with named residuals*
*(80 at audit; all three findings fixed 2026-09-02.)*

Audited and remediated 2026-09-02 against the rubric in
[`docs/systems-map.md`](../systems-map.md). Scope: the cart, the checkout flow,
order creation, the order lifecycle, order editing, refunds, counter and phone
sales, guest orders, order tracking, packing slips.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 80 | **92** | 27.6 |
| Robustness | 25% | 82 | **90** | 22.5 |
| Security & compliance | 20% | 72 | **88** | 17.6 |
| Observability & operability | 15% | 88 | **88** | 13.2 |
| Test & documentation cover | 10% | 78 | **90** | 9.0 |
| **Total** | | **80** | | **89.9 → 90** |

**Verification:** `vitest` 733 passed / 57 files (was 725 / 56) ·
`playwright` 52 passed · `tsc --noEmit` clean · `eslint` clean.
Four of the eight new tests were confirmed to **fail** against the unfixed code.

---

## What was already strong

This is the most mature system in the codebase, and it starts from a higher
base than the two before it. Worth naming, because most of it is the kind of
thing that only gets written after something has gone wrong once:

- **The status state machine refuses, by name, every transition that would move
  goods without moving money** — or the reverse. Cancelling a settled order,
  flipping a paid order back to "da pagare", marking one paid from a dropdown
  that cannot know whether it was cash or POS, marking a shipment fulfilled
  with no tracking number: each is refused with a sentence explaining the
  consequence, and each comment records the incident behind it.
- **Idempotency is claimed, not assumed, at four separate points**:
  `stockAppliedAt` for the decrement, `paymentStatus` for settlement,
  `refundedCents` compare-and-set for reversals, and a Stripe `idempotencyKey`
  on session creation. Every one is a conditional `UPDATE … RETURNING`, so only
  the caller that actually changed a row does the work.
- **Pricing is server-authoritative throughout.** Prices come from the database,
  the coupon is re-validated against the server's own subtotal, carriage comes
  from the zone rules, and the payment method is re-derived from the shop's live
  settings — a client posting `contrassegno` on a courier shipment is refused,
  not humoured.
- **The webhook covers the whole money lifecycle**, not the happy path:
  signature-verified, and handling expiry, async payment failure, dispute and
  refund as well as completion. It trusts a completed session only when
  `payment_status` actually says paid, because a delayed payment method can
  complete a session while still unpaid.
- **`recalcOrderTotals` caps the manual discount at the subtotal**, so shrinking
  a basket cannot leave a discount larger than the goods.
- **Weight lines are symmetric** between sale and cancellation, via
  `stockUnitsForLine` — the asymmetry that used to *create* stock on cancelling
  a 0,350 kg counter sale is fixed and tested.
- Stripe coupons are cleaned up when a session fails, so a failed discounted
  checkout leaves no orphan behind in the Stripe account.

---

## Findings and what was done

### 1. Duplicate slugs in one basket bypassed the oversell guard — HIGH · **fixed**

`createOrder` built one line per posted item and then checked shortages
**per line**:

```
const shortages = lines.filter((l) => l.product.stock != null && l.product.stock < l.quantity);
```

Nothing ever summed a product's quantity across lines. So a request naming the
same slug twice —

```json
{"items":[{"slug":"ciauscolo","quantity":25},{"slug":"ciauscolo","quantity":25}]}
```

— against a stock of 30 passed the guard twice (25 ≤ 30, twice) and created an
order for **fifty units**. `applyOrderStock` aggregates per product and floors
the decrement at zero, so the shop simply ran out, having taken money for meat
it had already promised to somebody else. The same order also carried the
product twice on its packing slip and its invoice.

The storefront cart merges by slug, so this was only reachable through the
hand-rolled JSON POST — which is precisely the case the guard's own comment
says it exists for: *"a stale cart / direct POST / concurrent buyer"*.

**Fixed** — the basket is aggregated into one line per product *before* pricing
or guarding, and the per-item ceiling from `checkoutSchema` is re-applied to the
summed quantity (exported as `MAX_LINE_QUANTITY`) so it cannot be sidestepped by
splitting one product across several entries. The partial-basket check now
compares distinct requested slugs against resolved ones.

Covered by *"sums a product listed more than once into one line"*, *"refuses a
basket that only oversells once its duplicates are added up"* and *"applies the
per-product ceiling to the summed quantity"* — all three verified to fail
without the fix.

---

### 2. A refunded order could be finalized again — MEDIUM · **fixed**

`finalizeOrder`'s claim was:

```
.where(and(eq(orders.id, orderId), ne(orders.paymentStatus, "paid")))
```

A fully refunded order sits at `paymentStatus: "refunded"`, which is not
`"paid"` — so it passed. Stripe retries a failed webhook delivery for up to
three days, so a redelivered `checkout.session.completed` arriving after a
refund would claim the order, flip it back to `paid`, **count the coupon a
second time, award the loyalty points again**, and re-stamp `paidAt` — moving
the sale into a different VAT period on its way past.

**Fixed** — the claim is now `eq(orders.paymentStatus, "unpaid")`. Nothing
legitimately finalizes an order that is not unpaid: `settleOrderPayment` refuses
both paid and refunded before it gets there, and every Stripe path starts from
unpaid. Covered by *"does not re-finalize an order that has been refunded"*
(verified to fail without the fix) and a companion asserting ordinary double
settlement is still idempotent.

---

### 3. The order tracking lookup had no rate limit — MEDIUM · **fixed**

`/traccia` reads `order` and `email` from the query string and calls
`getOrderByNumberAndEmail`. Order numbers are `ORD-<year>-<six digits>` — a
one-million namespace. An attacker who knows a customer's email address, usually
the easy half, had a million unthrottled guesses between them and that
customer's **name, phone number, full delivery address, basket and total**. The
reservation half of the same page is worse on paper: a booking is looked up by
its reference alone.

Every other public entry point in the app is rate-limited — checkout, login,
registration, password reset, newsletter, stock-notify, claim-order, even
analytics. This one is a *page* rather than an API route, and had been missed.

**Fixed** — a new `clientIpFromHeaders` (for callers holding `headers()` rather
than a `Request`) lets the page throttle itself: 12 lookups per minute per IP,
counted only when a lookup is actually attempted, so browsing to the empty form
costs nothing. An exceeded limit renders the form with a plain message rather
than a blank result.

> **Caveat inherited from the limiter.** `lib/rate-limit.ts` falls back to a
> single shared bucket when `TRUST_PROXY` is unset, because a client could
> otherwise spoof `x-forwarded-for` to rotate its own key. That is the existing,
> deliberate trade-off for every other route; on this deployment (Caddy in
> front) `TRUST_PROXY` should be set so the limit is genuinely per-IP.

---

## Still open

- **Loyalty points accrue on the pre-discount subtotal.** `finalizeOrder`
  computes `floor(order.subtotalCents / 100 * perEuro)`, so a customer using a
  50 %-off coupon still earns points on money they did not spend. This may well
  be intentional generosity — it is a business decision, not a defect, and it
  is the sort of thing that should be decided rather than inherited.
- **`order_items.productId` has no foreign key** to `products`. `deleteProduct`
  refuses once order lines exist, so the invariant holds at the action layer,
  but not at the database layer.
- **The reservation lookup on `/traccia` is single-factor** — the reference code
  alone, with no email. Now throttled, but a longer or email-paired reference
  would be stronger. That belongs to system 7.
- **`applyOrderStock`'s partial-application trap** (recorded under system 2,
  finding 5) reaches this system: the stock claim is stamped before the work, so
  a mid-loop failure is permanent and unretryable. Now logged, not yet
  recoverable.

---

## What I checked and found clean

- `POST /api/checkout` enforces same-origin, rate-limits per IP, carries a
  honeypot, and passes a Stripe idempotency key derived from the order.
- The Stripe webhook verifies the signature before touching anything, and
  returns 500 on a handler error so Stripe retries a transient failure.
- `getOrderForViewer` entitles on one of three things: a capability token equal
  to the order's (unguessable) id, a verified order id in session, or ownership.
  A customer cannot read another's order.
- `checkoutSchema` bounds quantity (1–50), requires at least one item, and makes
  address and phone conditional on what the fulfilment mode actually needs.
- `assertEditable` is applied by both editing actions, and `recalcOrderTotals`
  has no other callers — so a paid order's total cannot be rewritten.
- `mustFindOrder` applies shop scope to every admin order action.
- `expireOrder` is restricted to unpaid **card** orders, so the abandoned-order
  sweep cannot cancel a "pago al ritiro" order the shop has set goods aside for.
- Refunds are admin-only (`requireRole("admin")`, not `requireAdmin`, which also
  admits staff) — the one action in the file that draws that distinction, and
  correctly.
- Order-number collisions are retried up to five times rather than failing the
  checkout.

---

## Files changed

| File | Change |
|---|---|
| `lib/orders.ts` | basket aggregated per product before pricing and guarding; `MAX_LINE_QUANTITY`; settlement claim narrowed to `unpaid` |
| `lib/rate-limit.ts` | `clientIpFromHeaders`, for a page that must throttle itself |
| `app/(site)/traccia/page.tsx` | throttles both lookups; renders a message when throttled |
| `test/checkout-integrity.test.ts` | **new** — 8 tests |

---

## Note for other systems

**System 23 (Quality & Testing)** — three separate problems found while running
the suite repeatedly, none of them a product defect, all of them reasons a green
run is not currently reliable:

1. The e2e database survives between runs (`reuseExistingServer`), so fixtures
   accumulate until a capped resource refuses. The saved-views test is the
   canary — it fails after roughly four full runs with the app correctly
   enforcing its 12-view limit.
2. The suite **cannot cold-start**: `webServer.command` seeds *before* the
   server that applies the migrations, so on a fresh database the seed runs
   against no tables and seven tests then fail on missing fixtures.
3. Two tests are genuinely load-sensitive, passing alone and failing in a full
   run, both waiting on `submitAndSettle`'s settle signal.

All 52 pass on a correctly seeded database.

**System 4 (Payments)** is on hold pending the owner's decision about whether
payments happen here at all. That decision reaches this system directly: the
settlement fields, the webhook and roughly a third of the lifecycle guards exist
to keep `paymentMethod` (intent) and `paidWith` (fact) honest. If card payment
goes away, those guards do not — a counter sale still settles in cash or on the
POS — but the Stripe half of this system becomes dead weight.
