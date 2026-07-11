# Theme — Norcineria Taccalite

- CSS approach: **Tailwind CSS v4** (CSS-first config via `@theme inline` in `app/globals.css` — there is NO `tailwind.config.*` file)
- Fonts (next/font/google): **Playfair Display** (`--font-playfair` → `--font-display` / `--font-heading`, weights 500/600/700) for display headings via the `.font-display` utility, **Open Sans** (`--font-open-sans` → `--font-sans`, weights 400–700) for body
- Brand palette: warm "marroncino" browns + cream + gold, echoing the Taccalite shopfronts
- Base radius `0.75rem`; cards typically `rounded-2xl`; pills/CTAs `rounded-full`
- Signature utilities: `.bg-noise` (fine radial-dot grain overlay), `.text-shadow-sm`
- Recurring accents: gold uppercase eyebrows with `tracking-[0.15em]`–`[0.2em]`, dark brown bands (`bg-brown-900`/`bg-brown-950`) alternating with cream sections, `border-brown-700/15` hairlines, `bg-white/50` card surfaces

## Full `app/globals.css`

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

:root {
  /* Brand palette — "marroncino" family, echoing the Taccalite shopfronts */
  --color-cream: #f8f2e8;
  --color-cream-dark: #efe4d2;
  --color-brown-950: #2a1a10;
  --color-brown-900: #3a2314;
  --color-brown-800: #41281b;
  --color-brown-700: #5c3820;
  --color-brown-600: #7a4f30;
  --color-tan: #a79685;
  --color-taupe: #807868;
  --color-gold: #e1be64;
  --color-gold-dark: #c9a24e;
  --color-ink: #221913;
  --background: #f8f2e8;
  --foreground: #221913;
  --card: #fffaf3;
  --card-foreground: #221913;
  --popover: #fffaf3;
  --popover-foreground: #221913;
  --primary: #3a2314;
  --primary-foreground: #f8f2e8;
  --secondary: #efe4d2;
  --secondary-foreground: #3a2314;
  --muted: #efe4d2;
  --muted-foreground: #807868;
  --accent: #e1be64;
  --accent-foreground: #2a1a10;
  --destructive: #b3432f;
  --border: #e6d9c7;
  --input: #e6d9c7;
  --ring: #c9a24e;
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.75rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

@theme inline {
  --color-cream: var(--color-cream);
  --color-cream-dark: var(--color-cream-dark);
  --color-brown-950: var(--color-brown-950);
  --color-brown-900: var(--color-brown-900);
  --color-brown-800: var(--color-brown-800);
  --color-brown-700: var(--color-brown-700);
  --color-brown-600: var(--color-brown-600);
  --color-tan: var(--color-tan);
  --color-taupe: var(--color-taupe);
  --color-gold: var(--color-gold);
  --color-gold-dark: var(--color-gold-dark);
  --color-ink: var(--color-ink);
  --font-display: var(--font-playfair);
  --font-sans: var(--font-open-sans);
  --font-heading: var(--font-playfair);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --color-foreground: var(--foreground);
  --color-background: var(--background);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

body {
  background: var(--color-cream);
  color: var(--color-ink);
  font-family: var(--font-open-sans), Arial, Helvetica, sans-serif;
}

.font-display {
  font-family: var(--font-playfair), Georgia, serif;
}

.text-shadow-sm {
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
}

.bg-noise {
  background-image: radial-gradient(rgba(42, 26, 16, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

## Motion language
- Easing signature: `[0.16, 1, 0.3, 1]` (cinematic ease-out) nearly everywhere; `[0.76, 0, 0.24, 1]` for loader wipes
- Scroll reveals: `Reveal` (opacity 0 / y 28 → 0, duration 0.7, `viewport once, margin -80px`) and `RevealStagger`/`RevealStaggerItem` (staggerChildren 0.1, item y 24, duration 0.6)
- Smooth scrolling: Lenis (duration 1.3, wheelMultiplier 0.9)
- Page transitions: AnimatePresence fade + y 14→0 (0.45s)
- Hero parallax: image y 0→60, scale 1→1.08 tied to scrollYProgress
- Home intro: 400vh pinned 3D perspective stage (perspective 1200px), spring `{mass 0.5, stiffness 50, damping 20}`, per-character SplitReveal titles
- All motion respects `prefers-reduced-motion` (components render static or unmount effects)
