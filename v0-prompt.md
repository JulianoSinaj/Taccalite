# v0 Prompt — Norcineria Taccalite Website

Build a premium, cinematic, high-contrast typography website for **Norcineria Taccalite**, a real family-run Italian norcineria (artisan pork butcher & deli) in Ancona, Marche, Italy, founded in **1946** and now run by the third generation. ALL UI copy must be in **Italian**. The tone is "luxury heritage": warm, artisanal, proud family tradition — never corporate, never minimal-cold.

## The business (real data — use exactly this, do not invent)

Two shops, each with its own specialty:

1. **Taccalite Centro** — specialty: **Formaggi** (cheeses)
   - Address: Piazza Kennedy, 10 — Ancona
   - Hours: Lun–Sab 9:00–20:00 (orario continuato), Domenica: Chiuso
   - Phone: 071 663 5605 · Email: norcineriataccalitepaolo@gmail.com
   - Tagline: "La casa dei grandi formaggi, nel cuore di Ancona"
   - Highlights: formaggi cremosi (gorgonzola, taleggio, roquefort, nuvola di capra), formaggio di fossa e stagionature lunghe, degustazioni in negozio
2. **Taccalite Mercato del Piano** — specialty: **Carni & Salumi**
   - Address: Mercato Coperto del Piano — Ancona
   - Hours: Lun–Sab (orari da confermare in negozio), Domenica: Chiuso
   - Phone: 071 897903
   - Tagline: "Le migliori carni e i salumi della tradizione marchigiana"
   - Highlights: bistecche di razza marchigiana, salumi artigianali di produzione propria, preparazioni per la brace

**Hero product / emotional centerpiece: the porchetta.** Every Saturday morning it comes out of the oven hot at Piazza Kennedy ("la porchetta del sabato"). Family recipe: slow-cooked, crispy skin, wild fennel/rosemary/garlic from the Marche hills. Customers can pre-order by Friday.

Featured products (4): Porchetta artigianale (Specialità della casa), Ciauscolo IGP (Salumi — soft spreadable Marche salami), Pecorino di fossa (Formaggi), Bistecca di razza marchigiana (Carni). E-commerce is NOT live: products show "Disponibile in negozio · online a breve".

Blog posts (3, real): "Torna la porchetta del sabato in Piazza Kennedy" (2026-06-20, Tradizione), "Nuovi arrivi: formaggi cremosi da tutta Italia" (2026-05-14, Prodotti), "Orari di apertura per le prossime festività" (2026-04-02, Avvisi).

Socials: Instagram @norcineriataccalite.centro, Facebook "Norcineria Taccalite".

Other constraints: reservations are a REQUEST, not a confirmation ("Ti ricontatteremo per confermare la disponibilità"). The loyalty area ("Club Taccalite") is a simulated demo (localStorage login) and must show the disclaimer: "Anteprima funzionale: login e punti sono simulati in questo browser."

## Tech stack

- Next.js App Router + TypeScript, Tailwind CSS v4
- **Framer Motion** (`motion/react`) for ALL animation; physics springs, never linear keyframes
- **Lenis** smooth scrolling globally (duration 1.3, exponential ease-out, wheelMultiplier 0.9)
- lucide-react icons (NOTE: no brand icons — inline SVGs for Instagram/Facebook)
- Fonts via next/font/google

## Color system (hard constraint — ONLY these values)

"Marroncino" brown family echoing the physical shopfronts. No pinks, purples, blues, neons. Only allowed gradients: brown-900→brown-950 and image scrims.

| Token | Hex | Usage |
|---|---|---|
| cream | `#f8f2e8` | page background, text on dark |
| cream-dark | `#efe4d2` | alternate section bands |
| brown-950 | `#2a1a10` | darkest bands, footer, hero |
| brown-900 | `#3a2314` | primary buttons, headings on light |
| brown-800 | `#41281b` | body text on light (at /60–/80 opacity) |
| brown-700 | `#5c3820` | hairline borders at /10–/25 |
| brown-600 | `#7a4f30` | rare mid-brown ambience (orbs) |
| tan | `#a79685` | placeholder gradients |
| taupe | `#807868` | muted meta text (dates, captions) |
| gold | `#e1be64` | accent: eyebrows on dark, CTAs, seals |
| gold-dark | `#c9a24e` | eyebrows/accents on light, hover |
| ink | `#221913` | base foreground |
| intro/hero stage bg | `#1c1512` | the near-black warm brown for cinematic heroes |
| destructive | `#b3432f` | errors only |

Card surfaces on light: `bg-white/50–60` with `border brown-900/10`. Signature texture: SVG turbulence/dot-grain noise overlay at 4–10% opacity on all dark bands. Large blurred radial "parallax orbs" (gold and brown-600 at 10% opacity, blur 120px+) floating in dark sections.

## Typography (hard constraint)

- Display/headings: **Playfair Display** (weights 500/600/700, normal + **italic**)
- Body/UI: **Open Sans** (400–700)
- Massive hero headlines: up to `text-[7.5vw]` desktop, `leading-[0.9]`, `tracking-tighter`, semibold. Multi-line stacks where one line is muted (`text-cream/25`) and one line is **gold italic** for contrast (e.g. "Taccalite / Storico / *Porchetta*")
- Section h2: text-5xl→7xl, tracking-tighter
- "Eyebrow" label above every heading: 11px, uppercase, `tracking-[0.3em]`, semibold, gold (`#e1be64` on dark, `#c9a24e` on light)
- Meta/micro text: 10px bold uppercase tracking-widest, taupe or 40% opacity
- Wordmark is TEXT ONLY (no logo file): "TACCALITE" in Playfair bold uppercase tracking-tighter, with "NORCINERIA DAL 1946" underneath at 10px tracking-[0.45em] taupe uppercase

## Signature brand element

A rotating circular-text **medallion seal** (SVG textPath on a circle, 14s linear infinite rotation): "• DAL 1946 • TRADIZIONE MARCHIGIANA • ECCELLENZA •" in gold 8px bold uppercase, with a solid gold disc in the center holding a lucide `Award` (or `Flame` on the porchetta page) icon in brown-950. It overlaps the corner of hero image cards (~160px, offset -32px outside the card corner).

## Global layout & chrome

**Header (fixed, all pages):** left = stacked text wordmark; right = inline nav links (HOME, I NEGOZI, LA PORCHETTA, NEWS, PRENOTA) in 11px bold uppercase tracking-[0.2em], inactive `brown-900/60`, active = brown-950 with a 2px gold bottom border; far right = pill-shaped gold "AREA PERSONALE" button with a user icon. Header background `cream/95` + backdrop-blur-xl, hairline bottom border. On scroll > 100px it compresses (py-5 → py-3) and gains a soft shadow, animated over 500ms.

**Footer (all pages):** `brown-950` background, cream/40 text, py-24+. 4 columns: (1) wordmark + "ECCELLENZA DAL 1946" gold tagline + short brand paragraph; (2) Navigazione links; (3) "Dove trovarci" — both shops with address/name/phone (real data above) + email; (4) Newsletter — short copy + borderless email input with only a bottom hairline that turns gold on focus, gold arrow submit. Bottom bar: hairline top border, tiny 10px uppercase tracking-[0.3em] copyright "© 1946–2026 Norcineria Taccalite" left / "Ancona, Marche" right, and BELOW that, centered, two 48px round-outline social icon buttons (Instagram, Facebook) that fill gold on hover.

**Global extras:** custom magnetic cursor on fine pointers (16px gold ring, mix-blend-difference, grows to 56px over links/buttons, spring-follows the mouse with `{damping:25, stiffness:300, mass:0.5}`); elements marked `data-magnetic` translate toward the cursor by 25% of the offset. Route transitions: AnimatePresence fade + y 14→0, 0.45s. Everything must degrade gracefully under `prefers-reduced-motion`.

## Motion language (apply everywhere)

- Signature easing: `cubic-bezier(0.16, 1, 0.3, 1)` for everything (0.7–1.5s durations)
- Scroll reveals: opacity 0 + y 24–40 → 0, triggered once at `-80px` viewport margin, stagger children by 0.1s
- Scroll-bound parallax through springs: `useScroll` + `useSpring({mass:0.5, stiffness:50, damping:20})` + `useTransform` — never raw linear scroll mapping
- **ScrollDrift**: grid cards bind vertical position to their own scroll progress (`offset: ["start end","end start"]`), drifting from +Ypx to -Ypx as they cross the viewport, with amplitude staggered per column (24 / 42 / 60px). Lenis inertia flows through this naturally.
- Hero entrances: masked line reveals (overflow-hidden parent, child slides up from 105%), staggered 0.15s per line; or per-character split reveals with rotateX -90 + blur(10px) → 0
- IMPORTANT: transforms and opacity ONLY — zero layout shift. All images inside fixed aspect-ratio containers.

## Premium interaction components

1. **PillButton** — pill-shaped CTA, 3 tones: `cream` (bg cream, text brown-950), `gold` (bg gold + gold-tinted shadow `0 10px 20px -5px rgba(225,190,100,0.3)`), `ghost` (border cream/30, text cream, backdrop-blur). On hover: an absolutely-positioned fill layer expands **organically via clip-path** from the bottom edge — `clip-path: circle(0% at 50% 115%)` → `circle(140% at 50% 115%)` over 700ms with the signature ease — while the label flips color (cream/gold tones flood dark brown with cream text; ghost floods cream with dark text). `whileTap={{ scale: 0.95 }}` compression.
2. **FloatCard** — card hover lifts `y: -8` on a spring `{stiffness:260, damping:22, mass:0.6}` while the shadow blooms to a heavy soft blur: `0 48px 90px -30px rgba(42,26,16,0.45)`.
3. **Image zoom**: photos inside cards scale 1→1.05–1.1 over 1.5s on group hover; shop card photos also rotate ±1deg.
4. Cinematic image shadow utility for dark sections: `0 40px 100px -30px rgba(0,0,0,0.85)` + inset 1px white/10 highlight.
5. Decorative offset frame: a `border gold/20 rounded-[40px]` outline translated +16px behind feature images.

## Page structure

### Homepage `/`
1. **Split hero** on `#1c1512`, min-h-screen, noise + one gold orb top-left. LEFT (55%): gold eyebrow "NORCINERIA DAL 1946 · ANCONA"; massive 3-line Playfair stack with masked line reveals — "Taccalite" (cream) / "Storico" (cream at 25%) / "Porchetta" (gold ITALIC); short paragraph (cream/60 light); two PillButtons: cream "Scopri la porchetta" (→ /porchetta) + ghost "Prenota un tavolo" (→ /prenotazioni). RIGHT (45%): large 4:5 food photo card (roast porchetta close-up), crisp rounded-lg corners, cinematic shadow, subtle scroll parallax (y 0→80), gradient scrim, rotating medallion seal overlapping bottom-left corner. Bottom-center: "SCROLL" micro-label with a fading vertical line, animate-bounce.
2. **"I tesori della dispensa"** (bg cream, py-24, px-12): header row = eyebrow "SELEZIONE PREMIUM" + h2 left, uppercase micro-link "VIENI A SCOPRIRLI IN NEGOZIO →" right. 4-column grid of the 4 real products: FloatCard + ScrollDrift, 4:5 image top, category micro-label, Playfair product name, gold "Dettagli →" link that widens its gap on hover.
3. **"Due negozi, una famiglia"** (bg cream-dark, centered header): balanced 3-column grid = two shop cards (4:3 photo with specialty chip floating top-left in cream/90 blur pill, Playfair name, tagline, MapPin + Clock info rows with gold icons, "Esplora il negozio →") + a third DARK card on #1c1512: restaurant photo, eyebrow "OSPITALITÀ", "Prenota una degustazione", copy, full-width cream PillButton.
4. **"Storie e novità"** (bg cream): 3-column blog card grid (16:9 image with dark scrim, date + gold category chip pill, Playfair title that turns gold-dark on hover, excerpt, "Leggi di più →").
5. **CTA band** on #1c1512 with orb: centered big serif line "Il sabato la porchetta esce calda dal forno. *Non fartela scappare.*" (italic gold second sentence) + gold PillButton "Riserva la tua porzione" + ghost "Entra nel Club Taccalite".

### La Porchetta `/porchetta`
Full-screen photo hero (roast close-up at 60% opacity over brown-950, vertical gradient scrims): eyebrow "SPECIALITÀ DELLA CASA", centered "La porchetta: / *la ricetta di famiglia*" (gold italic line), medallion seal with Flame icon bottom-right, scroll cue. Then: brown-900 heritage split ("L'eredità di una ricetta segreta" 6xl–8xl, stats pair "Cottura lenta / 100% locale" as gold italic serif + micro captions, gold pill → #processo, image with offset gold frame). Cream "Come nasce la nostra porchetta" 3-step process grid (4:5 images with numbered gold discs top-left: La selezione / L'aromatizzazione / La cottura lenta). Full-width dark "Il sapore perfetto" image band with text bottom-left. Cream-dark "Quando assaporarla" two cards (Flame: "Ogni sabato mattina" Piazza Kennedy; Bell: "Su prenotazione" entro il venerdì) + gold pill "Riserva la tua porzione". Dark gallery band "Scatti d'autore" (4 square photos). Final brown-950 CTA "Pronto a scoprire il nostro capolavoro?" with gold + ghost pills.

### Negozi `/negozi` and `/negozi/[slug]`
Listing: centered header + the two premium shop cards. Detail page per shop: 85vh photo hero anchored bottom-left with breadcrumb (HOME / I NEGOZI / …), eyebrow = specialty, huge headline with gold italic second line (centro: "Benvenuto nel nostro / *paradiso dei formaggi*"; carni: "Il cuore pulsante della / *tradizione norcina*"), tagline. Brown-900 info band: 3 rounded-[28px] `brown-800/40` cards with gold icons (Clock orari / Phone contatti / MapPin indirizzo + "Apri in Google Maps →" link). Cream "Chi siamo" split with highlights list (gold bullet dots) and stats "1946 / 3 generazioni" + 4:5 image with offset gold frame. Cream-dark products grid (white rounded-[32px] cards, hover -translate-y-4). Brown-950 band of 4 icon feature tiles (gold/10 circles). Cream contact split: shop photo card + white card with "Vieni a trovarci per una degustazione", gold pill "Prenota un tavolo" + outline tel:/mailto buttons. Full-width cross-shop CTA image card → the other shop.

### Prenota `/prenotazioni`
Centered intro: wide 32px-radius food photo card, "Prenota un tavolo" h1, subcopy. Then a max-w-[700px] glassy form card (gradient white/70→white/40, backdrop-blur, cinematic shadow, rounded-[28px]): eyebrow-styled labels; fields Nome, Telefono, Email (opzionale), Data + Ora (with calendar/clock icons inside inputs), **guest count stepper** (pill container with round dark −/+ buttons), Negozio select (the two shops), "Preferenze speciali" checkbox row (Tavolo tranquillo / Celebrazione speciale / Degustazione guidata), Note textarea. Full-width gold submit "CONFERMA PRENOTAZIONE" (uppercase tracked). Success state swaps to a centered card with a gold check disc + "Prenotazione inviata!". Inputs: rounded-xl, `cream-dark/40` fill, hairline border → gold-dark on focus.

### Area Personale `/account` — "Il Club Taccalite"
Logged out: dark brown-900 section with orbs, centered "Il Club Taccalite", white card with the demo disclaimer, Accedi/Registrati pill tabs, name+email fields, gold submit. Logged in: same dark hero with a **gold gradient membership card** (aspect 1.6, rounded-[24px]): "SCHEDA FEDELTÀ" micro-label, Award disc, TACCALITE Playfair, giant points "340 / 500" with a dark progress bar, member name + "#TAC-1946-2026" mono id, QR icon chip. Below on cream: profile card, "Come funziona" list, stats panel (Punti raccolti / Prossimo premio + progress "160 pt mancanti"), dark "Vuoi accumulare più punti?" card with gold pill. Then brown-950 "Catalogo fedeltà" 3-col rewards grid (photo cards with gold serif point prices overlaid: Tagliere della casa 500 / Verdicchio in abbinamento 850 / Porchetta per la famiglia 1200 — "Riscattabile in negozio").

### News `/blog` and `/blog/[slug]`
Listing: centered editorial header — eyebrow "DAL NOSTRO BLOG", "Storie, novità e tradizioni", italic light subcopy — then the 3-col card grid. Article: back-link "← TUTTE LE NEWS", date + category chip, big Playfair title, 16:9 rounded-[32px] hero image, spacious light-weight paragraphs, max-w-3xl.

## Imagery

Warm, moody, editorial Italian food photography: carved roast porchetta close-ups, charcuterie boards, cheese wheels, deli counters, restaurant tables, wine. Dark backgrounds get scrims (`from-brown-950` gradients). Real shop photography exists for: gastronomia counter (hero), cheese counter (Centro), prosciutto/meat counter (Mercato del Piano), product shelves. Everything else = curated stock. Decorative images always in fixed aspect containers with rounded corners (lg to [40px] by prominence).

## Non-negotiables

- Italian copy everywhere; the exact business data above
- Zero layout shift: transform/opacity animations only, fixed aspect-ratio media
- Every scroll/tracking motion passes through a spring; no linear keyframe scaffolds
- Respect `prefers-reduced-motion` (render static, drop parallax/drift/cursor)
- Modular components: PillButton, FloatCard, ScrollDrift, MedallionBadge, SplitHero, Header, Footer isolated and reusable
