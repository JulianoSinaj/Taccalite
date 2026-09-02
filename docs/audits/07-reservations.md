# System 7 — Reservations

**Readiness: 88 / 100** — *production-solid*
*(82 at audit; the one finding fixed 2026-09-02.)*

Scope: table bookings and porchetta pre-orders, availability, agenda and
calendar views, reminders, auto-close.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 88 | **92** | 27.6 |
| Robustness | 25% | 70 | **86** | 21.5 |
| Security & compliance | 20% | 86 | 86 | 17.2 |
| Observability & operability | 15% | 86 | 86 | 12.9 |
| Test & documentation cover | 10% | 78 | **86** | 8.6 |
| **Total** | | **82** | | **87.8 → 88** |

---

## Finding: the room could be double-booked — **fixed**

The kilos of porchetta have been summed **inside** the insert transaction since
the beginning, with a comment spelling out exactly why:

> *Splitting "sum the day's kg" from "insert this booking" into two statements
> let two concurrent pre-orders both read an under-cap total and both confirm,
> selling more porchetta than the Saturday can produce.*

Seats were capped later — the comment on `checkSeatsCapacity` records that the
room "never was" capped, and that Saturday dinner "could be double-booked from
the website without a word". That fix added the check but put it in the wrong
place: **before** the transaction, not inside it.

So two parties booking the last table at the same moment both read the room as
free, and Saturday dinner was double-booked by precisely the mechanism the kilo
cap had been written to prevent. The lesson had been learned and written down
one screen above, and then not applied.

**Fixed** — the seating decision now happens inside the same transaction as the
insert, mirroring the kilos exactly. The pre-flight check stays as the ordinary,
friendlier failure. A shop with no seating limit configured skips the re-check
and pays nothing for it.

Five tests; the concurrent one was confirmed to fail against the unfixed
placement.

This is the third instance of the same shape in this codebase — after the
loyalty per-customer cap (system 11) and the pickup window (system 6). All three
are now decided where the write happens, and system 22's busy-retry is what lets
the loser lose on the rule instead of on a driver error.

---

## What I checked and found clean

Every gate is enforced at the **write**, not merely in the form — and each says
so, because each was once only in the form:

- **The two master switches in Impostazioni** (`reservations.enabled`,
  `porchetta.enabled`) are actually read. The comment records that they were
  "editable and read by nothing", and that a global switch governing no
  behaviour "is worse than no switch, because somebody will trust it."
- **The date is validated as ISO at this endpoint**, not just in the admin
  schema — a direct POST could otherwise store "domani" in a row nothing could
  render.
- **Past dates are refused**, as a stale tab or clock skew rather than an
  intention.
- **Opening hours are checked for table bookings**, and unknown hours enforce
  nothing — the code never refuses on a guess.
- **Closures are checked with the time**, so a closure covering only the
  afternoon refuses the 15:00 table and takes the 20:00 one.
- **The porchetta cut-off is re-checked at the write**, so a tab left open past
  Friday cannot slip in behind the greyed-out page.
- **Porchetta overflow goes to a waitlist** rather than being refused, and a
  cancelled booking frees its kilos back up while a no-show does not — because
  the porchetta was already prepared for it.
- **Per-location capacity**: each shop roasts its own, so one shop's bookings
  cannot consume the other's.
- The public route is origin-checked, rate-limited (6/min) and honeypotted.
- Reminders stamp `remindedAt` and exclude stamped rows, so repeat cron runs
  never re-email (system 14).

---

## Still open

- **The detail page intermittently shows a stale status after confirming.**
  `admin-forms.spec.ts` "a table booking saves with covers, and can then be
  confirmed" fails roughly one run in four, on a *fresh* database and with every
  change from this programme stashed — so it is pre-existing and unrelated to the
  seats fix.

  **The write is never the problem.** Every failed run left the row at
  `confirmed`; what races is the page reflecting it. `updateReservationStatus`
  revalidates both paths after writing, and the status `<select>` is uncontrolled
  (`defaultValue={r.status}`), so a `router.refresh()` that lands before the
  write is visible remounts it showing the old value — which is the exact class
  of bug the test's own comment says it exists to catch.

  I got this wrong twice: first calling it "load-sensitive flakiness" on one
  observation, then over-correcting to "accumulated state" when a fresh database
  ran green. It is neither — it is a genuine intermittent race in this page.
  Worth a proper fix; not one to guess at.

- **The back office only warns on capacity**, deliberately — an operator taking
  a booking by phone is making a decision the website is not entitled to make.
  Worth knowing that the guarantee above is a public-form guarantee.
- **`/traccia` looks a booking up by reference alone**, with no second factor.
  Now throttled (system 3), but a longer reference or an email pairing would be
  stronger.
- **No overlap model for tables.** Capacity is per exact `time` string, so
  19:30 and 20:00 sittings do not see each other. Fine if the shop books fixed
  sittings; wrong if a table is held for two hours.
