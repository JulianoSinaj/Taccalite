# System 4 — Payments

**Readiness: 90 / 100** — *state of the art for the shop's actual intent*

**No code defects found.** Audited 2026-09-02, after the owner settled what this
system is for: **counter only — cash and POS**. No money is taken online; the
website's job is to take the order, and the shop takes the payment.

Scoring waited for that decision on purpose. The same code is excellent against
one intent and dead weight against another, and a number attached to the wrong
one is worse than no number.

| Axis | Weight | Score | Weighted |
|---|---|---|---|
| Correctness | 30% | 92 | 27.6 |
| Robustness | 25% | 90 | 22.5 |
| Security & compliance | 20% | 90 | 18.0 |
| Observability & operability | 15% | 88 | 13.2 |
| Test & documentation cover | 10% | 88 | 8.8 |
| **Total** | | | **90.1 → 90** |

---

## The decision needs no code change — and that is the finding

Counter-only is a **setting**, not a rewrite. `payments.cardEnabled` turns card
checkout off, and card is *additionally* gated on Stripe actually being usable,
with the reasoning already written down:

> *"a deploy that has never had its keys set offers «paga in bottega» rather than
> a card button that dead-ends."*

So a shop that never configures Stripe keys is already, correctly, a
counter-only shop. Nothing had to be built for the owner's decision; it was
anticipated.

A new suite (`counter-only-shop.test.ts`, 8 tests) proves the whole
configuration end to end rather than asserting it: card disappears from the
offered methods, a card order posted directly to the API is **refused rather
than humoured**, the order is taken with the goods reserved and the money left
owed, and settling at the counter records which instrument took it.

---

## I recommend **not** deleting the Stripe code

When I put the decision to the owner I described the Stripe checkout, its
webhook and simulate mode as "dead weight I can remove". Having read the code
properly, that was the wrong recommendation and I am withdrawing it.

- It is **not dead weight, it is a switched-off feature**, and the switch is the
  designed mechanism. Deleting it would remove a supported configuration.
- The removal is **irreversible in practice**. Turning card back on is a click;
  rebuilding a signature-verified webhook with idempotent refund reconciliation
  is not.
- It **costs nothing while off**. `getStripe()` returns null without keys, the
  webhook route refuses with "Webhook non configurato", and the checkout branch
  is never reached.
- The parts that look Stripe-shaped but are not — `paidWith`, `refundedCents`,
  `paidAt`, the settlement flow — are exactly what a counter shop needs, and
  the fiscal system depends on them.

The one thing worth doing is making the *intent* visible: the settings page
should say that card is off by choice rather than by accident, so nobody
switches it on wondering whether it was ever meant to be off.

---

## What survives the decision untouched

- **The instrument distinction.** `paidWith` records what the money actually
  arrived on, and the invoice's `ModalitaPagamento` is derived from it — contanti
  is MP01, the POS is MP08. That is *more* important in a counter-only shop, not
  less, because now every sale settles that way.
- **The two orthogonal fields.** `paymentMethod` is how an order is *meant* to be
  paid, fixed at creation; `paidWith` is how it *was*. Conflating them would
  mis-report both the till and what the driver must collect.
- **`settlesOnHandover`**, which keeps a "pago al ritiro" order from being swept
  up by the abandoned-checkout cleanup — the sweep is restricted to `card`
  orders precisely so it cannot cancel an order the shop has set goods aside for.
- **Contrassegno with a cap**, so nobody's driver carries €400 of change.
- **The stock timing rule**: a counter-settled order reserves its goods when it
  is *placed*, not when it is paid, because the meat has to be set aside.

---

## Still open

- **Nothing says card is off deliberately.** The setting reads as a toggle
  somebody might have flipped by mistake.
- **The Stripe webhook has no test**, because exercising it needs a signed
  payload. It is the least-covered money path in the codebase — which matters
  much less now, but is worth knowing if card is ever switched back on.
- **`simulatedPayments` is gated on `NODE_ENV=development` exactly** and is
  correct; it is also the reason `cardEnabled` reads true in the test
  environment even with the setting off, which is a trap for anyone writing
  tests here.
