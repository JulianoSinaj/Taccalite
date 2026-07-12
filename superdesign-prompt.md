# Superdesign prompt — Taccalite premium redesign

Redesign the Taccalite website into a super-premium, award-level (Awwwards/FWA quality) e-commerce experience for an artisanal Italian porchetta brand that sells heavily online in 2026. Think luxury food house — Aesop meets a Roman salumeria — not a generic shop template.

## Context (respect the existing project)
- Stack: Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/radix, `motion` (motion/react), Lenis smooth scroll, React Three Fiber + drei. Use ONLY these — no GSAP, no new animation libs.
- Existing pages: home, /porchetta (product story), /negozi + /negozi/[slug] (shops), /prenotazioni (reservations), /blog, /account.
- Existing components to evolve, not discard: Hero, Hero3D, Medallion3D, MagneticCursor, IntroLoader, PageTransition, SmoothScroll, Reveal, ScrollDrift, ScrollIntroSequence.
- Palette direction: deep brown-950 surfaces, warm cream text, noise texture overlays. Keep the warm artisanal identity; push it darker, richer, more cinematic.

## Art direction
- Editorial luxury: oversized serif display headlines (tight tracking, ~1.05 line-height), generous whitespace, asymmetric grids, full-bleed photography with grain/noise.
- Cinematic dark canvas with warm amber/copper accents and one signature CTA color. High contrast, minimal UI chrome.
- Everything feels crafted: custom cursor states, magnetic buttons, hover micro-interactions on every interactive element.

## Motion system (the core of the redesign)
- Lenis-driven smooth scroll as the backbone; every scroll animation keyed to scroll progress (`useScroll` + `useTransform`), never on timers.
- Hero: pinned scroll-intro sequence — headline masks/splits per line, product renders scale + parallax as you scroll, background subtly shifts hue.
- Section entrances: staggered line-by-line text reveals (clip-path or y-translate masks), images unclip with scale 1.15 → 1, 0.8–1.2s custom easing `[0.16, 1, 0.3, 1]`.
- Horizontal scroll gallery section for the product range; sticky/pinned storytelling section for the porchetta process (ingredients → roasting → slicing) driven by scroll progress.
- Parallax at 3 depths (background texture, imagery, foreground type) throughout.
- Page transitions: full-screen wipe or curtain via PageTransition, with exit animations — no hard cuts.
- Magnetic cursor + buttons; links get underline-draw hovers; product cards tilt subtly toward cursor (3D perspective transform).

## 3D (React Three Fiber)
- Evolve Hero3D/Medallion3D into a signature centerpiece: a photoreal or stylized porchetta/medallion model with soft studio lighting (drei Environment), slow idle rotation, mouse-follow tilt, and scroll-linked rotation/zoom through the hero.
- Floating 3D brand medallion that persists subtly and animates on section changes.
- Use drei helpers (Float, MeshTransmissionMaterial, ContactShadows). Lazy-load all 3D; degrade to static render on weak devices.

## Conversion (it must sell)
- Sticky mini-cart / buy bar that appears after hero; one-tap add-to-cart with a satisfying micro-animation (item flies to cart, badge pulses).
- Product page: gallery + 3D viewer toggle, weight/size selector, social proof strip, shipping reassurance near CTA.
- Scarcity/freshness cues ("roasted this morning", limited weekly batches) styled elegantly, never spammy.
- Prominent /prenotazioni funnel from every shop page.

## Non-negotiables
- 60fps: transform/opacity only, `will-change` sparingly, no layout-thrashing scroll handlers.
- Full `prefers-reduced-motion` support (the codebase already does this — keep the pattern).
- Responsive: motion simplifies on mobile, never breaks; touch replaces hover states meaningfully.
- Accessibility: semantic HTML, focus states, contrast AA on all text.
- Ship as production-ready TSX components matching the existing file structure in /components.

Start with the homepage: intro loader → pinned 3D hero → scroll story → horizontal product gallery → shops teaser → footer with oversized wordmark reveal.
