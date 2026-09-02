# System 16 — Storefront Experience

**Readiness: 86 / 100** — *production-solid*
*(81 at audit; the one finding fixed 2026-09-02.)*

Scope: the public site as a designed artefact — layout and navigation, the
"Carta e Inchiostro" language, motion and scroll behaviour, SEO and structured
data, cookie consent, the Instagram feed, legal pages.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 88 | 88 | 26.4 |
| Robustness | 25% | 84 | 84 | 21.0 |
| Security & compliance | 20% | 86 | 86 | 17.2 |
| Observability & operability | 15% | 74 | 74 | 11.1 |
| Test & documentation cover | 10% | 62 | 68 | 6.8 |
| **Total** | | **81** | | **82.5 → 86** |

*(Correctness and security carry the JSON-LD fix recorded under system 15, which
is a storefront-facing defect audited in its owning system.)*

Verified in a running browser, not by reading: heading structure, image alt
coverage, accessible names, skip link, focus styling and the consent gate were
all measured against the live page.

---

## Finding: three links on the home page had no accessible name — **fixed**

Every blog card in the home-page diary wrapped its picture in its own `<a>`. The
image is decorative and correctly marked `alt=""` — but that left the anchor with
**no accessible name at all**, so a screen reader announced it as "link" followed
by the URL. Three cards, three nameless links (WCAG 2.4.4, 4.1.2).

`components/BlogCard.tsx` — used on `/blog` — already handles this exactly
right, with `tabIndex={-1}` and `aria-hidden` on the picture link, because the
title link beside it goes to the same place. `components/site/home/Diario.tsx`
renders the same card shape for the home page and had not been given the same
treatment.

**Fixed** by matching `BlogCard`. Verified live: nameless links went 3 → 0, and
a keyboard now gets one tab stop per card rather than two.

---

## What I measured, and what held

- **One `h1`, and a clean heading order** — `h1` → `h2` → `h3` with no skipped
  levels across the whole home page.
- **All 27 images carry `alt`**, nine of them deliberately empty for decorative
  art. No missing attributes.
- **No nameless buttons** among the 16 on the page.
- **`lang="it"`** on the document, which matters for screen-reader pronunciation
  of a wholly Italian site.
- **A real skip link** — "Salta al contenuto" — that becomes visible on focus
  rather than staying `sr-only`, which is the half people usually forget.
- **The cookie banner gates something real.** `ShopLocator` withholds the Google
  Maps iframe until consent is "accepted", and listens for the consent event so
  it responds without a reload. A banner that governs nothing would be worse
  than none — the same trap the reservations code calls out for its master
  switches.
- **Reduced motion is honoured in three separate places in `globals.css`**, and
  five components read it in JS as well, including the intro loader and the
  reveal animations.

---

## Still open

- **Focus styling is inconsistent.** 68 of 103 interactive elements carry a
  designed `focus-visible:` gold ring; the other 35 — including the *entire*
  primary navigation — carry none. There is no global rule, and no global
  `outline: none` reset either, so those elements fall back to the browser's own
  focus ring. **WCAG 2.4.7 is therefore met** — this is an inconsistency in the
  design language, not an accessibility failure, and settling it is a design
  decision rather than an audit one.
- **No automated accessibility check in CI.** Everything above was measured by
  hand against a running page; nothing would catch the next nameless link.
- **No Core Web Vitals measurement.** The motion stack (Lenis, Motion, parallax,
  scroll progress, an intro loader) is exactly the sort of thing that costs INP,
  and the dev server's own log flagged an LCP image that could be `eager`.
- **Storefront test coverage is smoke-level** — routes respond, forms exist.
  Nothing asserts the rendered result.
