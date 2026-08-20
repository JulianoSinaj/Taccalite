"use client";

import { useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion, useSpring } from "motion/react";
import { useReducedMotionAfterMount } from "@/lib/use-reduced-motion-after-mount";
import { ArrowRight, ArrowUpRight, Clock, MapPin, Navigation, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OpenState } from "@/lib/hours";

/** Serializable slice of a shop the locator needs (built server-side by the page). */
export type LocatorShop = {
  slug: string;
  name: string;
  specialty: string;
  address: string;
  phone: string;
  image: string;
  /** Today's hours row, if it could be resolved from the freeform data. */
  today: { label: string; value: string } | null;
  hoursConfirmed: boolean;
  open: OpenState | null;
  /** Free-text query used for both the embed and the "Indicazioni" deep link. */
  mapsQuery: string;
};

const CONSENT_KEY = "taccalite-cookie-consent";
const MAP_SESSION_KEY = "taccalite-map-loaded";
const EASE = [0.16, 1, 0.3, 1] as const;

function embedUrl(query: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=16&hl=it&output=embed`;
}
function directionsUrl(query: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}
function telHref(phone: string) {
  return `tel:${phone.replace(/\s/g, "")}`;
}

/** Live open/closed pill for cream surfaces. Renders nothing when state is null. */
export function OpenPill({ state, className }: { state: OpenState | null; className?: string }) {
  if (!state) return null;
  const detail = state.nextChange
    ? state.open
      ? ` · chiude ${state.nextChange}`
      : ` · apre ${state.nextChange}`
    : "";
  return state.open ? (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-green-700/12 px-3 py-1 text-[10px] font-bold tracking-widest text-green-800 uppercase",
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
      Aperto ora{detail}
    </span>
  ) : (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-brown-900/8 px-3 py-1 text-[10px] font-bold tracking-widest text-taupe uppercase",
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-brown-800/40" />
      Chiuso{detail}
    </span>
  );
}

/**
 * Anchor that gently tracks the cursor (spring-weighted) and compresses on tap.
 * External by default — every use here is a Google Maps / tel: link.
 */
function MagneticAnchor({
  href,
  children,
  className,
  external = true,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  external?: boolean;
}) {
  const reduce = useReducedMotionAfterMount();
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useSpring(0, { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(0, { stiffness: 220, damping: 18, mass: 0.4 });

  function onMove(e: MouseEvent<HTMLAnchorElement>) {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * 0.28);
    y.set((e.clientY - (r.top + r.height / 2)) * 0.28);
  }
  function onLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.a
      ref={ref}
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ x, y, willChange: "transform" }}
      whileTap={{ scale: 0.96 }}
      className={className}
    >
      {children}
    </motion.a>
  );
}

/* Map-consent store: true when the visitor accepted all cookies from the
 * banner, or already opted into the map earlier this session. Read via
 * useSyncExternalStore so SSR renders the gated placeholder and the client
 * upgrades without a setState-in-effect cascade. */
function subscribeConsent(cb: () => void) {
  window.addEventListener("taccalite:consent", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("taccalite:consent", cb);
    window.removeEventListener("storage", cb);
  };
}
function readConsent() {
  try {
    return (
      window.localStorage.getItem(CONSENT_KEY) === "accepted" ||
      window.sessionStorage.getItem(MAP_SESSION_KEY) === "1"
    );
  } catch {
    return false; // private mode — stay gated
  }
}

export default function ShopLocator({ shops }: { shops: LocatorShop[] }) {
  const reduce = useReducedMotionAfterMount();
  const [activeSlug, setActiveSlug] = useState(shops[0]?.slug ?? "");
  const [optedIn, setOptedIn] = useState(false);
  const storedConsent = useSyncExternalStore(subscribeConsent, readConsent, () => false);
  const mapReady = storedConsent || optedIn;
  const active = shops.find((s) => s.slug === activeSlug) ?? shops[0];

  function loadMap() {
    try {
      window.sessionStorage.setItem(MAP_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setOptedIn(true);
  }

  if (!active) return null;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
      {/* ── Shop switcher ─────────────────────────────────────────────── */}
      <div className="lg:col-span-5" role="tablist" aria-label="Scegli la bottega">
        <ul className="space-y-3">
          {shops.map((shop, i) => {
            const selected = shop.slug === active.slug;
            return (
              <li key={shop.slug} className="relative">
                <motion.button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`locator-panel-${shop.slug}`}
                  onClick={() => setActiveSlug(shop.slug)}
                  whileTap={reduce ? undefined : { scale: 0.99 }}
                  className={cn(
                    "group relative w-full overflow-hidden  border p-6 text-left transition-colors duration-500 sm:p-7",
                    selected
                      ? "border-rule-strong bg-paper"
                      : "border-rule bg-paper-warm hover:border-rule-strong hover:bg-paper"
                  )}
                >
                  {selected && (
                    <motion.span
                      layoutId="locator-active-bar"
                      aria-hidden
                      className="absolute inset-y-6 left-0 w-1 rounded-r-full bg-gold-dark"
                      transition={{ type: "spring", stiffness: 380, damping: 34 }}
                    />
                  )}
                  <div className="flex items-start gap-5">
                    <span className="font-display text-4xl leading-none font-bold text-brown-950/10 sm:text-5xl">
                      0{i + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="eyebrow eyebrow-dark">{shop.specialty}</span>
                        <OpenPill state={shop.open} />
                      </div>
                      <h3 className="font-display text-2xl leading-tight tracking-tight text-brown-950 sm:text-3xl">
                        {shop.name}
                      </h3>
                      <p className="flex items-start gap-2 text-sm font-semibold text-brown-700">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-gold-deep" />
                        {shop.address}
                      </p>
                    </div>
                    <ArrowRight
                      className={cn(
                        "mt-1 size-4 shrink-0 text-gold-deep transition-transform duration-500",
                        selected ? "rotate-90" : "group-hover:translate-x-1"
                      )}
                    />
                  </div>

                  <AnimatePresence initial={false}>
                    {selected && (
                      <motion.div
                        key="details"
                        id={`locator-panel-${shop.slug}`}
                        role="tabpanel"
                        initial={reduce ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={reduce ? undefined : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.55, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <div className="mt-6 space-y-3 border-t border-rule pt-6 text-sm font-semibold text-brown-700">
                          <p className="flex items-center gap-3">
                            <Clock className="size-4 shrink-0 text-gold-deep" />
                            {shop.today ? (
                              <>
                                Oggi ({shop.today.label}): {shop.today.value}
                              </>
                            ) : (
                              <>Orari: chiamaci per conferma</>
                            )}
                          </p>
                          {!shop.hoursConfirmed && (
                            <p className="pl-7 text-xs font-medium text-taupe">
                              Orari da confermare in negozio.
                            </p>
                          )}
                          <p className="flex items-center gap-3">
                            <Phone className="size-4 shrink-0 text-gold-deep" />
                            {shop.phone}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              </li>
            );
          })}
        </ul>

        {/* Actions for the active shop — outside the tab button so they're real links. */}
        <div className="mt-6 grid grid-cols-2 items-center gap-3 sm:flex sm:flex-wrap sm:gap-4">
          <MagneticAnchor
            href={directionsUrl(active.mapsQuery)}
            className="inline-flex items-center justify-center gap-3 rounded-full bg-brown-950 px-5 py-4 text-sm font-semibold text-cream transition-colors duration-500 hover:bg-brown-900 sm:px-7 sm:py-3.5"
          >
            <Navigation className="size-4" />
            Indicazioni
          </MagneticAnchor>
          <MagneticAnchor
            href={telHref(active.phone)}
            external={false}
            className="inline-flex items-center justify-center gap-3 rounded-full border border-brown-950/20 px-5 py-4 text-sm font-semibold text-brown-950 transition-colors duration-500 hover:bg-brown-950/5 sm:px-7 sm:py-3.5"
          >
            <Phone className="size-4" />
            Chiama
          </MagneticAnchor>
          <Link
            href={`/sedi/${active.slug}`}
            className="underline-draw col-span-2 inline-flex items-center justify-center gap-2 py-3 text-sm font-semibold text-brown-950 sm:col-span-1 sm:justify-start sm:py-3.5"
          >
            Scopri la bottega
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      {/* ── Map ───────────────────────────────────────────────────────── */}
      <div className="lg:col-span-7">
        <div className="cinematic-shadow relative min-h-[300px] overflow-hidden bg-brown-950 sm:aspect-[4/3] sm:min-h-0 lg:aspect-auto lg:h-full lg:min-h-[560px]">
          <AnimatePresence mode="wait" initial={false}>
            {mapReady ? (
              <motion.div
                key={`map-${active.slug}`}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="absolute inset-0"
              >
                <iframe
                  title={`Mappa — ${active.name}`}
                  src={embedUrl(active.mapsQuery)}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                  className="h-full w-full border-0 grayscale-[35%] contrast-[1.05] transition-[filter] duration-700 hover:grayscale-0"
                />
              </motion.div>
            ) : (
              <motion.div
                key={`placeholder-${active.slug}`}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="absolute inset-0"
              >
                <Image
                  src={active.image}
                  alt=""
                  fill
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  className="object-cover opacity-50 blur-[2px] scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-brown-950/90 via-brown-950/60 to-brown-950/40" />
                <div className="bg-noise absolute inset-0 opacity-15" />
                <div className="relative flex h-full min-h-[440px] flex-col items-center justify-center gap-5 px-6 py-10 text-center sm:min-h-0 sm:gap-6 sm:px-8">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 bg-brown-950/40 text-gold backdrop-blur sm:h-16 sm:w-16">
                    <MapPin className="size-6 sm:size-7" />
                  </span>
                  <div className="space-y-2">
                    <span className="eyebrow block">Mappa · Google Maps</span>
                    <p className="font-display text-3xl leading-tight tracking-tight text-cream sm:text-4xl">
                      {active.name}
                    </p>
                    <p className="text-sm text-cream/70">{active.address}</p>
                  </div>
                  <motion.button
                    type="button"
                    onClick={loadMap}
                    whileTap={reduce ? undefined : { scale: 0.96 }}
                    className="inline-flex items-center gap-3 rounded-full bg-gold px-8 py-3.5 text-sm font-semibold text-brown-950 shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-colors duration-500 hover:bg-gold-dark"
                  >
                    Mostra la mappa
                    <ArrowUpRight className="size-4" />
                  </motion.button>
                  <p className="max-w-sm text-[11px] leading-relaxed text-cream/55">
                    La mappa è fornita da Google: caricandola, il tuo indirizzo IP viene inviato a
                    Google.{" "}
                    <Link href="/cookie" className="underline hover:text-cream">
                      Cookie policy
                    </Link>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
