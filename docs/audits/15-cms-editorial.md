# System 15 — CMS & Editorial

**Readiness: 88 / 100** — *production-solid*
*(76 at audit; the one finding fixed 2026-09-02.)*

Scope: the copy the owner can change without a deploy — site content blocks, the
blog with its article grammar and templates, per-shop editorial text.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 90 | 90 | 27.0 |
| Robustness | 25% | 86 | 86 | 21.5 |
| Security & compliance | 20% | 45 | **90** | 18.0 |
| Observability & operability | 15% | 84 | 84 | 12.6 |
| Test & documentation cover | 10% | 82 | **86** | 8.6 |
| **Total** | | **76** | | **87.7 → 88** |

---

## Finding: editable copy could break out of the JSON-LD script tag — **fixed**

`JsonLd` wrote `JSON.stringify(item)` straight into
`<script type="application/ld+json">`.

`JSON.stringify` escapes what **JSON** needs escaped. `<` is not on that list —
it does not have to be, inside JSON. But inside a `<script>` element it very
much does, because the HTML parser is looking for `</script` before the JSON
parser ever sees anything.

The values are product names, descriptions, categories and shop details, all
editable from the gestionale and importable from a CSV. A product called:

```
Salame </script><script>alert(document.cookie)</script>
```

closed the tag on the public product page, and everything after it was parsed as
markup — executed in every visitor's browser, including a signed-in customer's.

**The CSP does not help.** `script-src` carries `'unsafe-inline'` (system 20
records why: Next's hydration bootstrap requires it, and nonces would need a
middleware pass), so an injected inline script runs.

This is stored XSS, reachable by anyone who can name a product. That is staff
rather than the public — but it turns "can edit a product name" into "can run
script in every visitor's session", which is exactly the escalation an admin
boundary exists to prevent, and it survives a compromised or careless staff
account rather than requiring a malicious one.

**Fixed** — `<`, U+2028 and U+2029 are replaced with their JSON unicode escapes,
which parse back to the same characters, so the structured data a search engine
reads is byte-for-byte equivalent while `</script` can no longer appear. Five
tests, including the payload above and a round-trip assertion proving the
escaping is invisible to a consumer.

> **A note on how this was written.** Three attempts at the fix were silently
> mangled by backslash collapsing in the shell heredoc, producing a replacement
> of `<` with `<` — a no-op that looked right in a diff. The test caught it every
> time. Content with escape sequences now goes through file writes rather than
> the shell.

---

## What I checked and found clean

- **The rich-text renderer never touches `dangerouslySetInnerHTML` at all.** Both
  `RichText` and `inline-markup` build React elements from a closed grammar, and
  the comment states the intent exactly: *"safe by construction rather than by
  escaping"*. That is the strongest available answer to the XSS question, and it
  is why the finding above was in the one place that had to emit raw markup.
- **The article grammar is closed** — paragraphs plus `## titolo`, `- voce`,
  `> citazione`, `| campo | valore` and `![didascalia](/images/x.jpg)` — so there
  is no HTML passthrough for an author to reach through.
- **Four layouts exist because four kinds of writing exist**: a change of opening
  hours and the story of the Saturday roast are not the same page, and giving
  them the same one "was most of what made the diary read as filler".
- `blog-article.test.ts` (19) and `site-content.test.ts` (17) cover the parser
  and the content store.
- Content edits are audited (`content.update`, `content.reset`).

---

## Still open

- **`InlineScript` and the QR `dangerouslySetInnerHTML` remain**, both fed from
  code and generated output rather than editable copy. Not findings, but they
  are the other two places where raw markup is emitted, and worth re-checking if
  either ever starts taking stored input.
- **No draft/preview for site content.** A block is live the moment it is saved;
  the blog has a published flag, the content store does not.
- **No revision history.** `content.reset` restores the shipped default, which is
  the only undo.
