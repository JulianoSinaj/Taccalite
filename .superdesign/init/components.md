# Components — Norcineria Taccalite

Stack: React 19 · Next.js 16 App Router · Tailwind v4 · motion (`motion/react`) · shadcn/ui on Radix (`radix-ui` single package) · `cn()` = clsx + tailwind-merge (`lib/utils.ts`).

Two tiers of components:
1. **Custom site components** in `components/` — these carry the visual identity and are what pages are built from.
2. **shadcn/ui primitives** in `components/ui/` — only `Button` is currently used in app code (in `Hero`); the rest (badge, card, input, label, navigation-menu, select, separator, sheet, textarea) are installed but unused. Forms use hand-rolled inputs styled with brand classes.

## `lib/utils.ts` (full)

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

---

## SectionHeading — `components/SectionHeading.tsx`
Eyebrow + Playfair h2 + description; `light` flips to cream-on-dark. Used on every page.

```tsx
type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  light?: boolean;
};

export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  light = false,
}: SectionHeadingProps) {
  return (
    <div className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      {eyebrow && (
        <div
          className={`text-xs font-semibold tracking-[0.15em] uppercase ${
            light ? "text-gold" : "text-gold-dark"
          }`}
        >
          {eyebrow}
        </div>
      )}
      <h2
        className={`font-display mt-2 text-3xl font-semibold sm:text-4xl ${
          light ? "text-cream" : "text-brown-900"
        }`}
      >
        {title}
      </h2>
      {description && (
        <p className={`mt-3 text-base leading-relaxed ${light ? "text-cream/70" : "text-brown-800/70"}`}>
          {description}
        </p>
      )}
    </div>
  );
}
```

## Reveal / RevealStagger / RevealStaggerItem — `components/Reveal.tsx`
Scroll-triggered entrance wrappers used around nearly every section.

```tsx
"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: "div" | "span";
};

export default function Reveal({ children, className = "", delay = 0, y = 28, as = "div" }: RevealProps) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as];

  if (reduceMotion) {
    return <Component className={className}>{children}</Component>;
  }

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Component>
  );
}

type StaggerProps = {
  children: ReactNode;
  className?: string;
  gap?: number;
};

export function RevealStagger({ children, className = "" }: StaggerProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ staggerChildren: 0.1 }}
    >
      {children}
    </motion.div>
  );
}

export function RevealStaggerItem({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 24 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}
```

## Photo — `components/Photo.tsx`
Renders a real image if `src` given, else falls back to ImagePlaceholder.

```tsx
import Image from "next/image";
import ImagePlaceholder from "./ImagePlaceholder";

type PhotoProps = {
  src?: string;
  alt: string;
  label: string;
  className?: string;
  ratio?: "square" | "portrait" | "wide" | "banner";
  priority?: boolean;
};

const ratioClasses: Record<NonNullable<PhotoProps["ratio"]>, string> = {
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  wide: "aspect-[4/3]",
  banner: "aspect-[16/7]",
};

export default function Photo({ src, alt, label, className = "", ratio = "wide", priority = false }: PhotoProps) {
  if (!src) {
    return <ImagePlaceholder label={label} ratio={ratio} className={className} />;
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-brown-700/15 ${ratioClasses[ratio]} ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, 50vw"
        className="object-cover"
      />
    </div>
  );
}
```

## ImagePlaceholder — `components/ImagePlaceholder.tsx`
Labelled gradient block standing in for missing photography.

```tsx
type ImagePlaceholderProps = {
  label: string;
  className?: string;
  ratio?: "square" | "portrait" | "wide" | "banner";
};

const ratioClasses: Record<NonNullable<ImagePlaceholderProps["ratio"]>, string> = {
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  wide: "aspect-[4/3]",
  banner: "aspect-[16/7]",
};

/**
 * Real photography from the shop's Instagram/Facebook should replace these.
 * Drop files into /public/images using the same name as the `label` slug
 * and swap this component for a <Image> tag.
 */
export default function ImagePlaceholder({
  label,
  className = "",
  ratio = "wide",
}: ImagePlaceholderProps) {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-2xl border border-brown-700/15 bg-gradient-to-br from-cream-dark via-tan/40 to-brown-700/30 ${ratioClasses[ratio]} ${className}`}
    >
      <div className="bg-noise absolute inset-0 opacity-40" />
      <span className="relative px-6 text-center text-xs font-medium tracking-wide text-brown-800/70 uppercase">
        {label}
      </span>
    </div>
  );
}
```

## Hero — `components/Hero.tsx`
Dark hero band used on `/` (via props), `/negozi/[slug]`, `/porchetta`. Staggered entrance, scroll parallax on the photo, optional 3D medallion.

```tsx
"use client";

import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import Photo from "./Photo";
import Hero3D from "./Hero3D";
import { Button } from "./ui/button";

type HeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  imageLabel: string;
  image?: string;
  primaryCta?: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
  showMedallion?: boolean;
  backLink?: { href: string; label: string };
};

export default function Hero({
  eyebrow,
  title,
  description,
  imageLabel,
  image,
  primaryCta,
  secondaryCta,
  showMedallion = false,
  backLink,
}: HeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, 60]);
  const imageScale = useTransform(scrollYProgress, [0, 1], reduceMotion ? [1, 1] : [1, 1.08]);

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-brown-950">
      <div className="bg-noise absolute inset-0 opacity-20" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:items-center lg:py-28">
        <div>
          {backLink && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Link href={backLink.href} className="text-sm font-medium text-cream/60 hover:text-cream">
                {backLink.label}
              </Link>
            </motion.div>
          )}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className={`text-xs font-semibold tracking-[0.2em] text-gold uppercase ${backLink ? "mt-4" : ""}`}
          >
            {eyebrow}
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-shadow-sm mt-3 text-4xl font-semibold text-cream sm:text-5xl lg:text-6xl"
          >
            {title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="mt-5 max-w-lg text-lg leading-relaxed text-cream/70"
          >
            {description}
          </motion.p>
          {(primaryCta || secondaryCta) && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="mt-8 flex flex-wrap gap-4"
            >
              {primaryCta && (
                <Button asChild variant="accent" size="lg" data-magnetic className="h-auto rounded-full px-6 py-3 text-sm">
                  <Link href={primaryCta.href}>{primaryCta.label}</Link>
                </Button>
              )}
              {secondaryCta && (
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  data-magnetic
                  className="h-auto rounded-full border-cream/30 bg-transparent px-6 py-3 text-sm text-cream hover:border-cream hover:bg-cream/10 hover:text-cream"
                >
                  <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
                </Button>
              )}
            </motion.div>
          )}
        </div>

        <motion.div
          style={{ y: imageY, scale: imageScale }}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.15 }}
          className="relative"
        >
          <Photo src={image} alt={title} label={imageLabel} ratio="wide" className="border-cream/10" priority />
          {showMedallion && (
            <div className="pointer-events-none absolute -bottom-10 -right-6 hidden h-36 w-36 drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:block lg:h-44 lg:w-44">
              <Hero3D />
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
```

## ShopCard — `components/ShopCard.tsx`

```tsx
import Link from "next/link";
import Photo from "./Photo";
import type { Shop } from "@/lib/data";

export default function ShopCard({ shop }: { shop: Shop }) {
  return (
    <Link
      href={`/negozi/${shop.slug}`}
      className="group block overflow-hidden rounded-2xl border border-brown-700/15 bg-white/50 transition-shadow hover:shadow-xl hover:shadow-brown-900/10"
    >
      <Photo
        src={shop.image}
        alt={shop.name}
        label={shop.imageLabel}
        ratio="wide"
        className="rounded-none rounded-t-2xl border-0"
      />
      <div className="p-6">
        <div className="text-xs font-semibold tracking-[0.15em] text-gold-dark uppercase">
          {shop.specialty}
        </div>
        <h3 className="font-display mt-1 text-2xl font-semibold text-brown-900">{shop.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-brown-800/70">{shop.tagline}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brown-900 group-hover:text-gold-dark">
          Scopri il negozio
          <span aria-hidden className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
```

## ProductCard — `components/ProductCard.tsx`

```tsx
import ImagePlaceholder from "./ImagePlaceholder";
import type { Product } from "@/lib/data";

export default function ProductCard({ product }: { product: Product }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-brown-700/15 bg-white/50">
      <ImagePlaceholder label={product.imageLabel} ratio="square" className="rounded-none rounded-t-2xl border-0" />
      <div className="p-5">
        <div className="text-[11px] font-semibold tracking-[0.15em] text-gold-dark uppercase">
          {product.category}
        </div>
        <h3 className="font-display mt-1 text-lg font-semibold text-brown-900">{product.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-brown-800/70">{product.description}</p>
        <span className="mt-4 inline-block rounded-full bg-brown-900/5 px-3 py-1 text-xs font-medium text-brown-800/70">
          Disponibile in negozio · online a breve
        </span>
      </div>
    </div>
  );
}
```

## BlogCard — `components/BlogCard.tsx`

```tsx
import Link from "next/link";
import Photo from "./Photo";
import type { BlogPost } from "@/lib/data";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group block overflow-hidden rounded-2xl border border-brown-700/15 bg-white/50 transition-shadow hover:shadow-xl hover:shadow-brown-900/10"
    >
      <Photo
        src={post.image}
        alt={post.title}
        label={post.imageLabel}
        ratio="wide"
        className="rounded-none rounded-t-2xl border-0"
      />
      <div className="p-5">
        <div className="text-xs font-medium text-taupe">{formatDate(post.date)}</div>
        <h3 className="font-display mt-1 text-xl font-semibold text-brown-900 group-hover:text-gold-dark">
          {post.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-brown-800/70">{post.excerpt}</p>
      </div>
    </Link>
  );
}
```

## ReservationForm — `components/ReservationForm.tsx`
Brand-styled form posting to `/api/prenotazioni`; success state swaps to a confirmation card.

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { shops } from "@/lib/data";

type Status = "idle" | "submitting" | "success" | "error";

export default function ReservationForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError(null);

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/prenotazioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Errore imprevisto");
      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Errore imprevisto");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-brown-700/15 bg-white/60 p-8 text-center">
        <h3 className="font-display text-2xl font-semibold text-brown-900">Richiesta inviata!</h3>
        <p className="mt-2 text-brown-800/70">
          Grazie per la tua prenotazione. Ti contatteremo al più presto per confermare.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-5 rounded-full border border-brown-800 px-5 py-2 text-sm font-semibold text-brown-900 hover:bg-brown-900 hover:text-cream"
        >
          Invia un&apos;altra richiesta
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 rounded-2xl border border-brown-700/15 bg-white/60 p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome e cognome" name="name" required />
        <Field label="Telefono" name="phone" type="tel" required />
      </div>
      <Field label="Email" name="email" type="email" />
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Data" name="date" type="date" required />
        <Field label="Ora" name="time" type="time" required />
        <Field label="Numero persone" name="guests" type="number" min={1} defaultValue={2} required />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-brown-900" htmlFor="shop">
          Negozio
        </label>
        <select
          id="shop"
          name="shop"
          required
          className="w-full rounded-lg border border-brown-700/25 bg-cream px-3 py-2.5 text-sm text-brown-900 focus:border-brown-800 focus:outline-none"
        >
          {shops.map((shop) => (
            <option key={shop.slug} value={shop.slug}>
              {shop.name} — {shop.specialty}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-brown-900" htmlFor="notes">
          Note (opzionale)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="w-full rounded-lg border border-brown-700/25 bg-cream px-3 py-2.5 text-sm text-brown-900 focus:border-brown-800 focus:outline-none"
        />
      </div>

      {error && <p className="text-sm font-medium text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-full bg-brown-900 px-6 py-3 text-sm font-semibold text-cream hover:bg-brown-800 disabled:opacity-60"
      >
        {status === "submitting" ? "Invio in corso…" : "Invia richiesta di prenotazione"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  min,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  min?: number;
  defaultValue?: string | number;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-brown-900" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        min={min}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-brown-700/25 bg-cream px-3 py-2.5 text-sm text-brown-900 focus:border-brown-800 focus:outline-none"
      />
    </div>
  );
}
```

## AccountArea — `components/AccountArea.tsx`
Demo login/register (localStorage) → LoyaltyCard when "logged in".

```tsx
"use client";

import { useEffect, useState } from "react";
import LoyaltyCard from "./LoyaltyCard";

const STORAGE_KEY = "taccalite-demo-account";

export default function AccountArea() {
  const [name, setName] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [formName, setFormName] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setName(window.localStorage.getItem(STORAGE_KEY));
    setReady(true);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = formName.trim() || "Cliente Taccalite";
    window.localStorage.setItem(STORAGE_KEY, value);
    setName(value);
  }

  function handleLogout() {
    window.localStorage.removeItem(STORAGE_KEY);
    setName(null);
    setFormName("");
  }

  if (!ready) return null;

  return (
    <div>
      <div className="mb-8 rounded-xl border border-gold-dark/30 bg-gold/10 px-4 py-3 text-sm text-brown-900">
        Anteprima funzionale: login e punti sono simulati in questo browser. Per l&apos;area
        personale reale serve un sistema di autenticazione e un database collegati al sito.
      </div>

      {name ? (
        <div className="space-y-6">
          <LoyaltyCard name={name} />
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-brown-800 px-5 py-2 text-sm font-semibold text-brown-900 hover:bg-brown-900 hover:text-cream"
          >
            Esci
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-brown-700/15 bg-white/60 p-6 sm:p-8">
          <div className="mb-6 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                mode === "login" ? "bg-brown-900 text-cream" : "text-brown-800/60"
              }`}
            >
              Accedi
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                mode === "register" ? "bg-brown-900 text-cream" : "text-brown-800/60"
              }`}
            >
              Registrati
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-brown-900" htmlFor="account-name">
                Nome e cognome
              </label>
              <input
                id="account-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-lg border border-brown-700/25 bg-cream px-3 py-2.5 text-sm text-brown-900 focus:border-brown-800 focus:outline-none"
                placeholder="Mario Rossi"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-brown-900" htmlFor="account-email">
                Email
              </label>
              <input
                id="account-email"
                type="email"
                className="w-full rounded-lg border border-brown-700/25 bg-cream px-3 py-2.5 text-sm text-brown-900 focus:border-brown-800 focus:outline-none"
                placeholder="mario.rossi@email.it"
              />
            </div>
            <button
              type="submit"
              className="mt-2 rounded-full bg-brown-900 px-6 py-3 text-sm font-semibold text-cream hover:bg-brown-800"
            >
              {mode === "login" ? "Accedi" : "Crea account"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
```

## LoyaltyCard — `components/LoyaltyCard.tsx`

```tsx
const POINTS = 340;
const NEXT_REWARD = 500;

export default function LoyaltyCard({ name }: { name: string }) {
  const pct = Math.min(100, Math.round((POINTS / NEXT_REWARD) * 100));

  return (
    <div className="overflow-hidden rounded-2xl border border-brown-700/15 bg-gradient-to-br from-brown-900 to-brown-950 p-6 text-cream sm:p-8">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">
            Scheda Fedeltà
          </div>
          <div className="font-display mt-1 text-2xl font-semibold">Taccalite</div>
        </div>
        <span className="rounded-full border border-gold/40 px-3 py-1 text-xs font-medium text-gold">
          Cliente
        </span>
      </div>

      <div className="mt-8">
        <div className="text-sm text-cream/60">Titolare</div>
        <div className="font-display text-xl">{name}</div>
      </div>

      <div className="mt-6">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-cream/60">Punti raccolti</span>
          <span className="font-semibold text-gold">
            {POINTS} / {NEXT_REWARD}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-cream/10">
          <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-cream/50">
          Ti mancano {NEXT_REWARD - POINTS} punti per il tuo prossimo premio.
        </p>
      </div>
    </div>
  );
}
```

## IntroLoader — `components/IntroLoader.tsx` (global overlay)

```tsx
"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const TOTAL_DURATION = 2.6;
const EXIT_DURATION = 0.9;

export default function IntroLoader() {
  const [phase, setPhase] = useState<"loading" | "exiting" | "done">("loading");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      setPhase("done");
      return;
    }
    document.body.style.overflow = "hidden";
    const exitTimer = setTimeout(() => setPhase("exiting"), TOTAL_DURATION * 1000);
    return () => clearTimeout(exitTimer);
  }, [reduceMotion]);

  useEffect(() => {
    if (phase === "exiting") {
      const doneTimer = setTimeout(() => {
        setPhase("done");
        document.body.style.overflow = "";
      }, EXIT_DURATION * 1000);
      return () => clearTimeout(doneTimer);
    }
  }, [phase]);

  function handleSkip() {
    if (phase === "loading") setPhase("exiting");
  }

  if (phase === "done") return null;

  return (
    <motion.div
      className="bg-noise fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-brown-950"
      role="presentation"
      aria-hidden="true"
      initial={{ clipPath: "inset(0% 0% 0% 0%)" }}
      animate={{ clipPath: phase === "exiting" ? "inset(0% 0% 100% 0%)" : "inset(0% 0% 0% 0%)" }}
      transition={{ duration: EXIT_DURATION, ease: [0.76, 0, 0.24, 1] }}
    >
      <motion.svg width="132" height="132" viewBox="0 0 132 132" initial="hidden" animate="visible" className="mb-6">
        <motion.circle
          cx="66"
          cy="66"
          r="60"
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="1"
          variants={{
            hidden: { pathLength: 0, opacity: 0 },
            visible: { pathLength: 1, opacity: 1, transition: { duration: 1.4, ease: "easeInOut" } },
          }}
        />
        <motion.circle
          cx="66"
          cy="66"
          r="50"
          fill="none"
          stroke="var(--color-gold)"
          strokeOpacity="0.4"
          strokeWidth="0.5"
          variants={{
            hidden: { pathLength: 0, opacity: 0 },
            visible: { pathLength: 1, opacity: 1, transition: { duration: 1.4, ease: "easeInOut", delay: 0.15 } },
          }}
        />
      </motion.svg>

      <motion.div
        className="font-display absolute text-3xl font-semibold tracking-wide text-cream"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.9, ease: "easeOut" }}
      >
        Taccalite
      </motion.div>

      <motion.p
        className="mt-24 text-xs font-medium tracking-[0.25em] text-cream/50 uppercase"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.3 }}
      >
        Norcineria di famiglia · dal 1946
      </motion.p>

      <motion.div
        className="mt-8 h-px w-40 overflow-hidden bg-cream/10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.4 }}
      >
        <motion.div
          className="h-full bg-gold"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          style={{ transformOrigin: "left", width: "100%" }}
          transition={{ duration: 1.1, delay: 1.5, ease: [0.76, 0, 0.24, 1] }}
        />
      </motion.div>

      <motion.button
        type="button"
        onClick={handleSkip}
        className="absolute right-6 bottom-6 text-xs font-medium tracking-wide text-cream/40 hover:text-cream sm:right-10 sm:bottom-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
      >
        Salta →
      </motion.button>
    </motion.div>
  );
}
```

## MagneticCursor — `components/MagneticCursor.tsx` (global)

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

export default function MagneticCursor() {
  const [ready, setReady] = useState(false);
  const [hovering, setHovering] = useState(false);
  const activeMagnet = useRef<HTMLElement | null>(null);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const springX = useSpring(x, { damping: 25, stiffness: 300, mass: 0.5 });
  const springY = useSpring(y, { damping: 25, stiffness: 300, mass: 0.5 });

  useEffect(() => {
    const isFinePointer = window.matchMedia("(pointer: fine)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!isFinePointer || reduceMotion) return;
    setReady(true);

    function resetMagnet() {
      if (activeMagnet.current) {
        activeMagnet.current.style.transform = "";
        activeMagnet.current = null;
      }
    }

    function handleMove(e: MouseEvent) {
      x.set(e.clientX);
      y.set(e.clientY);

      const target = e.target as HTMLElement | null;
      const interactive = target?.closest("a, button");
      setHovering(!!interactive);

      const magnet = target?.closest<HTMLElement>("[data-magnetic]") ?? null;
      if (magnet !== activeMagnet.current) resetMagnet();
      if (magnet) {
        const rect = magnet.getBoundingClientRect();
        const relX = e.clientX - rect.left - rect.width / 2;
        const relY = e.clientY - rect.top - rect.height / 2;
        magnet.style.transition = "transform 0.2s ease-out";
        magnet.style.transform = `translate(${relX * 0.25}px, ${relY * 0.25}px)`;
        activeMagnet.current = magnet;
      }
    }

    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      resetMagnet();
    };
  }, [x, y]);

  if (!ready) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[9998] rounded-full border border-gold mix-blend-difference"
      style={{ x: springX, y: springY, translateX: "-50%", translateY: "-50%" }}
      animate={{ width: hovering ? 56 : 16, height: hovering ? 56 : 16 }}
      transition={{ duration: 0.2 }}
    />
  );
}
```

## SmoothScroll — `components/SmoothScroll.tsx` (global)

```tsx
"use client";

import { useEffect } from "react";
import Lenis from "lenis";

export default function SmoothScroll() {
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const lenis = new Lenis({
      duration: 1.3,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
    });

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return null;
}
```

## Hero3D + Medallion3D — `components/Hero3D.tsx`, `components/Medallion3D.tsx`
React Three Fiber gold coin medallion overlaid on hero photos (`showMedallion`). Hero3D lazy-loads the canvas client-side and bails on reduced motion.

```tsx
// components/Hero3D.tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Medallion3D = dynamic(() => import("./Medallion3D"), { ssr: false });

export default function Hero3D({ className = "" }: { className?: string }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setEnabled(!reduceMotion);
  }, []);

  if (!enabled) return null;

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`}>
      <div className="pointer-events-auto h-full w-full">
        <Medallion3D />
      </div>
    </div>
  );
}
```

```tsx
// components/Medallion3D.tsx
"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

function Medallion() {
  const group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.22;
    }
  });

  return (
    <group ref={group} rotation={[0.35, 0, 0]}>
      {/* Coin body */}
      <mesh receiveShadow castShadow>
        <cylinderGeometry args={[1.5, 1.5, 0.22, 72]} />
        <meshStandardMaterial color="#c9a24e" metalness={0.85} roughness={0.32} />
      </mesh>

      {/* Rim highlight */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.5, 0.055, 16, 72]} />
        <meshStandardMaterial color="#e1be64" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Inner stamped disc */}
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[1.08, 1.08, 0.05, 72]} />
        <meshStandardMaterial color="#3a2314" metalness={0.25} roughness={0.65} />
      </mesh>

      {/* Center emblem ring */}
      <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.03, 12, 48]} />
        <meshStandardMaterial color="#e1be64" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Small central boss */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.08, 48]} />
        <meshStandardMaterial color="#c9a24e" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

export default function Medallion3D() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.6, 4.2], fov: 40 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[2.5, 3, 2]} intensity={1.4} color="#fff3d6" castShadow />
      <pointLight position={[-2.5, -1, -2]} intensity={0.6} color="#e1be64" />
      <pointLight position={[0, -2, 2]} intensity={0.3} color="#ffffff" />
      <Medallion />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 2.6}
        maxPolarAngle={Math.PI / 1.7}
        rotateSpeed={0.5}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  );
}
```

---

## shadcn/ui primitives (`components/ui/`)

Only **Button** is referenced by app code (Hero CTAs). The rest are installed but unused; forms use inline brand-styled elements instead. Included: the used Button in full; others summarized.

### Button — `components/ui/button.tsx` (USED)

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        accent: "bg-accent text-accent-foreground hover:bg-cream",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

Note the custom **`accent`** variant (`bg-accent text-accent-foreground hover:bg-cream` = gold pill) used for primary hero CTAs.

### Installed but currently unused
- `badge.tsx` — cva badge (default/secondary/destructive/outline/ghost/link), h-5 pill
- `card.tsx` — Card/CardHeader/CardTitle/CardDescription/CardAction/CardContent/CardFooter with `--card-spacing` system, `ring-1 ring-foreground/10`, `font-heading` titles
- `input.tsx` — h-8 rounded-lg bordered input with ring focus
- `label.tsx` — Radix label
- `navigation-menu.tsx`, `select.tsx`, `sheet.tsx` — stock shadcn Radix wrappers
- `separator.tsx` — Radix separator
- `textarea.tsx` — min-h-16 field-sizing textarea
