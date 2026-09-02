# System 2 — Inventory & Stock

**Readiness: 84 / 100** — *production-solid with known edges*
*(69 at audit; findings 1–5, 7 and 9 fixed 2026-09-02. Findings 6 and 10 are
recorded, designed, and deliberately not built — see "Not done here".)*

Audited and partly remediated 2026-09-02 against the rubric in
[`docs/systems-map.md`](../systems-map.md). Scope: the stock ledger, every path
that moves it, batches/lotti with expiry (HACCP), low-stock thresholds,
back-in-stock notifications, margin inputs.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 72 | **88** | 26.4 |
| Robustness | 25% | 65 | **78** | 19.5 |
| Security & compliance | 20% | 70 | **80** | 16.0 |
| Observability & operability | 15% | 80 | **87** | 13.1 |
| Test & documentation cover | 10% | 55 | **88** | 8.8 |
| **Total** | | **69** | | **83.8 → 84** |

**Verification:** `vitest` 725 passed / 56 files (was 710 / 55) ·
`playwright` 52 passed · `tsc --noEmit` clean · `eslint` clean.
The two headline tests were confirmed to **fail** against the unfixed code
before being accepted.

---

## Starting position

System 1's audit left this system carrying two of its findings: the product
form and the CSV import both wrote `products.stock` with a plain `UPDATE`, so
the module's own opening line — *"the single way inventory moves"* — was false
on its two busiest paths. **Both were fixed there**, and this audit starts from
that corrected state.

What was already right, and is worth not breaking:

- **`applyStockChange` is genuinely good.** One atomic read-modify-write per
  product, ledgering the delta *actually applied* rather than the delta
  requested, so the history keeps summing even when a request is clamped at the
  zero floor. libSQL's `BEGIN IMMEDIATE` locks the row from the first read.
- **`stockUnitsForLine`** makes the outbound and inbound rules identical, which
  they were not: cancelling a counter sale of 0,350 kg used to *create* a unit
  of stock and ledger it as real.
- **Every batch action checks shop scope** — `receiveBatch`, `writeOffBatch`,
  `correctBatchRemaining`, `notifyStockWaitlist` — and the expiry report is
  scoped too, list *and* write.
- **`correctBatchRemaining` already had a compare-and-set guard** so two
  operators correcting the same lot cannot both apply their delta.
- **The order claim** (`stockAppliedAt` set with a `is null` predicate) makes
  application idempotent across webhook retries.
- The expiry report is print-friendly, because it is a sheet somebody walks the
  cold room with. That is the right instinct.

---

## Findings and what was done

### 1. FEFO drained expired lots first, erasing them from the HACCP report — HIGH · **fixed**

`consumeBatchesFefo` sorted lots by expiry ascending and filtered only on
`remaining > 0`. An **already expired** lot therefore sorted first and was the
very first thing an online sale was attributed to.

`/admin/products/scadenze` lists only lots with units left. So an expired lot
quietly drained to zero through ordinary sales and disappeared off the one
report whose entire job is to say *"throw this away"* — the report erasing
exactly what it exists to surface, and the lot going out to customers on paper
as well as in fact.

**Fixed** — FEFO skips anything past its date, so the lot stays on the report
demanding a decision. The sale is unaffected: `products.stock` is the authority
on whether there is anything to sell; lots only explain how that figure is made
up. `consumeBatchesFefo` now takes an injectable `today` so this is testable.
Covered by *"leaves an expired lot alone instead of quietly draining it"* and
*"takes nothing when every lot is expired"* — both verified to fail without the
fix.

---

### 2. Write-off and correction never checked that the product tracks stock — MEDIUM · **fixed**

`applyStockChange` returns `null` for a product with `stock IS NULL` — correct
(made-to-order has no quantity to move) but **silent**. Only `receiveBatch`
asked the question.

So writing off or correcting a lot on a product since switched to made-to-order
emptied the lot, moved no stock, and reported success. The lot records and the
on-hand figure parted company with nothing to say they had.

**Fixed** — a shared `mustTrackStock` guard now fronts all three lot actions.
Covered by a "refuses once the product has stopped tracking stock" test for
each of write-off and correction.

---

### 3. Switching a product to made-to-order abandoned its lots — MEDIUM · **fixed**

`setProductStock` (added in System 1) walks on-hand down to zero and ledgers it
when a product stops tracking stock — but left `product_batches.remaining`
untouched. The lots then claimed units the product no longer counted, and could
never reappear on the expiry report, which only lists what is still on hand.

**Fixed** — the switch is **refused** while open lots exist, naming the units
and lots involved, rather than silently zeroing them. Information-preserving,
and the same choice this codebase already makes for a category still in use and
a product that has been sold. Covered by *"refuses to switch a product to
made-to-order while lots still hold units"* and its allow-once-empty pair.

---

### 4. A lot and its stock movement were two transactions — MEDIUM · **fixed**

`receiveBatch` inserted the lot row and *then* called `applyStockChange`;
`writeOffBatch` and `correctBatchRemaining` did the same in reverse. A failure
between the two left the lots and the on-hand figure disagreeing, with nothing
to detect it.

**Fixed** — new `applyStockChangeIn(tx, opts)` joins a movement to a
transaction the caller already opened, so all three actions now write the lot
and its movement as one unit. The restock side-effects are deliberately *not*
run inside it — they send email, which has no business inside a write lock — so
the caller invokes the newly exported `runRestockEffects` after the commit.
That contract is the only reason the two are separate, and it is documented at
both ends.

`writeOffBatch` also gained the compare-and-set guard `correctBatchRemaining`
already had, so two operators cannot write the same lot off twice, each
removing the units the other already removed.

---

### 5. `applyOrderStock` swallowed every failure in complete silence — MEDIUM · **improved, not closed**

The `stockAppliedAt` claim is stamped at the top to make application
idempotent. A throw part-way through a multi-product order therefore leaves
some products decremented and some not, **permanently** — the claim prevents
any retry — and the `catch {}` had no logging at all, while the function still
returned `true`.

**Improved** — both `applyOrderStock` and `restockOrderItems` now log the
failure with the order id, matching the style the rest of the module already
used. Best-effort is still the right policy (a paid order must not be rejected
because the shelf count could not be written), but overselling three weeks
later is no longer a mystery.

**Not closed.** Making this genuinely safe needs the failure to be *recoverable*
rather than merely visible — see "Not done here".

---

### 7. `restoreBatches` was not the mirror of FEFO for undated lots — LOW · **fixed**

Consumption takes earliest expiry first and puts undated lots **last**. Undoing
it therefore has to start with the undated ones. Coalescing `null` to `""`
sorted them last in *both* directions, so a return on a product mixing dated
and undated lots landed in the wrong one.

**Fixed** with an explicit comparator; covered by *"puts units back in the
reverse of the order they came out"*.

---

### 9. A comment pointed at the wrong file — LOW · **fixed**

`lib/orders.ts` told the reader that the low-stock alert reset *"lives in the
product-update action (lib/admin/actions.ts, owned by another agent)"*. System 1
moved that reset into `runRestockEffects`, so the comment actively misdirected.
Rewritten to name where the rule actually lives and why.

---

## Not done here

Two findings are **recorded, designed, and deliberately unbuilt** — both are
feature work with a schema change, not defects, and both are the reason this
system sits at 84 rather than 90+.

### 6. Lot consumption is not linked to the order — the recall question · **BUILT 2026-09-02**

`consumeBatchesFefo` returns the lots it took. **Both call sites discard the
return value.** So the platform can say *when* a lot was consumed, but not
*who received it* — and "which customers got lot 2026-08-14?" is the actual
question a food recall asks, and the reason `product_batches` exists at all.

**Design.** Add `order_id` (nullable, indexed) and `lots` (JSON) to
`stock_movements`. Both call sites already hold the order id and already
compute the lots; the movement row is the natural place to join them, and it
makes every movement — not just order ones — answer "on account of what?".
The wrinkle is that `applyOrderStock` aggregates lines per product before
moving stock, so the link is order-level, not line-level; that is sufficient
for a recall and avoids a second table.

**Built.** `stock_movements` gained `order_id` (indexed) and `lots`; both call
sites now record what `consumeBatchesFefo` had always computed and discarded.
`getOrdersForLot` answers the recall question, shop-scoped, and the expiry page
carries the lookup. Eight unit tests and one e2e.

### 10. Nothing reconciles the ledger against on-hand

There is no report that would surface `sum(movements) ≠ products.stock`, so
finding 5's partial application — or any other divergence — stays invisible
until a stocktake. Products seeded with an opening quantity also have no
movements at all, so the sum is *expected* to differ for legacy rows; a
reconciliation view has to account for an opening balance before it can be
trusted.

**Design.** A backfill migration writing a "Giacenza iniziale" movement for
every stock-tracking product with no movement history (making the invariant
true for all rows, as it now is for new ones), then a reconciliation panel on
`/admin/products/scadenze` or a new report listing products whose ledger and
on-hand disagree. That panel is also what makes finding 5 recoverable: a
half-applied order shows up as a divergence somebody can correct.

**Estimated:** one migration, one query, one page section.

### Also still open

- **`stock_movements.createdByUserId` is untyped text** with no FK to `users`,
  so a deleted operator's movements point at nothing.
- **Expiry does not block a sale.** After finding 1 an expired lot is no longer
  *attributed* to a sale, but nothing stops the sale itself. That is arguably
  correct — the physical goods are the shop's business, and on-hand is the
  authority — but it is a decision worth making on purpose.

---

## What I checked and found clean

- Shop scope on all four batch actions and on the expiry report, list and write.
- `requestStockNotification` is idempotent per (product, email) and the API
  route never leaks whether an address was already registered.
- `notifyBackInStock` marks requests notified after sending, and never throws
  into its caller.
- `notifyStockWaitlist` refuses to mail a waitlist while the product still
  reads as out of stock — which would send customers to an empty page.
- The oversell guard in `createOrder` refuses a basket exceeding on-hand, and
  the decrement floors at zero for the concurrent-buyer race it cannot prevent.
- `margin` splits VAT out of the shelf price before subtracting cost, so it does
  not overstate by the VAT rate.
- `isLowStock` / `reorderPointFor` are the single source for every "scorte
  basse" surface, and treat an untracked product as never low.

---

## Files changed

| File | Change |
|---|---|
| `lib/stock.ts` | FEFO skips expired lots; `applyStockChangeIn` + exported `runRestockEffects`; `restoreBatches` mirror ordering; made-to-order refuses open lots |
| `lib/admin/batch-actions.ts` | `mustTrackStock` guard; all three lot actions transactional; CAS guard on write-off |
| `lib/orders.ts` | stock failures logged rather than swallowed silently; corrected a comment that pointed at the wrong file |
| `test/stock-batches.test.ts` | **new** — 15 tests; the batch layer had none |

---

## Note for other systems

**System 12 (Transactional Mail & Outbox):** ~~`notifyBackInStock` sends through
`sendMail` with no outbox row, so a failed notice is invisible to
`/admin/outbox`.~~ **Wrong — corrected when system 12 was audited.** `sendMail`
inserts the outbox row *first* and then attempts delivery, so every message is
recorded including this one. The concern was unfounded.

**System 19 (Analytics & Reporting):** the reconciliation report described in
finding 10 is arguably that system's to build rather than this one's.
