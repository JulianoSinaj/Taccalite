"use client";

import { motion, useScroll, useSpring } from "motion/react";
import { useReducedMotionAfterMount } from "@/lib/use-reduced-motion-after-mount";

/**
 * A gold hairline across the top of the page that fills as you read.
 *
 * Sits directly under the header, and is the only always-on motion on the site:
 * it tells you how long a page is, which matters when the homepage is nine
 * sections deep.
 */
export default function ScrollProgress() {
  const reduceMotion = useReducedMotionAfterMount();
  const { scrollYProgress } = useScroll();
  // Springing the raw progress keeps the bar from twitching on trackpad scroll.
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, restDelta: 0.001 });

  // Hydration-safe by way of the hook: bailing out on the raw media query during
  // render one dropped this element on the client while the server had emitted
  // it, which failed hydration and threw away the whole tree — on every page, for
  // exactly the people least well served by a re-render.
  if (reduceMotion) return null;

  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="vt-progress pointer-events-none fixed inset-x-0 top-0 z-[90] h-[2px] origin-left bg-gold"
    />
  );
}
