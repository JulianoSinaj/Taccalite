# System 13 — Newsletter, Campaigns & Segments

**Readiness: 86 / 100** — *production-solid*
*(76 at audit; the one finding fixed 2026-09-02.)*

Scope: double opt-in subscription, confirmation and unsubscribe, campaign
composition and sending, customer segmentation.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 88 | 88 | 26.4 |
| Robustness | 25% | 85 | 85 | 21.3 |
| Security & compliance | 20% | 66 | **88** | 17.6 |
| Observability & operability | 15% | 84 | 84 | 12.6 |
| Test & documentation cover | 10% | 40 | **82** | 8.2 |
| **Total** | | **76** | | **86.1 → 86** |

`vitest` 775 / 64 (was 770 / 63). This system had **no dedicated test suite** at
audit; it has one now.

---

## Finding: no `List-Unsubscribe` header on a bulk send — **fixed**

The visible unsubscribe link was already there and already right — in the HTML
*and* in the plain-text part, with a comment recording that the text half had
once been missed ("the one link a marketing message must have in both parts").

What was absent was the machine-readable half. Gmail and Yahoo have required
`List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` from
bulk senders since **February 2024**. Without them a newsletter's deliverability
degrades and it starts arriving in spam — a slow failure nobody attributes to a
missing header, and one that looks from the inside like the newsletter simply
not working any more.

**Fixed** — `MailInput` gained an optional `listUnsubscribeUrl`, set by
`broadcastToSubscribers` to that subscriber's own token URL, and `deliver`
turns it into both headers.

It is **persisted on the outbox row** (`list_unsubscribe_url`, migration
`0046`), not recomputed: the drain re-sends from that row long after the
broadcast that created it, and the URL carries a per-subscriber token. The
migration is a plain `ADD COLUMN`, so it does not rebuild the table and the FTS
and expression indexes survive — the trap `drizzle/0024` and `0033` both warn
about.

Transactional mail deliberately leaves it null: nobody opts out of their own
order confirmation, and telling a mail client they can would be worse than
saying nothing.

---

## What I checked and found clean

- **Segment rules cannot inject.** I went looking for string interpolation into
  SQL and there is none: `rule` is a typed, closed object of named fields, every
  one of which is bound through drizzle's `eq` / `gte` / `inArray`. An operator
  composing a segment is choosing from a fixed vocabulary, not writing a
  predicate.
- **Double opt-in is real.** A new address is stored `pending` with a random
  24-byte token and only becomes `confirmed` by clicking the emailed link — and
  a confirmed subscriber is never downgraded to pending by a re-signup, which is
  guarded by a status filter rather than by hope.
- **Segments only ever resolve confirmed subscribers.** Every audience starts
  from `status = 'confirmed'`, so no rule can widen a send to people who never
  finished opting in.
- **An email with no account can only satisfy the source rule**, which is
  correct — nothing else is known about them.
- **The order/points criteria are one grouped pass**, not a query per customer,
  and the `coalesce(paid_at, created_at)` expression is kept textually identical
  to the index in `drizzle/0033` with a comment saying that the planner reverts
  to a scan otherwise.
- **Sends are throttled**: recipients are enqueued to the outbox and delivered
  by the drain rather than firing hundreds of parallel SMTP calls.
- **Campaign rows are tagged**, so a campaign reports its own bounces instead of
  "sent to 412" hiding 80 failures.
- `deliverCampaign` claims the campaign with `ne(status, 'sent')`, so a due-send
  sweep cannot send one twice.

---

## Still open

- **`requireMarketingConsent` is opt-in on a segment**, so a campaign can reach
  confirmed newsletter subscribers who never ticked the account-level marketing
  box. Defensible — confirming the newsletter *is* the consent for the
  newsletter — but the two flags mean different things and the composer does not
  say which one it is honouring.
- **No suppression list.** An address that hard-bounces stays in the audience
  and is retried on every future campaign.
- **No send preview to a test address** from the composer; the only way to see a
  campaign as a recipient does is to send it.
