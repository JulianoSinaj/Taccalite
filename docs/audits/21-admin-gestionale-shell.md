# System 21 — Admin Gestionale Shell

**Readiness: 89 / 100** — *state of the art*

**No code defects found.** Audited 2026-09-02. Scope: navigation, data tables,
filters, saved views, bulk actions, the ⌘K palette, form state and unsaved
guards, toasts, confirm dialogs, breadcrumbs, theming, search, pagination,
printing.

| Axis | Weight | Score | Weighted |
|---|---|---|---|
| Correctness | 30% | 90 | 27.0 |
| Robustness | 25% | 86 | 21.5 |
| Security & compliance | 20% | 92 | 18.4 |
| Observability & operability | 15% | 88 | 13.2 |
| Test & documentation cover | 10% | 84 | 8.4 |
| **Total** | | | **88.5 → 89** |

---

## The three things I went looking for

**Full-text search is raw SQL — and it is correctly escaped at both layers.**
`ftsMatch` builds a `sql.raw` predicate because an index name cannot be
parameterised. The user's term passes through two distinct escapes, each for a
different parser: `ftsLiteral` wraps it in double quotes and doubles any inner
ones, so `OR`, `NEAR` and a stray bracket are literal text rather than FTS5
query syntax; `quoteSqlString` then wraps that in single quotes and doubles any
inner ones for SQLite itself. The table and index names come from a frozen map,
never from input. Both layers are commented with what they are defending
against.

**Every admin surface is gated, and on the role rather than merely on being
signed in.** The `(dash)` layout redirects anyone who is not `admin` or `staff`,
so a customer account cannot reach the gestionale; the only page outside that
group is the login itself. All six `/api/admin/*` routes carry their own guard,
and the two that move bulk PII — the CSV export and the GDPR dossier — use
`requireRole("admin")` rather than the staff-admitting `requireAdmin`.

**Shop scope holds at all three of its documented points** — the list query, the
detail page and the mutating action. The two gaps found during this programme
were both in owning systems (product create in system 1, order status in
system 3) and are closed.

---

## What else I checked and found clean

- **The FTS index self-heals.** `verifySearchIndexes` compares each index against
  its content table and rebuilds any that drifted, from the maintenance job. The
  comment is honest that this should never fire — nothing VACUUMs — and exists so
  a stale index degrades to "rebuilt once" rather than "search silently returns
  wrong rows".
- **A short term falls back to `LIKE`** rather than returning nothing, because a
  one- or two-character search matches most rows anyway and the scan is not the
  problem.
- **Category drag-and-drop validates the dropped set** against the live sibling
  set before renumbering, so a stale client cannot reorder the wrong rows
  (system 1).
- **`runAction` never leaks internal errors.** Auth failures map to friendly
  copy, `ActionError` is shown as written, and everything else is logged
  server-side behind a generic message — so SQLite text and stack detail never
  reach the UI.
- **Toasts live on the layout, not the page**, so one survives the client-side
  navigation a save-and-redirect performs — a small thing that is wrong in most
  admin panels.
- `admin-filters`, `search-fts`, `pagination`, `action-state` and `validation`
  cover the logic; three e2e suites drive the forms.

---

## Still open

- **`lib/admin/queries.ts` is 2,762 lines.** Not a defect — it is coherent,
  sectioned and commented — but it is the single largest file in the codebase
  and it spans nine domains. The natural split is per-domain modules mirroring
  `lib/admin/*-actions.ts`, which already work that way.
- **The saved-view cap is counted outside the insert.** The same
  `count()`-then-`insert()` shape found in systems 6, 7 and 11 — but here the
  stakes are a user ending up with thirteen of their own saved views, so it is
  recorded rather than fixed. Worth knowing it is the same shape if the cap ever
  comes to mean something.
- **No pagination on the audit log's own detail views**, which will matter first
  on the busiest entity.
