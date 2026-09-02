# System 8 — Locations, Hours & Closures

**Readiness: 90 / 100** — *state of the art*

**No code defects found.** Audited 2026-09-02. Scope: each sede's identity and
address, weekly opening hours, holidays, ad-hoc closures, and the per-operator
scope that keeps staff to their own shop.

| Axis | Weight | Score | Weighted |
|---|---|---|---|
| Correctness | 30% | 94 | 28.2 |
| Robustness | 25% | 88 | 22.0 |
| Security & compliance | 20% | 90 | 18.0 |
| Observability & operability | 15% | 86 | 12.9 |
| Test & documentation cover | 10% | 88 | 8.8 |
| **Total** | | | **89.9 → 90** |

Seven new DST tests added (`time-dst.test.ts`) — the behaviour was already
correct; nothing had pinned it.

---

## The timezone handling is right, and now proven

Every date gate in the platform resolves against Italian local time while the
server runs UTC in the Docker image. That gap is where a pickup window, a
closure, a cut-off or a digest quietly lands an hour out — and only twice a
year, which is how such a bug survives.

`instantInRome` resolves the offset in **two passes**: compute a naive UTC
instant, subtract the offset at that instant, then subtract the offset at the
*result*. That is the correct technique for a wall-clock-to-instant conversion
across a transition, and it was already there.

I probed it rather than reasoning about it, and the tests are now permanent:

- round-trips hold either side of both 2026 transitions (29 March, 25 October),
  including 01:30 and 03:30 on the spring-forward day itself;
- **10:00 on consecutive days is 23 real hours apart across the spring forward
  and 25 across the autumn one** — a slot generator assuming 24 would place
  every subsequent window an hour out;
- the offset is whole-minute, not drifting by milliseconds — `romeOffsetMs`
  explicitly adds back the remainder the formatter loses;
- the start of a shop day (the shape `lib/admin/filters.ts` uses to bound a date
  range) lands on Italian midnight, not UTC midnight, on all five boundary days.

`dateInRome` also carries the note that it replaced
`new Date().toISOString().slice(0,10)`, "which was UTC and drifted a day near
midnight in Italy" — the bug it exists to have fixed.

---

## What else I checked and found clean

- **Closures and delivery zones are `requireRole("admin")`**, not the
  staff-admitting `requireAdmin` — consistent with their `adminOnly` flags in
  the nav, so the boundary and the menu agree.
- **`deleteShop` names what is blocking it.** The comment records that the
  foreign key only knows *that* something points at the sede, and that the old
  message listed three of the four tables — "a staff account assigned to the
  sede blocked the delete with a sentence that sent the operator looking for
  orders." It now enumerates the real references.
- **Shop scope is applied at all three of its documented points** — list query,
  detail page, mutating action — with the two gaps found in systems 1 and 3 now
  closed.
- **A partial-day closure carries its time**, so a closure of the afternoon
  refuses the 15:00 table and takes the 20:00 one — and the *whole* window is
  tested for pickup slots, not just its start.
- **Unknown opening hours enforce nothing.** The code never refuses on a guess,
  which is the right default for a shop whose second sede has hours "da
  confermare in negozio".
- `hours.test.ts` (23), `closures.test.ts`, `holidays.test.ts`,
  `shop-scope.test.ts` (6) and `shops-admin.test.ts` (12) already cover the
  logic well.

---

## Still open

- **`hoursConfirmed` is a display flag only.** A sede whose hours are unconfirmed
  says so on the site, but nothing stops the rest of the platform treating those
  hours as authoritative — it just happens that unknown hours enforce nothing.
- **No per-sede holiday calendar.** Closures are entered by hand from a shared
  Italian holiday list; two sedi that close on different saints' days each need
  their own rows.
