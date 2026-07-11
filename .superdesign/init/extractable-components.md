# Extractable components — Superdesign DraftComponent candidates

Components worth registering with `superdesign create-component` so drafts reuse them via `<sd-component>` tags. Full source lives in `components.md` / `layouts.md`.

## Layout components (extract first — appear on every page)

## Header
- Source: `components/Header.tsx`
- Category: layout
- Description: Sticky cream top bar — "Taccalite" Playfair wordmark + "NORCINERIA DAL 1946" tagline, 5 nav links, "Area Personale" outlined pill
- Extractable props: activeItem (string, default: "home") — one of home/negozi/porchetta/blog/prenotazioni; homeHref/negoziHref/porchettaHref/blogHref/prenotazioniHref/accountHref (string, default: "#")
- Hardcoded: wordmark text, tagline, link labels (Home, I Nostri Negozi, La Porchetta, News, Prenota un Tavolo, Area Personale), all CSS (cream/95 backdrop-blur, brown-900 active, brown-800/70 idle)

## Footer
- Source: `components/Footer.tsx`
- Category: layout
- Description: brown-950 3-column footer — brand blurb + Instagram/Facebook links, one column per shop (gold specialty eyebrow, shop name, address, hours, phone), copyright bar
- Extractable props: centroHref, carniHref (string, default: "#")
- Hardcoded: all copy including both shops' data (Taccalite Centro / Piazza Kennedy 10 / 071 663 5605; Taccalite Mercato del Piano / 071 897903), social URLs, all CSS

## Basic components (used across pages)

## SectionHeading
- Source: `components/SectionHeading.tsx`
- Category: basic
- Description: gold uppercase eyebrow + Playfair h2 + muted description; `light` variant for dark bands
- Extractable props: eyebrow (string, default: "Sezione"), title (string, default: "Titolo"), description (string, default: ""), light (boolean, default: false)
- Hardcoded: typography scale, tracking, colors

## ShopCard
- Source: `components/ShopCard.tsx`
- Category: basic
- Description: linked card — wide photo, gold specialty eyebrow, Playfair name, tagline, "Scopri il negozio →"
- Extractable props: href (string, default: "#"), specialty (string, default: "Formaggi"), name (string, default: "Taccalite Centro"), tagline (string, default: ""), imageSrc (string, default: "")
- Hardcoded: card chrome (rounded-2xl, border-brown-700/15, bg-white/50, hover shadow), CTA label

## ProductCard
- Source: `components/ProductCard.tsx`
- Category: basic
- Description: square-image product card with category eyebrow, name, description, "Disponibile in negozio · online a breve" pill
- Extractable props: category (string, default: "Salumi"), name (string, default: "Prodotto"), description (string, default: ""), imageLabel (string, default: "Foto prodotto")
- Hardcoded: availability pill text, card chrome

## BlogCard
- Source: `components/BlogCard.tsx`
- Category: basic
- Description: linked news card — wide photo, taupe date, Playfair title (gold on hover), excerpt
- Extractable props: href (string, default: "#"), date (string, default: "20 giugno 2026"), title (string, default: "Titolo news"), excerpt (string, default: ""), imageSrc (string, default: "")
- Hardcoded: card chrome, hover behavior

## LoyaltyCard
- Source: `components/LoyaltyCard.tsx`
- Category: basic
- Description: dark gradient loyalty card — gold "SCHEDA FEDELTÀ" eyebrow, Taccalite wordmark, "Cliente" chip, holder name, gold points progress bar
- Extractable props: name (string, default: "Mario Rossi"), points (string, default: "340"), nextReward (string, default: "500")
- Hardcoded: card gradient (brown-900→brown-950), labels, progress bar styling

## Skip
- `Button` (ui/button) and inputs — simple primitives, better inline in drafts
- `Hero`, `ScrollIntroSequence`, `ReservationForm`, `AccountArea` — page-level compositions, reproduce per-draft from source context instead
- `Medallion3D`/`Hero3D` — WebGL, not representable as a Petite-Vue template (approximate with a static gold-coin visual in drafts)
