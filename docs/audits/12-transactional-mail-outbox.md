# System 12 — Transactional Mail & Outbox

**Readiness: 89 / 100** — *state of the art*
*(83 at audit; the one finding fixed 2026-09-02.)*

Scope: every one-to-one email — order confirmations, status changes,
reservation notices, auth mail, the contact relay — and the durable outbox
behind them.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 92 | 92 | 27.6 |
| Robustness | 25% | 90 | 90 | 22.5 |
| Security & compliance | 20% | 62 | **86** | 17.2 |
| Observability & operability | 15% | 90 | 90 | 13.5 |
| Test & documentation cover | 10% | 82 | **86** | 8.6 |
| **Total** | | **83** | | **89.4 → 89** |

---

## Finding: only delivered mail was ever pruned — **fixed**

Every outbox row stores the message **body in full**, `html` and `text`. For an
order confirmation that is the customer's name, delivery address, phone number
and basket.

The maintenance sweep pruned `status = 'sent'` rows older than 90 days — and
only those. So:

- a message that exhausted its five delivery attempts sat there, with all of
  that in it, **forever**;
- and on an install where SMTP was never configured, *every* message stays
  `queued` by design — so the outbox grew without bound as a store of personal
  data nobody had decided to keep.

The second case is not hypothetical: the module's own comment describes running
with no SMTP as a supported mode ("the app runs with zero email setup").

**Fixed** — the retention window now applies to every status. A `failed` row
will not be retried; a `queued` one that old is either a relay nobody fixed
months ago or a message whose moment has long passed. Holding a customer's
address and basket against either is the worse outcome.

One test, covering all three statuses plus a recent row that must survive.

> **A correction.** During the system 2 audit I recorded that
> `notifyBackInStock` "sends through `sendMail` with no outbox row, so a failed
> notice is invisible to `/admin/outbox`". That was wrong: `sendMail` inserts the
> outbox row *first* and then attempts delivery, so every message is recorded.
> The note in that document has been struck through and corrected.

---

## What I checked and found clean

- **Outbox-first is the whole design, and it holds.** `sendMail` records before
  it delivers, so no message is ever lost — and the app runs with zero email
  configuration, with everything visible in the admin outbox instead.
- **The timeouts are the standout.** Nodemailer's defaults are effectively the
  OS socket timeout, which is minutes; mail is sent from inside request
  handlers, so an SMTP host that accepts the connection and then goes quiet
  hangs the request rather than failing it. The comment records that the admin
  settings page reproduced exactly this and "took over two minutes to not load".
  Ten seconds for background sends, a shorter budget for the interactive check
  because someone fixing their settings reloads that page repeatedly.
- **A drain pass claims a row before attempting it** (`claimedAt`), so a cron
  sweep and a manual retry cannot both send the same message.
- **Retries are capped** at five attempts, so a permanently-failing address does
  not become an infinite loop.
- **Bulk sends use `enqueueMail`** rather than `sendMail`, so a broadcast returns
  fast and delivery is throttled by the drain instead of firing hundreds of
  parallel SMTP calls.
- **Campaign rows are tagged**, so delivery outcomes roll back up to the campaign
  rather than a "sent to 412" figure that hides 80 bounces.
- `orderEmailDelivery` distinguishes sent / pending / failed for the order page,
  so an operator can see whether the customer actually got their confirmation.
- Plain-text bodies are generated alongside the HTML and tested (11 assertions
  in `mail-text.test.ts`).

---

## Still open

- **No bounce handling.** A relay accepting a message is treated as delivery;
  an asynchronous bounce afterwards is invisible. Fine for a shop on a Gmail
  app password, a real gap on a provider that reports bounces.
- **No per-recipient suppression list.** A permanently-failing address is
  retried five times per message, every message, forever.
- **`env.ownerEmail` is a single address.** No second recipient, no fallback if
  it is wrong.
