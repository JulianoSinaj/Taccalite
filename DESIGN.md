# Design System — Norcineria Taccalite

## Product context
Website for **Norcineria Taccalite**, a family-run norcineria (pork butcher/deli) in Ancona, Marche, Italy, founded **1946** and now in its third generation. Two shops, each with its own soul:
- **Taccalite Centro** (Piazza Kennedy 10) — specialty: fine cheeses (pecorino di fossa, gorgonzola, taleggio…)
- **Taccalite Mercato del Piano** (covered market) — specialty: meats & house salumi (ciauscolo IGP, razza marchigiana steaks)

Signature product: **hot artisan porchetta, every Saturday morning** — the emotional centerpiece of the brand.

Language: **all UI copy is Italian.** Tone: warm, artisanal, proud family heritage — "luxury heritage" rather than corporate.

## Key pages & JTBD
| Page | Job to be done |
| --- | --- |
| Home `/` | Cinematic brand entrance → route to shops, porchetta, booking |
| Negozi `/negozi`, `/negozi/[slug]` | Find the right shop, address, hours, specialties |
| Porchetta `/porchetta` | The order sheet (kg, bottega, Saturday, cut, contact → `/api/prenotazioni`) plus the story; in the top nav |
| News `/blog`, `/blog/[slug]` | Announcements: new arrivals, holiday hours, Saturday porchetta |
| Prenotazioni `/prenotazioni` | Book a table / preorder porchetta via form |
| Area personale `/account` | Loyalty card: points and rewards (demo login for now) |

## Color — HARD CONSTRAINT (use ONLY these values)
Brand "marroncino" family echoing the physical shopfronts:

| Token | Hex | Use |
| --- | --- | --- |
| cream | `#f8f2e8` | page background, text on dark |
| cream-dark | `#efe4d2` | alt section bands (`bg-cream-dark/60`), secondary surfaces |
| brown-950 | `#2a1a10` | darkest bands: hero, footer, intro loader |
| brown-900 | `#3a2314` | primary buttons, headings on light, dark section bands |
| brown-800 | `#41281b` | body text on light (usually at /70–/80 opacity), button hover |
| brown-700 | `#5c3820` | hairline borders at /15–/25 |
| brown-600 | `#7a4f30` | rare mid-brown accents |
| tan | `#a79685` | placeholder gradients |
| taupe | `#807868` | muted meta text (dates, captions) |
| gold | `#e1be64` | accent: eyebrows on dark, CTA pills, progress bars, cursor ring |
| gold-dark | `#c9a24e` | eyebrows on light, hover accents, focus ring |
| ink | `#221913` | base foreground |
| destructive | `#b3432f` | errors only |

Surfaces on light: `bg-white/50`–`/60` cards with `border-brown-700/15`; card token `#fffaf3`.
NO pinks, purples, neons, blues. No gradients other than brown-900→brown-950 (loyalty card) and the cream/tan placeholder gradient.

## Storefront art direction — "Carta e Inchiostro" (supersedes the above for `app/(site)`)

Everything above still describes the **gestionale**. The public storefront was
rebuilt on white paper with Fraunces/Inter Tight, and this pass gave it the
material and the colour it was missing. Where the two disagree, this section
wins for anything under `app/(site)`.

### Ground — three warm steps, not one white
| Token | Hex | Use |
| --- | --- | --- |
| `--paper` | `#fdfaf5` | the page. Warm stock, never `#ffffff` — a screen white read as a document, not a shopfront |
| `--paper-warm` | `#f5eee0` | alternating bands, the proof bar, filter grounds |
| `--paper-deep` | `#f0e7d7` | wells and the ground under a plate |
| `--rule` / `--rule-strong` | `#e7dccb` / `#d4c4a9` | hairlines; the strong one when it must be seen |

`.site-shell::before` lays a fixed fractal-noise plate over the whole viewport at
`multiply`, `z-index: 85`. Fixed, because paper does not scroll; above the header,
because the one untextured surface on the page read as a lighter bar pinned to
the top of it. `--color-taupe` is deepened to `#6f6659` inside the shell so meta
type clears AA on the warm bands.

### Territory accents — colour as information
Seven earth hues, one per product category, resolved by `lib/categories.ts`:

| Category | Token | Hex |
| --- | --- | --- |
| Salumi | `--acc-salumi` | `#8f2f3b` rosso salame |
| Carni | `--acc-carni` | `#a4472a` terracotta |
| Formaggi | `--acc-formaggi` | `#a8791f` zafferano |
| Gastronomia | `--acc-gastronomia` | `#4e6135` oliva |
| Cantina | `--acc-cantina` | `#6b2438` vinaccia |
| Regalo | `--acc-regalo` | `#2f5340` verde bottiglia |
| fallback / la casa | `--acc-casa` | `#b08428` |

Rules of use — a colour on this site answers *"what kind of thing is this?"*,
never *"look here"*:
- The consumer sets `--acc` on its own root (`style={{ "--acc": categoryAccent(c) }}`)
  and everything inside reads `var(--acc)`. Never hardcode one of the hexes.
- Grounds are tints at **8–16%** over paper (`color-mix(in oklab, var(--acc) 14%, …)`);
  full strength is for small type, hairlines and marks only.
- The page must still read brown-and-gold from across the room. The old "no
  pinks, purples, neons, blues" rule stands — every accent is a pantry colour.

### Plates — the fallback when there is no photograph
Twenty of the twenty-four products have no image, so this is the majority of the
shop, not an edge case. `components/site/ProductPlate.tsx` renders a printed
etichetta: the category's tint, one of three engravings (`.plate-hatch`,
`.plate-rings`, `.plate-rules`, chosen from the slug so a grid never repeats),
a vignette and double rule from `.plate::after`, the initial struck in Fraunces,
`DAL 1946` at the foot. Used by the product tiles and the diary cards — one
language for "we have no picture of this", not two.

Note: `app/globals.css` is **unlayered**, so every declaration in it beats
Tailwind utilities regardless of source order. `.plate` therefore declares no
`position` — a `position` there silently overrode the `absolute inset-0` its
callers place it with and collapsed the plate to nothing.

### Section rhythm
Bands alternate `paper → paper-warm`, broken by **two dark ribbons**: the
porchetta band (`bg-brown-950`) and the producer marquee (`bg-brown-900`), both
lit by `.ember`. Nine near-white sections in a row is what made the page read as
flat; the ribbons give the middle of the page a beat.

Container is `max-w-[88rem]` with `px-5 sm:px-8 lg:px-12`. Inner pages open with
`PageHero`, which without an `aside` sets the headline and lede as a **masthead**
— title left, lede in a measure on the right, closed by a rule — because the lede
under the title left the right-hand third of every inner page empty.

### Inner pages, dead ends and the diary

The port that finished the language everywhere else:

- **Eyebrows** — `.eyebrow` grows the 40px gold rule itself inside `.site-shell`
  (`::before`), so the thirty-odd inner-page call sites match the homepage
  without being rewritten. Not on a `<label>`: a form with ten fields would
  otherwise sprout ten little gold dashes down its edge.
- **Dead ends** — 404, error and empty states share `components/site/NoticeScreen.tsx`:
  eyebrow, display heading, lede, CTAs, and the status code set as a hollow
  numeral the way `1946` is on the homepage. `app/(site)/not-found.tsx` answers a
  `notFound()` thrown inside the storefront and keeps the chrome;
  `app/not-found.tsx` answers an unmatched URL from the root, so it carries its
  own `.site-shell` and wordmark. `NoticeScreen` writes its display size out
  rather than using `.display-lg`, because that class does not exist outside the
  shell and the headline would silently render at 16px.
- **Loading** — a gold rule sweeping the measure, not a spinner.
- **The diary** — `BlogCard` is the homepage card, with `lead` for a two-column
  first item. `categoryAccent` covers the diary's own vocabulary (ricette,
  bottega, storie, avvisi, prodotti) as well as the shop's, or every post falls
  through to house gold and the page comes out one colour.
- **Legal pages** open on paper like everything else. They were the last of the
  near-black slab heroes.

Mechanical conventions the port settled, for anything added later:

| Instead of | Use |
| --- | --- |
| `max-w-7xl` | `max-w-[88rem]` |
| `sm:px-10` | `sm:px-8 lg:px-12` |
| `bg-white/50…70` | `bg-paper` on a warm band, `bg-paper-warm` on a paper one |
| `border-brown-900/10…20` | `border-rule` / `border-rule-strong` |
| `text-brown-900/55…85` | `text-taupe` / `text-brown-700` |
| `rounded-2xl`, `rounded-[28px]` | nothing — the storefront is square but for its buttons |
| `font-light` | nothing — Inter Tight's 400 is the body weight |
| `text-white` | `text-cream` |
| ad-hoc `text-4xl sm:text-5xl` | `.display-xl` / `.display-lg` / `.display-md` |

### Motion
Reduced motion is expressed as a **duration of zero on one element**, never as a
second tree. See `lib/use-reduced-motion-after-mount.ts`: Motion's own hook reads
the media query during the first client render while the server never does, so
branching the markup on it failed hydration for exactly the visitors who asked
for less motion — and, worse, left Motion's entry `opacity: 0` on the node with
nothing to animate it away, so whole sections never appeared. A `whileInView`
rest state must also name **every** property its `initial` set, for the same
reason.

## Typography — HARD CONSTRAINT
- Display/headings: **Playfair Display** (weights 500–700) via `.font-display` — h1 `text-4xl…text-6xl` semibold, h2 `text-3xl/4xl` semibold, card titles `text-lg…2xl`
- Body/UI: **Open Sans** (400–700) — body `text-base leading-relaxed`, secondary `text-sm`, meta `text-xs`
- Eyebrows: `text-xs font-semibold uppercase tracking-[0.15em]`–`[0.2em]`, gold-dark on light / gold on dark
- Never introduce any other typeface.

## Spacing & layout
- Container: `max-w-6xl` + `px-5 sm:px-8` (narrow content pages: `max-w-3xl` / `max-w-2xl`)
- Section rhythm: `py-16 sm:py-24` (secondary bands `sm:py-20`)
- Alternating bands: cream → brown-900/950 dark band → cream → `cream-dark/60`
- Grids: cards `grid gap-6 sm:grid-cols-2` (products `lg:grid-cols-4`, blog `lg:grid-cols-3`); hero/split `lg:grid-cols-2 gap-10`

## Components & patterns
- **Radius**: cards `rounded-2xl` (24px); intro-sequence frames `rounded-[28px]`; buttons/pills `rounded-full`; inputs `rounded-lg`
- **Buttons**: primary = `bg-brown-900 text-cream hover:bg-brown-800` pill; accent = `bg-gold text-brown-950 hover:bg-cream` pill; outline = `border-brown-800 text-brown-900 hover:bg-brown-900 hover:text-cream` pill (on dark: `border-cream/30 text-cream`); most CTAs carry `data-magnetic`
- **Cards**: `rounded-2xl border border-brown-700/15 bg-white/50`, hover `shadow-xl shadow-brown-900/10`; image on top (`aspect-[4/3]`), then eyebrow → Playfair title → muted description
- **Inputs**: `rounded-lg border border-brown-700/25 bg-cream px-3 py-2.5 text-sm focus:border-brown-800`
- **Photos**: rounded-2xl, `border-brown-700/15` (`border-cream/10` on dark); missing photography = labelled cream/tan gradient placeholder with noise
- **Texture**: `.bg-noise` dot-grain overlay on dark bands and placeholders; `.text-shadow-sm` on hero h1
- **3D**: rotating gold coin medallion (R3F) floating at hero image corner
- **Shadows (dark/cinematic)**: `shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]` + `ring-1 ring-black/20` on intro frames

## Motion / animation — signature language
- Ease: `[0.16, 1, 0.3, 1]` for everything; `[0.76, 0, 0.24, 1]` for loader wipes
- Scroll reveals: fade + y 24–28→0, 0.6–0.7s, stagger 0.1, trigger once at `-80px` margin
- Heroes: staggered entrance (eyebrow → title → copy → CTAs, delays 0.1–0.5s); photo parallax y 0→60 / scale 1→1.08 on scroll
- Home intro: 400vh pinned stage, `perspective: 1200px`, spring `{mass .5, stiffness 50, damping 20}`, per-character split reveals, frames flying through z-space
- Lenis smooth scroll (1.3s), page transitions fade+slide 0.45s, magnetic gold cursor on fine pointers
- Everything degrades gracefully under `prefers-reduced-motion`

## Brand & content rules
- Wordmark is text: "Taccalite" in Playfair Display (no logo file); pair with "NORCINERIA DAL 1946" tagline
- Real photos limited to: home-hero-gastronomia.jpg, negozio-centro-formaggi.jpg, negozio-carni-prosciutto.jpg, shop-shelves-prodotti.jpg — everything else uses labelled placeholders
- E-commerce not live: products show "Disponibile in negozio · online a breve"
- Reservation = request, not confirmation ("Ti ricontatteremo per confermare")
- Loyalty area is a simulated preview (state the disclaimer)
