# System 19 — Analytics & Reporting

**Readiness: 88 / 100** — *production-solid*

**No code defects found.** Audited 2026-09-02. Scope: page views, sales analysis
by product/counter/period, margin, the analytics dashboard, CSV exports.

| Axis | Weight | Score | Weighted |
|---|---|---|---|
| Correctness | 30% | 90 | 27.0 |
| Robustness | 25% | 84 | 21.0 |
| Security & compliance | 20% | 92 | 18.4 |
| Observability & operability | 15% | 88 | 13.2 |
| Test & documentation cover | 10% | 86 | 8.6 |
| **Total** | | | **88.2 → 88** |

---

## What I checked and found clean

The two things I expected to find wrong here — a mass-export reachable by staff,
and a CSV that executes when opened — are both already handled, deliberately and
with the reasoning written down.

- **Bulk export is full-admin only.** `requireRole("admin")`, not the
  staff-admitting `requireAdmin`, with the comment saying why: *"Bulk CSV export
  is a mass-PII operation — full admins only, not staff."* Shop scope therefore
  does not apply, because admins are unscoped by definition — the boundary is
  the role, not the filter.
- **CSV formula injection is neutralised.** Any cell beginning `=`, `+`, `-`,
  `@`, tab or CR is prefixed with a quote so a spreadsheet treats it as text
  rather than executing it — which matters precisely because these exports carry
  user-controlled fields (names, emails, order notes). The product importer
  strips that prefix back off, so the export→edit→import round trip survives it.
- **Page-view recording is genuinely PII-free**, and says so: normalised
  pathname only (no query, no hash), referrer **host** rather than full URL, no
  IP, no cookie — so it needs no consent banner to be lawful, which is the whole
  reason it exists instead of a third-party tag.
- **A streaming CSV path exists** for the large exports, pulling a bounded batch
  at a time, so a big export is neither a memory problem nor dominated by
  round-trips.
- **Margin splits VAT out of the shelf price before subtracting cost**
  (`lib/inventory.ts`), so it does not overstate by the VAT rate — the same
  discipline as the fiscal system, and shared with it via `splitGross`.
- **The takings report is shop-scoped and the IVA report is not**, and that
  asymmetry is deliberate: "which counter earns on what" is the shopkeeper's
  question, while the VAT return is the whole business's.
- `analytics.test.ts` (10), `sales-analysis.test.ts` (16), `csv.test.ts` (6) and
  `csv-export.test.ts` (4) cover the arithmetic and the escaping.

---

## Still open

- **Dashboard queries are unbounded in time.** They filter by window but scan
  `orders` and `order_items`; the indexes are there (`orders_created_idx`,
  `orders_paid_created_idx`) and a two-counter shop will not notice, but nothing
  would tell anyone when it started to matter.
- **No retention on `page_views`.** The maintenance sweep prunes the audit log
  and the outbox on configurable windows; page views grow forever. Harmless
  (they hold nothing personal) but unbounded.
- **Sales analysis has no comparison period.** It answers "what did this month
  do", not "what did it do against last".
