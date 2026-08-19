"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useReducedMotionAfterMount } from "@/lib/use-reduced-motion-after-mount";

const EASE = [0.16, 1, 0.3, 1] as const;

type RevealLinesProps = {
  /** One entry per visual line. Kept explicit so line breaks are a design choice. */
  lines: ReactNode[];
  className?: string;
  /** Seconds before the first line starts. */
  delay?: number;
  /** Play on mount (hero) rather than when scrolled into view. */
  immediate?: boolean;
};

/**
 * Headline lines rising out of a clipped box, one after the next.
 *
 * The mask is a real `overflow-hidden` wrapper per line rather than a fade,
 * because the edge is the effect: the letters should look like they are being
 * pulled up from behind the page.
 *
 * Like `Reveal`, the reduced-motion path is an instant `animate` rather than a
 * different tree — a swapped element keeps Motion's `translateY(108%)` on the
 * style attribute and the headline stays parked below its own mask.
 */
export default function RevealLines({
  lines,
  className,
  delay = 0,
  immediate = false,
}: RevealLinesProps) {
  const reduceMotion = useReducedMotionAfterMount();

  const motionProps =
    reduceMotion || immediate
      ? { animate: { y: "0%" } }
      : { whileInView: { y: "0%" }, viewport: { once: true, margin: "-12%" } };

  return (
    <span className={className}>
      {lines.map((line, i) => (
        // The wrapper clips; the inner span is what travels. Padding on the
        // clip box would crop descenders, so the breathing room is negative
        // margin on the inner line instead.
        <span key={i} className="block overflow-hidden pb-[0.08em]">
          <motion.span
            className="block"
            initial={{ y: "108%" }}
            transition={{
              duration: reduceMotion ? 0 : 1.05,
              ease: EASE,
              delay: reduceMotion ? 0 : delay + i * 0.09,
            }}
            {...motionProps}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
