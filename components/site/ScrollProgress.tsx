"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";

/**
 * A gold hairline across the top of the page that fills as you read.
 *
 * Sits directly under the header, and is the only always-on motion on the site:
 * it tells you how long a page is, which matters when the homepage is nine
 * sections deep.
 */
export default function ScrollProgress() {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  // Springing the raw progress keeps the bar from twitching on trackpad scroll.
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, restDelta: 0.001 });

  if (reduceMotion) return null;

  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="vt-progress pointer-events-none fixed inset-x-0 top-0 z-[90] h-[2px] origin-left bg-gold"
    />
  );
}
