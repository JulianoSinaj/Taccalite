/**
 * A status mark on paper, for the customer's own pages.
 *
 * Square, because every other status mark on the storefront is — the "Esaurito"
 * and "Ultimi N" stamps on a product tile are the same object. The rounded pill
 * this replaces was the last of the old card-and-pill language in the account
 * area.
 *
 * Painted as a *wash* of its own hue over `--paper` rather than as an opaque
 * chip. The `--*-soft` tokens are right in the gestionale, but their light-theme
 * values are the stock Tailwind pastels (`#d1fae5`, `#fee2e2`, `#fef3c7`), and
 * an opaque mint rectangle on a warm cream page reads as a sticker from another
 * program — which is exactly how the account pages looked, since between them
 * they held most of the codebase's remaining `bg-emerald-100`-style classes. The
 * dark theme already had the better idea and says so in `globals.css`: "a tinted
 * chip becomes a translucent wash of its own hue, so it reads as a highlight
 * rather than a light rectangle punched into the page". It simply never reached
 * the light one. Mixing against `--paper` keeps both the semantics and the
 * theme-awareness — the hue is still `--ok`/`--warn`/`--danger`, which the dark
 * theme redefines — while letting the ground show through.
 *
 * Not a client component: it has no state, so the order-detail *server* page and
 * the dashboard *client* component can both render it from one definition.
 */

export const TONE = {
  waiting: { hue: "var(--warn)", ink: "var(--warn-soft-fg)" },
  good: { hue: "var(--ok)", ink: "var(--ok-soft-fg)" },
  neutral: { hue: "var(--color-taupe)", ink: "var(--color-brown-800)" },
  bad: { hue: "var(--danger)", ink: "var(--danger-soft-fg)" },
  // Distinct from both cancelled and pending: a customer who simply never came
  // is not a courteous cancellation, and once both map to `warn` nothing else
  // separates them. Dashed rather than a fifth hue — the storefront already uses
  // a dashed hairline for "this is not quite like its neighbours" (the shop's
  // own reset control).
  missed: { hue: "var(--warn)", ink: "var(--warn-soft-fg)", dashed: true },
} as const;

export type Tone = (typeof TONE)[keyof typeof TONE];

export default function StatusChip({
  tone,
  className = "",
  children,
}: {
  tone: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  const dashed = "dashed" in tone && tone.dashed;
  return (
    <span
      style={{ "--tone": tone.hue, "--tone-ink": tone.ink } as React.CSSProperties}
      className={`inline-flex shrink-0 border px-2.5 py-1 text-[0.625rem] font-bold tracking-[0.16em] whitespace-nowrap text-[var(--tone-ink)] uppercase ${
        dashed ? "border-dashed" : ""
      } border-[color-mix(in_oklab,var(--tone)_40%,transparent)] bg-[color-mix(in_oklab,var(--tone)_12%,var(--paper))] ${className}`}
    >
      {children}
    </span>
  );
}
