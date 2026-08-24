"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Check, Flame, MapPin, Minus, Phone, Plus } from "lucide-react";
import Magnetic from "@/components/site/Magnetic";
import { SectionMark } from "@/components/site/sedi/Ornaments";
import { useReducedMotionAfterMount } from "@/lib/use-reduced-motion-after-mount";
import { formatEuro, formatKg } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────────────────
 * The porchetta order sheet.
 *
 * Every choice a customer makes at the counter — how much, which bottega, which
 * Saturday, how they want it cut — laid out as one numbered sheet with a running
 * summary beside it, instead of a generic booking form with a "Porchetta" tab.
 * It posts to the same `/api/prenotazioni` endpoint the general form uses, so
 * the gestionale, the capacity cap, the waitlist and the emails all see exactly
 * the reservation they already know.
 *
 * Availability, closures and the booking cutoff are resolved on the server and
 * arrive as data; this component only decides what to say about them.
 * ────────────────────────────────────────────────────────────────────────── */

export type ConfiguratorShop = {
  slug: string;
  name: string;
  specialty: string;
  address: string;
  phone: string;
};

export type ConfiguratorSlot = {
  /** Cap in force for that shop on that day; 0 = none published. */
  capacityKg: number;
  remainingKg: number;
  isFull: boolean;
  /** The closure sentence when the shop is shut that day, else null. */
  closed: string | null;
};

export type ConfiguratorDay = {
  iso: string;
  /** "Sabato 29 agosto" */
  label: string;
  /** "29 ago" */
  short: string;
  /** "venerdì 28 agosto" */
  cutoffLabel: string;
  /** False once the cutoff has passed: that batch is by phone only. */
  bookable: boolean;
  /** Keyed by shop slug. */
  shops: Record<string, ConfiguratorSlot>;
};

type Props = {
  shops: ConfiguratorShop[];
  days: ConfiguratorDay[];
  /** From the e-shop's porchetta product; null when it isn't priced online. */
  pricePerKgCents: number | null;
  /** "sabato" — the pickup weekday, from the setting. */
  pickupDayName: string;
};

type Status = "idle" | "submitting" | "success" | "error";

const MIN_KG = 0.5;
const MAX_KG = 50;
const STEP_KG = 0.5;

/** Roughly two etti a head — a generous panino, or a plate with sides. */
const PORTION_KG = 0.22;

const PRESETS = [
  { kg: 0.5, name: "Per due", hint: "2–3 persone" },
  { kg: 1, name: "Per la famiglia", hint: "4–5 persone" },
  { kg: 1.5, name: "Per la tavolata", hint: "6–8 persone" },
  { kg: 2, name: "Per la festa", hint: "8–10 persone" },
] as const;

/**
 * What the counter is actually asked for. Each becomes a line in the notes the
 * shop reads, the way the table form's preferences already do — they are
 * requests, not guarantees, and the sheet says so.
 */
const PREFERENCES = [
  { key: "A fette sottili", hint: "per il panino" },
  { key: "A fette spesse", hint: "da piatto" },
  { key: "In pezzo unico", hint: "la tagli tu" },
  { key: "Con più crosta", hint: "la parte croccante" },
  { key: "Parte più magra", hint: "meno grasso" },
] as const;

const inputClasses =
  "w-full border border-rule-strong bg-paper px-4 py-3.5 text-sm text-brown-950 transition-colors placeholder:text-taupe focus:border-gold-dark focus:outline-none";

const EASE = [0.16, 1, 0.3, 1] as const;

function clampKg(kg: number): number {
  const stepped = Math.round(kg / STEP_KG) * STEP_KG;
  return Math.min(MAX_KG, Math.max(MIN_KG, stepped));
}

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** What a day chip says about one shop, in five words or fewer. */
function slotCaption(day: ConfiguratorDay, slot: ConfiguratorSlot | undefined): string {
  if (!day.bookable) return "Prenotazioni chiuse";
  if (!slot) return "Non disponibile";
  if (slot.closed) return "Chiuso";
  if (slot.capacityKg > 0) {
    return slot.isFull ? "Al completo · lista d'attesa" : `${formatKg(slot.remainingKg)} kg disponibili`;
  }
  return "Disponibile";
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="eyebrow eyebrow-dark block" htmlFor={htmlFor}>
        {label}
        {optional && <span className="normal-case tracking-normal text-taupe"> · facoltativa</span>}
      </label>
      {children}
    </div>
  );
}

/**
 * A ledger row with a dotted leader — `LeaderRow` from the sedi ornaments, but
 * with a value that wraps, because "Taccalite Mercato del Piano" and three
 * cutting preferences do not fit on one line of a 300px card.
 */
function Row({ label, value, emphasis }: { label: string; value: ReactNode; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 py-3">
      <span className="shrink-0 text-sm font-semibold text-brown-950">{label}</span>
      <span aria-hidden className="mb-1 min-w-4 flex-1 border-b border-dotted border-rule-strong" />
      <span
        className={cn(
          "min-w-0 max-w-[62%] text-right text-sm text-brown-700 tabular-nums",
          emphasis && "font-semibold text-brown-950"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default function PorchettaConfigurator({ shops, days, pricePerKgCents, pickupDayName }: Props) {
  const uid = useId();
  const formId = `${uid}-porchetta`;
  const reduceMotion = useReducedMotionAfterMount();

  // Everything springs; nothing tweens. Under reduced motion the same elements
  // arrive instantly — one tree, as everywhere else on the site.
  const spring = reduceMotion
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 420, damping: 34, mass: 0.6 } as const);
  const tap = reduceMotion ? undefined : { scale: 0.97 };

  const [kg, setKg] = useState(1);
  const [shopSlug, setShopSlug] = useState(shops[0]?.slug ?? "");
  const [dayIso, setDayIso] = useState(() => (days.find((d) => d.bookable) ?? days[0])?.iso ?? "");
  const [prefs, setPrefs] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string | null; kg: number; shop: string; day: string } | null>(
    null
  );

  const shop = shops.find((s) => s.slug === shopSlug) ?? null;
  const day = days.find((d) => d.iso === dayIso) ?? null;
  const slot = day && shop ? day.shops[shop.slug] : undefined;

  const isPreset = PRESETS.some((p) => p.kg === kg);
  const people = Math.max(1, Math.round(kg / PORTION_KG));
  const estimateCents = pricePerKgCents != null ? Math.round(pricePerKgCents * kg) : null;

  // Why the sheet cannot be sent, if it cannot — or why it will be waitlisted.
  const notBookable = day ? !day.bookable : false;
  const closed = slot?.closed ?? null;
  const overCap = !!slot && !closed && slot.capacityKg > 0 && kg > slot.remainingKg;
  const blocked = !day || !shop || notBookable || !!closed;

  const notice = (() => {
    if (!day || !shop) return null;
    if (notBookable)
      return {
        key: "cutoff",
        tone: "warn" as const,
        text: `Per ${day.label.toLowerCase()} le prenotazioni online sono chiuse (entro ${day.cutoffLabel}). Scegli il ${pickupDayName} dopo, o chiama la bottega.`,
      };
    if (closed) return { key: "closed", tone: "warn" as const, text: closed };
    if (overCap && slot)
      return {
        key: "waitlist",
        tone: "info" as const,
        text:
          slot.remainingKg > 0
            ? `Per quel giorno restano ${formatKg(slot.remainingKg)} kg da ${shop.name}: la richiesta andrà in lista d'attesa e ti richiamiamo noi.`
            : `${shop.name} è al completo per quel giorno: la richiesta andrà in lista d'attesa e ti richiamiamo noi.`,
      };
    return null;
  })();

  // What the slot under the ledger says when there is nothing to warn about:
  // the availability itself, so the reserved space is never an empty box.
  const quiet = (() => {
    if (!day || !shop || !slot) return null;
    const when = day.label.toLowerCase();
    return slot.capacityKg > 0
      ? `Restano ${formatKg(slot.remainingKg)} kg da ${shop.name} per ${when}.`
      : `Disponibile da ${shop.name}, ${when}.`;
  })();
  const shown = notice ?? (quiet ? { key: "ok", tone: "quiet" as const, text: quiet } : null);

  function togglePref(key: string) {
    setPrefs((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  }

  function reset() {
    setStatus("idle");
    setError(null);
    setDone(null);
    setPrefs([]);
    setKg(1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || !day || !shop) return;
    setStatus("submitting");
    setError(null);

    const form = event.currentTarget;
    const fd = new FormData(form);
    const notes = [prefs.join(", "), String(fd.get("notes") ?? "").trim()].filter(Boolean).join(" — ");

    const payload = {
      type: "porchetta",
      name: String(fd.get("name") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      shop: shop.slug,
      date: day.iso,
      quantityKg: kg,
      notes,
      company: String(fd.get("company") ?? ""), // honeypot
    };

    try {
      const res = await fetch("/api/prenotazioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Errore imprevisto");
      setDone({ reference: json.reference ?? null, kg, shop: shop.name, day: day.label });
      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Errore imprevisto");
    }
  }

  if (status === "success" && done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: reduceMotion ? 0 : 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.6, ease: EASE }}
        className="mx-auto max-w-2xl border border-gold/50 bg-paper p-8 text-center sm:p-12"
      >
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-gold text-brown-950">
          <Check className="size-7" />
        </span>
        <p className="eyebrow eyebrow-dark mt-8 justify-center">Richiesta inviata</p>
        <h3 className="font-display display-md mt-4 font-semibold text-brown-950">
          {formatKg(done.kg)} kg di porchetta, {done.day.toLowerCase()}
        </h3>
        <p className="mt-4 text-brown-700">
          Da {done.shop}. Ti richiamiamo per confermare la quantità e l&apos;orario di ritiro; si
          paga al banco, sul peso effettivo.
        </p>
        {done.reference && (
          <p className="ticket mx-auto mt-7 inline-block bg-paper-warm px-5 py-2 text-[0.6875rem] font-bold tracking-[0.2em] text-brown-950 uppercase">
            Riferimento {done.reference}
          </p>
        )}
        <div className="mt-8">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center rounded-full border border-rule-strong px-7 py-3 text-sm font-semibold text-brown-950 transition-colors hover:bg-brown-950 hover:text-cream focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
          >
            Prenota un&apos;altra porchetta
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <LayoutGroup id={uid}>
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-14">
        {/* ── The sheet ─────────────────────────────────────────────────── */}
        <form
          id={formId}
          onSubmit={handleSubmit}
          className="space-y-14 lg:col-span-7"
          aria-describedby={notice ? `${uid}-notice` : undefined}
        >
          {/* 01 · Quanta */}
          <fieldset>
            <legend className="mb-6 w-full">
              <SectionMark n="01">Quanta ne vuoi</SectionMark>
              <p className="mt-3 text-sm text-brown-700">
                A passi di mezzo chilo, da {formatKg(MIN_KG)} a {MAX_KG} kg. Le porzioni sono
                indicative: circa due etti a testa.
              </p>
            </legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PRESETS.map((p) => {
                const active = kg === p.kg;
                return (
                  <motion.button
                    key={p.kg}
                    type="button"
                    whileTap={tap}
                    onClick={() => setKg(p.kg)}
                    aria-pressed={active}
                    className={cn(
                      "relative isolate flex min-h-[7.5rem] flex-col items-start border px-4 py-4 text-left transition-colors duration-300 sm:px-5 sm:py-5",
                      "focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:ring-offset-paper-warm focus-visible:outline-none",
                      active ? "border-brown-950" : "border-rule-strong hover:border-brown-950"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId={`${uid}-kg-active`}
                        transition={spring}
                        aria-hidden
                        className="absolute inset-0 -z-10 bg-brown-950"
                      />
                    )}
                    <span
                      className={cn(
                        "font-display text-[1.75rem] leading-none font-semibold tracking-[-0.02em] tabular-nums transition-colors duration-300",
                        active ? "text-cream" : "text-brown-950"
                      )}
                    >
                      {formatKg(p.kg)}
                      <span className="ml-1 text-base font-normal">kg</span>
                    </span>
                    <span
                      className={cn(
                        "mt-auto pt-4 text-[0.625rem] font-bold tracking-[0.18em] uppercase transition-colors duration-300",
                        active ? "text-gold" : "text-gold-deep"
                      )}
                    >
                      {p.name}
                    </span>
                    <span
                      className={cn(
                        "mt-1 text-xs transition-colors duration-300",
                        active ? "text-cream/65" : "text-taupe"
                      )}
                    >
                      {p.hint}
                    </span>
                  </motion.button>
                );
              })}

              {/* The fifth tile is the stepper: the current weight is always
                  shown here, so it is the one place the number can be read
                  and changed by the half-kilo, whichever tile is lit. */}
              <div
                className={cn(
                  "relative isolate col-span-2 flex min-h-[7.5rem] flex-col justify-between border px-4 py-4 transition-colors duration-300 sm:col-span-1 sm:px-5 sm:py-5",
                  !isPreset ? "border-brown-950" : "border-rule-strong"
                )}
              >
                {!isPreset && (
                  <motion.span
                    layoutId={`${uid}-kg-active`}
                    transition={spring}
                    aria-hidden
                    className="absolute inset-0 -z-10 bg-brown-950"
                  />
                )}
                <span
                  className={cn(
                    "text-[0.625rem] font-bold tracking-[0.18em] uppercase transition-colors duration-300",
                    !isPreset ? "text-gold" : "text-gold-deep"
                  )}
                >
                  Altra quantità
                </span>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <motion.button
                    type="button"
                    whileTap={tap}
                    aria-label="Mezzo chilo in meno"
                    onClick={() => setKg((q) => clampKg(q - STEP_KG))}
                    disabled={kg <= MIN_KG}
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40",
                      "focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none",
                      !isPreset ? "bg-cream text-brown-950" : "bg-brown-950 text-cream"
                    )}
                  >
                    <Minus className="size-4" />
                  </motion.button>
                  <span
                    aria-live="polite"
                    className={cn(
                      "font-display min-w-[4.5rem] text-center text-[1.5rem] leading-none font-semibold tracking-[-0.02em] tabular-nums transition-colors duration-300",
                      !isPreset ? "text-cream" : "text-brown-950"
                    )}
                  >
                    {formatKg(kg)}
                    <span className="ml-1 text-sm font-normal">kg</span>
                  </span>
                  <motion.button
                    type="button"
                    whileTap={tap}
                    aria-label="Mezzo chilo in più"
                    onClick={() => setKg((q) => clampKg(q + STEP_KG))}
                    disabled={kg >= MAX_KG}
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40",
                      "focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none",
                      !isPreset ? "bg-cream text-brown-950" : "bg-brown-950 text-cream"
                    )}
                  >
                    <Plus className="size-4" />
                  </motion.button>
                </div>
              </div>
            </div>
          </fieldset>

          {/* 02 · Dove */}
          <fieldset>
            <legend className="mb-6 w-full">
              <SectionMark n="02">Dove la ritiri</SectionMark>
              <p className="mt-3 text-sm text-brown-700">
                Ogni bottega cuoce la sua: la disponibilità è per sede.
              </p>
            </legend>
            <div className={cn("grid gap-3", shops.length > 1 && "sm:grid-cols-2")}>
              {shops.map((s, i) => {
                const active = s.slug === shopSlug;
                const at = day?.shops[s.slug];
                return (
                  <motion.button
                    key={s.slug}
                    type="button"
                    whileTap={tap}
                    onClick={() => setShopSlug(s.slug)}
                    aria-pressed={active}
                    className={cn(
                      "relative isolate flex flex-col items-start border px-5 py-5 text-left transition-colors duration-300",
                      "focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:ring-offset-paper-warm focus-visible:outline-none",
                      active ? "border-brown-950" : "border-rule-strong hover:border-brown-950"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId={`${uid}-shop-active`}
                        transition={spring}
                        aria-hidden
                        className="absolute inset-0 -z-10 bg-brown-950"
                      />
                    )}
                    <span className="flex w-full items-baseline justify-between gap-3">
                      <span
                        className={cn(
                          "font-display text-sm tabular-nums transition-colors duration-300",
                          active ? "text-cream/45" : "text-brown-950/30"
                        )}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={cn(
                          "text-[0.625rem] font-bold tracking-[0.18em] uppercase transition-colors duration-300",
                          active ? "text-gold" : "text-gold-deep"
                        )}
                      >
                        {s.specialty}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "font-display mt-3 text-[1.25rem] leading-tight font-semibold tracking-[-0.02em] transition-colors duration-300",
                        active ? "text-cream" : "text-brown-950"
                      )}
                    >
                      {s.name}
                    </span>
                    <span
                      className={cn(
                        "mt-2 flex items-start gap-2 text-xs transition-colors duration-300",
                        active ? "text-cream/65" : "text-taupe"
                      )}
                    >
                      <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {s.address}
                    </span>
                    {day && (
                      <span
                        className={cn(
                          "mt-4 flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.12em] uppercase transition-colors duration-300",
                          active ? "text-gold" : "text-brown-700"
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 rounded-full",
                            !day.bookable || !at || at.closed || at.isFull ? "bg-taupe" : "bg-gold"
                          )}
                        />
                        {slotCaption(day, at)}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </fieldset>

          {/* 03 · Quando */}
          <fieldset>
            <legend className="mb-6 w-full">
              <SectionMark n="03">Quale {pickupDayName}</SectionMark>
              <p className="mt-3 text-sm text-brown-700">
                Esce dal forno la mattina. Le prenotazioni si chiudono il giorno prima
                {day ? `: per ${day.label.toLowerCase()} entro ${day.cutoffLabel}` : ""}.
              </p>
            </legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {days.map((d) => {
                const active = d.iso === dayIso;
                const at = shop ? d.shops[shop.slug] : undefined;
                const unavailable = !d.bookable || !!at?.closed;
                return (
                  <motion.button
                    key={d.iso}
                    type="button"
                    whileTap={unavailable ? undefined : tap}
                    onClick={() => setDayIso(d.iso)}
                    aria-pressed={active}
                    aria-disabled={unavailable || undefined}
                    className={cn(
                      "relative isolate flex flex-col items-start border px-4 py-4 text-left transition-colors duration-300",
                      "focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:ring-offset-paper-warm focus-visible:outline-none",
                      active ? "border-brown-950" : "border-rule-strong",
                      !active && !unavailable && "hover:border-brown-950",
                      unavailable && !active && "opacity-50"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId={`${uid}-day-active`}
                        transition={spring}
                        aria-hidden
                        className="absolute inset-0 -z-10 bg-brown-950"
                      />
                    )}
                    <span
                      className={cn(
                        "text-[0.625rem] font-bold tracking-[0.18em] uppercase transition-colors duration-300",
                        active ? "text-gold" : "text-gold-deep"
                      )}
                    >
                      {pickupDayName}
                    </span>
                    <span
                      className={cn(
                        "font-display mt-2 text-[1.375rem] leading-none font-semibold tracking-[-0.02em] tabular-nums transition-colors duration-300",
                        active ? "text-cream" : "text-brown-950"
                      )}
                    >
                      {d.short}
                    </span>
                    <span
                      className={cn(
                        "mt-3 text-[0.6875rem] leading-snug transition-colors duration-300",
                        active ? "text-cream/65" : "text-taupe"
                      )}
                    >
                      {slotCaption(d, at)}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </fieldset>

          {/* 04 · Come */}
          <fieldset>
            <legend className="mb-6 w-full">
              <SectionMark n="04">Come la prepariamo</SectionMark>
              <p className="mt-3 text-sm text-brown-700">
                Richieste, non promesse: facciamo il possibile con quello che esce dal forno.
              </p>
            </legend>
            <div className="flex flex-wrap gap-2.5">
              {PREFERENCES.map((p) => {
                const active = prefs.includes(p.key);
                return (
                  <motion.button
                    key={p.key}
                    type="button"
                    whileTap={tap}
                    onClick={() => togglePref(p.key)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-2.5 border px-4 py-3 text-left transition-colors duration-300",
                      "focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:ring-offset-paper-warm focus-visible:outline-none",
                      active
                        ? "border-brown-950 bg-brown-950 text-cream"
                        : "border-rule-strong text-brown-950 hover:border-brown-950"
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center border transition-colors duration-300",
                        active ? "border-gold bg-gold text-brown-950" : "border-rule-strong"
                      )}
                    >
                      {active && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="text-[0.625rem] font-bold tracking-[0.16em] uppercase">{p.key}</span>
                    <span className={cn("text-xs", active ? "text-cream/60" : "text-taupe")}>{p.hint}</span>
                  </motion.button>
                );
              })}
            </div>
            <div className="mt-6">
              <Field label="Note per il banco" htmlFor={`${uid}-notes`} optional>
                <textarea
                  id={`${uid}-notes`}
                  name="notes"
                  rows={3}
                  placeholder="Un orario di ritiro preferito, un'occasione, un'allergia…"
                  className={cn(inputClasses, "min-h-[6rem] resize-y")}
                />
              </Field>
            </div>
          </fieldset>

          {/* 05 · Chi */}
          <fieldset>
            <legend className="mb-6 w-full">
              <SectionMark n="05">A chi la teniamo</SectionMark>
              <p className="mt-3 text-sm text-brown-700">
                Ti richiamiamo noi per confermare. L&apos;email serve solo per mandarti il
                riepilogo.
              </p>
            </legend>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Nome e cognome" htmlFor={`${uid}-name`}>
                <input
                  id={`${uid}-name`}
                  name="name"
                  required
                  minLength={2}
                  autoComplete="name"
                  placeholder="Mario Rossi"
                  className={inputClasses}
                />
              </Field>
              <Field label="Telefono" htmlFor={`${uid}-phone`}>
                <input
                  id={`${uid}-phone`}
                  name="phone"
                  type="tel"
                  required
                  minLength={6}
                  autoComplete="tel"
                  placeholder="333 123 4567"
                  className={inputClasses}
                />
              </Field>
            </div>
            <div className="mt-6">
              <Field label="Email" htmlFor={`${uid}-email`} optional>
                <input
                  id={`${uid}-email`}
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="mario.rossi@email.it"
                  className={inputClasses}
                />
              </Field>
            </div>
            {/* Honeypot: bots fill it, people never see it. */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label htmlFor={`${uid}-company`}>Azienda</label>
              <input id={`${uid}-company`} name="company" tabIndex={-1} autoComplete="off" />
            </div>
          </fieldset>
        </form>

        {/* ── The running total ─────────────────────────────────────────── */}
        <aside className="lg:col-span-5">
          <div className="border border-rule bg-paper p-6 sm:p-8 lg:sticky lg:top-28">
            <p className="eyebrow eyebrow-dark">Il tuo ordine</p>

            <p className="font-display mt-5 flex items-baseline gap-2 leading-none font-semibold text-brown-950">
              <span className="relative inline-flex min-w-[2ch] justify-end overflow-hidden text-[3rem] tracking-[-0.03em] tabular-nums sm:text-[3.5rem]">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={kg}
                    initial={{ y: reduceMotion ? 0 : "60%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: reduceMotion ? 0 : "-60%", opacity: 0 }}
                    transition={spring}
                    className="block"
                  >
                    {formatKg(kg)}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="text-xl text-taupe">
                kg · circa {people} {people === 1 ? "persona" : "persone"}
              </span>
            </p>

            <div className="mt-6 border-t border-rule">
              <Row label="Ritiro" value={shop?.name ?? "—"} />
              <Row label="Giorno" value={day?.label ?? "—"} />
              <Row label="Preferenze" value={prefs.length ? prefs.join(", ") : "Nessuna"} />
              {estimateCents != null && (
                <Row
                  label="Stima"
                  value={
                    <>
                      <span className="ticket inline-block bg-paper-warm px-2 py-0.5">
                        {formatEuro(estimateCents)}
                      </span>
                      <span className="ml-1.5 font-normal text-taupe">circa</span>
                    </>
                  }
                  emphasis
                />
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-taupe">
              {pricePerKgCents != null
                ? `${formatEuro(pricePerKgCents)} al kg. Il prezzo definitivo si fa alla pesata, al ritiro.`
                : "Il prezzo si fa alla pesata, al ritiro."}
            </p>

            {/* Reserved height, so a notice appearing never shoves the button. */}
            <div className="mt-5 min-h-[3.5rem]" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                {shown && (
                  <motion.p
                    key={shown.key}
                    id={notice ? `${uid}-notice` : undefined}
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
                    transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
                    className={cn(
                      "border px-4 py-3 text-sm leading-snug",
                      shown.tone === "warn" && "border-rule-strong bg-paper-warm text-brown-900",
                      shown.tone === "info" && "border-gold-dark/40 bg-gold/10 text-brown-900",
                      shown.tone === "quiet" && "border-dashed border-rule text-brown-700"
                    )}
                  >
                    {shown.text}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <Magnetic className="mt-1 w-full">
              <motion.button
                type="submit"
                form={formId}
                whileTap={tap}
                disabled={status === "submitting" || blocked}
                className={cn(
                  "group/go relative inline-flex w-full items-center justify-center overflow-hidden rounded-full bg-gold px-8 py-4 text-[0.6875rem] font-bold tracking-[0.16em] text-on-gold uppercase",
                  "focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:outline-none",
                  "disabled:pointer-events-none disabled:opacity-50"
                )}
              >
                <span
                  aria-hidden
                  className="absolute inset-0 bg-brown-950 [clip-path:circle(0%_at_50%_120%)] transition-[clip-path] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/go:[clip-path:circle(150%_at_50%_120%)]"
                />
                <span className="relative z-10 inline-flex items-center gap-3 transition-colors duration-500 group-hover/go:text-cream">
                  <Flame className="size-4" />
                  {status === "submitting"
                    ? "Invio in corso…"
                    : overCap
                      ? "Mettimi in lista d'attesa"
                      : "Prenota la porchetta"}
                </span>
              </motion.button>
            </Magnetic>

            {error && (
              <p role="alert" className="mt-4 text-sm font-medium text-red-700">
                {error}
              </p>
            )}

            <p className="mt-5 text-center text-xs leading-relaxed text-taupe">
              È una richiesta, non una conferma: ti richiamiamo noi. Nessun pagamento anticipato.
            </p>

            {shop?.phone && (
              <a
                href={telHref(shop.phone)}
                className="mt-5 flex items-center justify-between border-t border-rule pt-5 text-sm text-brown-700 transition-colors hover:text-brown-950"
              >
                <span className="flex items-center gap-2.5">
                  <Phone className="size-4 text-gold-deep" aria-hidden />
                  Preferisci il telefono?
                </span>
                <span className="font-semibold text-brown-950 tabular-nums">{shop.phone}</span>
              </a>
            )}
          </div>
        </aside>
      </div>
    </LayoutGroup>
  );
}
