"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import Magnetic from "./Magnetic";

type Tone = "primary" | "gold" | "outline" | "onDark";

const tones: Record<Tone, { base: string; flood: string; label: string }> = {
  // The commercial button: brown ink on white paper. Floods gold on hover, so
  // the primary action is the one place gold becomes a surface instead of a line.
  primary: {
    base: "bg-brown-950 text-cream",
    flood: "bg-gold",
    label: "group-hover/cta:text-brown-950",
  },
  gold: {
    base: "bg-gold text-brown-950",
    flood: "bg-brown-950",
    label: "group-hover/cta:text-cream",
  },
  // Secondary on paper: hairline only until you touch it.
  outline: {
    base: "border border-rule-strong text-brown-950",
    flood: "bg-brown-950",
    label: "group-hover/cta:text-cream",
  },
  // For the two brown bands.
  onDark: {
    base: "border border-cream/25 text-cream",
    flood: "bg-cream",
    label: "group-hover/cta:text-brown-950",
  },
};

type CTAProps = {
  href: string;
  children: ReactNode;
  tone?: Tone;
  className?: string;
  /** Hide the trailing arrow (for short, terminal labels like "Prenota"). */
  bare?: boolean;
};

/**
 * The site's one button. On hover a fill grows from the bottom edge as a
 * clip-path circle and the label flips colour with it — a single gesture rather
 * than a colour change plus a shadow plus a lift.
 */
export default function CTA({ href, children, tone = "primary", className, bare }: CTAProps) {
  const style = tones[tone];

  return (
    <Magnetic>
      <Link
        href={href}
        className={cn(
          "group/cta relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-full",
          "px-7 py-3.5 text-[0.9375rem] font-semibold tracking-[-0.01em] whitespace-nowrap select-none",
          "focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:outline-none",
          style.base,
          className
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 [clip-path:circle(0%_at_50%_120%)] transition-[clip-path] duration-[850ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/cta:[clip-path:circle(150%_at_50%_120%)]",
            style.flood
          )}
        />
        <span
          className={cn(
            "relative z-10 inline-flex items-center gap-2.5 transition-colors duration-500",
            style.label
          )}
        >
          {children}
          {!bare && (
            <ArrowRight className="size-4 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/cta:translate-x-1" />
          )}
        </span>
      </Link>
    </Magnetic>
  );
}
