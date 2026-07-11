"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const MotionLink = motion.create(Link);

type Tone = "cream" | "gold" | "ghost";

const toneStyles: Record<Tone, { base: string; fill: string; text: string }> = {
  // Light cream pill that floods dark on hover.
  cream: {
    base: "bg-cream text-brown-950",
    fill: "bg-brown-950",
    text: "group-hover/pill:text-cream",
  },
  // Gold pill that floods dark on hover.
  gold: {
    base: "bg-gold text-brown-950 shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)]",
    fill: "bg-brown-950",
    text: "group-hover/pill:text-cream",
  },
  // Outline pill for dark surfaces that floods cream on hover.
  ghost: {
    base: "border border-cream/30 text-cream",
    fill: "bg-cream",
    text: "group-hover/pill:text-brown-950",
  },
};

type PillButtonProps = {
  href: string;
  children: ReactNode;
  tone?: Tone;
  className?: string;
};

/**
 * Pill CTA: on hover the fill layer expands organically from the bottom edge
 * via a clip-path circle while the label flips color; tap compresses to 0.95.
 */
export default function PillButton({ href, children, tone = "cream", className }: PillButtonProps) {
  const styles = toneStyles[tone];

  return (
    <MotionLink
      href={href}
      data-magnetic
      whileTap={{ scale: 0.95 }}
      className={cn(
        "group/pill relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full px-8 py-3.5 text-sm font-semibold whitespace-nowrap select-none",
        styles.base,
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 [clip-path:circle(0%_at_50%_115%)] transition-[clip-path] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/pill:[clip-path:circle(140%_at_50%_115%)]",
          styles.fill
        )}
      />
      <span
        className={cn(
          "relative z-10 inline-flex items-center gap-3 transition-colors duration-500",
          styles.text
        )}
      >
        {children}
      </span>
    </MotionLink>
  );
}
