# System 18 — Fiscal & Accounting

**Readiness: 90 / 100** — *state of the art, with two compliance gaps that are
business decisions rather than defects.*

**No code defects found.** Audited 2026-09-02. Scope: VAT split and rates, the
VAT report, fattura elettronica XML, fiscal IDs, fiscal periods, the invoice
registry, till closing.

| Axis | Weight | Score | Weighted |
|---|---|---|---|
| Correctness | 30% | 95 | 28.5 |
| Robustness | 25% | 88 | 22.0 |
| Security & compliance | 20% | 82 | 16.4 |
| Observability & operability | 15% | 90 | 13.5 |
| Test & documentation cover | 10% | 92 | 9.2 |
| **Total** | | | **89.6 → 90** |

54 tests across five suites (`fiscal`, `fiscal-id`, `fiscal-period`,
`vat-report`, `security-fiscal`) — the best-covered area in the codebase.

---

## The 2026-07 critical is properly closed

The single critical finding of the July gap analysis was a VAT
**over-declaration**. The fix is not a patch; the whole computation was rebuilt
around the right idea, and it holds up:

- **`splitGross` is exact.** The taxable base is rounded and the tax is taken as
  the *remainder*, so `imponibile + imposta === gross` always — no cent is
  created or lost by rounding each half independently.
- **The cart discount is apportioned pro-rata across rate buckets** using
  largest-remainder, so a mixed-rate basket with a coupon declares tax on what
  the customer actually paid, per rate. Declaring on raw line grosses, ignoring
  the discount, is exactly what over-declared before.
- **Shipping is added under its own configured rate**, not folded into the goods.
- **A refund is a credit note in the period it happened**, not a retroactive
  shrinking of the period the sale was filed in. `refundVatBuckets` sizes the
  reversal to the money returned and `negateVatBuckets` books it negative, so a
  partial refund stops the sale side over-declaring without rewriting history.
- The discount is capped at the goods subtotal, so a bogus figure cannot drive a
  bucket negative.

**The fiscal dates are immutable once written.** `paidAt` is written in exactly
two places — a counter sale at creation, and `finalizeOrder` at settlement — and
never moved afterwards; `refundedAt` only by `recordRefund`. Nothing can slide a
sale from one VAT period into another. (System 3's settlement-replay fix closed
the one path that could: a redelivered webhook re-stamping `paidAt` after a
refund.)

The period query uses `coalesce(paid_at, created_at)` so history predating those
columns still lands somewhere, with hand-written expression indexes in
`drizzle/0033` and a comment warning that a future table rebuild will silently
drop them — the same trap the FTS index carries.

---

## Compliance gaps — decisions, not defects

### 1. The invoice is produced, not filed

`GET /api/admin/invoice/[orderId]/xml` returns the FatturaPA XML as a download
(`Content-Disposition: attachment`). Nothing transmits it to the Sistema di
Interscambio. For a shop whose commercialista or an intermediary does the
filing, that is the correct division of labour — but it means "the platform
handles invoicing" is only half true, and nobody should discover which half
during a deadline.

### 2. There is no concept of a closed fiscal period

Nothing marks a period as declared, and nothing refuses a write that would
change a declared one. The codebase clearly *reasons* about this — the guard
refusing to cancel a settled order cites "a period that may already have been
declared" as its reason — but the protection is indirect: it comes from the
settled-order guards rather than from a period lock.

In practice that turns out to be enough, because the settled-order rules block
every path that could move a past period's figures. A period lock would make the
guarantee explicit rather than emergent. Worth building only if the shop's
accountant ever needs to certify a filed period.

---

## Also worth knowing

- **`getVatReport` takes no shop scope**, which is correct: the IVA report is
  `adminOnly` in the nav, and admins are unscoped by definition. The takings
  report (`/admin/reports/vendite`) *is* scoped, deliberately, because "which
  counter earns on what" is the shopkeeper's question.
- **Shipping VAT is a setting** (`store.shippingVatRate`, default 22 %) rather
  than a constant, which is right — it is a commercial decision, not a fact
  about the code.
- `DEFAULT_VAT_BPS` is now named once here and consumed by the catalogue and the
  importer (system 1), instead of `1000` appearing in three places.

---

## Note for other systems

**System 4 (Payments) is on hold**, and this system reads the settlement it
records. `paidWith` is what the invoice's `ModalitaPagamento` is derived from —
"pago al ritiro" settled in contanti is MP01, the same order on the POS is MP08.
If card payment goes away, that distinction does **not**: a counter sale still
settles in cash or on the POS, and the invoice still has to say which. The
fiscal system survives the payments decision almost untouched.
