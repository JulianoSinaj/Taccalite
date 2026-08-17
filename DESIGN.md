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
| Porchetta `/porchetta` | Storytell the signature product, drive Saturday visits/preorders |
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
