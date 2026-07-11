"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { ReactNode } from "react";

type ScrollDriftProps = {
  children: ReactNode;
  /** Position in the grid — staggers the drift amplitude per column. */
  index?: number;
  className?: string;
};

/**
 * Binds a gentle vertical drift to scroll progress. Because Lenis drives the
 * scroll position, its inertia flows straight through useTransform — cards in
 * the same row drift at staggered amplitudes as they cross the viewport.
 */
export default function ScrollDrift({ children, index = 0, className }: ScrollDriftProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  // The drift transform only exists client-side; applying it before hydration
  // completes would mismatch the server-rendered markup.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const drift = 24 + (index % 3) * 18;
  const y = useTransform(scrollYProgress, [0, 1], [drift, -drift]);

  return (
    <motion.div ref={ref} style={ready && !reduceMotion ? { y } : undefined} className={className}>
      {children}
    </motion.div>
  );
}
