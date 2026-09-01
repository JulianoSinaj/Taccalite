import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────────────────
 * The printer's marks.
 *
 * The sedi pages are the shop's *documents* — an index of addresses, a plate of
 * the city, a ledger of opening hours — so their decoration is the decoration a
 * printed document carries: crop marks at the corners of a plate, a compass on a
 * map, a numbered rule at the head of each section, a dotted leader running from
 * a label to its value.
 *
 * All of it is pure markup with no state, so every one of these stays a server
 * component and adds nothing to the bundle.
 * ────────────────────────────────────────────────────────────────────────── */

type Tone = "ink" | "gold" | "cream";

const tickTone: Record<Tone, string> = {
  ink: "border-rule-strong",
  gold: "border-gold/60",
  cream: "border-cream/35",
};

/**
 * Crop marks at the four corners of a frame — the registration ticks a plate is
 * trimmed to. Absolutely positioned, so the parent must be `relative`.
 */
export function CornerTicks({
  tone = "ink",
  size = "md",
  className,
}: {
  tone?: Tone;
  size?: "sm" | "md";
  className?: string;
}) {
  const s = size === "sm" ? "size-3" : "size-5 sm:size-7";
  const edge = tickTone[tone];
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      <span className={cn("absolute -top-px -left-px border-t border-l", s, edge)} />
      <span className={cn("absolute -top-px -right-px border-t border-r", s, edge)} />
      <span className={cn("absolute -bottom-px -left-px border-b border-l", s, edge)} />
      <span className={cn("absolute -right-px -bottom-px border-r border-b", s, edge)} />
    </span>
  );
}

/**
 * The compass on the map plate. Engraved rather than drawn: two hairline rings,
 * a struck eight-point star, and the north arm filled — the only part of a
 * compass rose that carries information.
 */
export function CompassRose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden role="presentation">
      <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeOpacity="0.28" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeOpacity="0.18" />
      {/* The four minor arms, struck thin. */}
      <g stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8">
        <path d="M50 16 L50 84 M16 50 L84 50" />
        <path d="M26 26 L74 74 M74 26 L26 74" strokeOpacity="0.16" />
      </g>
      {/* North, filled: the half-black needle of a printed rose. */}
      <path d="M50 14 L57 50 L50 44 Z" fill="currentColor" fillOpacity="0.85" />
      <path d="M50 14 L43 50 L50 44 Z" fill="currentColor" fillOpacity="0.35" />
      <path d="M50 86 L57 50 L50 56 Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M50 86 L43 50 L50 56 Z" fill="currentColor" fillOpacity="0.12" />
      <text
        x="50"
        y="9"
        textAnchor="middle"
        fill="currentColor"
        fontSize="9"
        fontWeight="700"
        letterSpacing="0.5"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        N
      </text>
    </svg>
  );
}

/**
 * A section's head-mark: its number, a rule, and its name. Gives the page a
 * spine — every band is numbered, so the reader always knows where in the
 * document they are.
 */
export function SectionMark({
  n,
  children,
  tone = "ink",
  as: Tag = "p",
  className,
}: {
  n: string;
  children: ReactNode;
  tone?: "ink" | "cream";
  /** `h2` when this mark *is* the band's heading — a band whose title is a
   *  pull-quote still owes the outline a heading. */
  as?: "p" | "h2";
  className?: string;
}) {
  const dark = tone === "cream";
  return (
    <Tag
      className={cn(
        "flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] uppercase",
        dark ? "text-gold" : "text-gold-deep",
        className
      )}
    >
      {/* The ordinal is a printer's mark, not part of the name: read aloud it
          turns "Dedizione e qualità" into "zero two Dedizione e qualità". */}
      <span
        aria-hidden
        className={cn("font-display text-sm tabular-nums", dark ? "text-cream/45" : "text-brown-950/30")}
      >
        {n}
      </span>
      <span aria-hidden className={cn("h-px w-10", dark ? "bg-gold/60" : "bg-gold")} />
      {children}
    </Tag>
  );
}

/**
 * A ledger row: label on the left, value on the right, dotted leader between
 * them. The line is what makes a list of times read as a *record* rather than
 * as two columns of text that happen to be near each other.
 */
export function LeaderRow({
  label,
  value,
  tone = "ink",
  emphasis = false,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "ink" | "cream";
  emphasis?: boolean;
  className?: string;
}) {
  const dark = tone === "cream";
  return (
    <div className={cn("flex items-baseline gap-3 py-3", className)}>
      <span
        className={cn(
          "shrink-0 text-sm font-semibold",
          dark ? "text-cream/85" : "text-brown-950",
          emphasis && (dark ? "text-gold" : "text-brown-950")
        )}
      >
        {label}
      </span>
      <span
        aria-hidden
        className={cn(
          "mb-1 min-w-4 flex-1 border-b border-dotted",
          dark ? "border-cream/25" : "border-rule-strong"
        )}
      />
      {/* Shrinkable, unlike the label and the leader.
          A ledger row was written for "LU · 08:00–13:00", and it is also used
          for "Dove si ritira · Taccalite Centro · Taccalite Mercato del Piano".
          With `shrink-0` here that value could not give up a pixel, so the row
          pushed straight through the gutter and took the whole document
          sideways with it — /porchetta scrolled to 376px on a 360px phone.
          `min-w-0` is the half that lets a flex item go under its own
          min-content width; `break-words` is what it does with the room it is
          given. Short values are unaffected: nothing shrinks that fits. */}
      <span
        className={cn(
          "min-w-0 text-right text-sm break-words tabular-nums",
          dark ? "text-cream/70" : "text-brown-700",
          emphasis && (dark ? "font-semibold text-cream" : "font-semibold text-brown-950")
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * A number set oversized and nearly transparent behind a block — the plate
 * number printed in the margin. Decorative only; the real ordinal is in
 * `SectionMark`.
 */
export function GhostNumeral({ n, className }: { n: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "font-display pointer-events-none leading-[0.7] font-semibold tracking-[-0.04em] select-none",
        className
      )}
    >
      {n}
    </span>
  );
}
