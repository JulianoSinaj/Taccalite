# System 6 — Fulfilment & Logistics

**Readiness: 88 / 100** — *production-solid*
*(81 at audit; the one finding fixed 2026-09-02.)*

Scope: pickup slots and windows, delivery zones and fees, carriers and tracking,
the day sheet, auto-fulfil.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 88 | 90 | 27.0 |
| Robustness | 25% | 68 | **86** | 21.5 |
| Security & compliance | 20% | 85 | 85 | 17.0 |
| Observability & operability | 15% | 86 | 86 | 12.9 |
| Test & documentation cover | 10% | 80 | **86** | 8.6 |
| **Total** | | **81** | | **87.0 → 88** |

`vitest` 761 / 61 (was 757 / 60).

---

## Finding: a capped pickup window could be overbooked — **fixed**

`resolvePickupSlot` counts what is already booked, decides, and hands back an
answer. The order is written some way further down, in its own transaction. Two
customers taking the last place in a Saturday window at the same moment
therefore **both passed** — the count each of them read was taken before either
row existed — and the shop found out when two people turned up for one slot.

Exactly the same shape as the loyalty per-customer cap (system 11): a read
outside the write it is supposed to constrain.

**Fixed** — the window's capacity is carried forward from resolution and
re-counted **inside** the insert transaction, where libSQL's write-mode lock
holds the rows until commit. A window with no capacity set skips the re-check
entirely, so an uncapped shop pays nothing for this. The loser gets a sentence
telling them to pick another window rather than a silent overbook.

Four tests, including the concurrent case.

---

## What I checked and found clean

- **Slot options are genuinely closure-aware, and test the whole window** — a
  12:00–14:00 slot is correctly withheld when the shop shuts at 13:00, not just
  when it is shut at 12:00.
- **The cut-off is measured from the moment the window opens**, not from the
  start of that day, so "ordina almeno 2 ore prima" means what it says.
- **The slot is re-derived server-side at checkout**, never trusted from the
  form — the page may have rendered an hour ago and the schedule may have
  changed since.
- **Only the window's start is stored** on the order, deliberately: the end
  lives on the schedule row the operator may later edit, and an order's
  appointment must not move because the weekly hours changed after it was
  placed.
- **A card checkout holds its window for only an hour.** The Stripe session
  lasts thirty minutes, so an unpaid card order past that is abandoned and must
  not keep a place the sweep will only release a day later — "the last place in
  a Saturday window was going to nobody".
- **Zone gating is airtight.** An unmatched CAP always produces an error, for
  delivery and shipping alike, with different wording for each; `createOrder`
  passes `enforceGates: true` and throws on it. The non-gated path (admin edit)
  falls back to the flat rate deliberately, because the operator has already
  agreed to take the order.
- **`matchZone` is specificity-ordered**, so an exact CAP beats a prefix.
- **The per-kg surcharge applies to the weighed goods only** — a zone charging
  by weight is charging for the porchetta, not the jar of sugo beside it.
- Carriers are a setting rather than a constant, with the tracking URL per
  account, because only the shop knows its own.

---

## Still open

- **A shop with no zones configured can sell nothing but pickup**, with a
  correct-but-puzzling "non spediamo al CAP X" as the only clue. A setup trap
  rather than a defect, but `/admin/fulfilment` could say so.
- **Delivery capacity has no equivalent of the pickup cap** — a round can be
  filled without limit. Whether that matters depends on whether the van has one.
