"use client";

import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useReducedMotionAfterMount } from "@/lib/use-reduced-motion-after-mount";
import { cn } from "@/lib/utils";

type MagneticProps = {
  children: ReactNode;
  /** Fraction of the cursor's offset from centre that the element travels. */
  strength?: number;
  className?: string;
};

/**
 * Pulls its child toward the pointer, springs it back on exit.
 *
 * Mouse events only, deliberately: `pointermove` also fires for touch, which
 * would drag the button under the reader's thumb mid-scroll. A mouse is the only
 * input where this reads as responsiveness rather than a glitch.
 */
export default function Magnetic({ children, strength = 0.32, className }: MagneticProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotionAfterMount();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 260, damping: 20, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 260, damping: 20, mass: 0.4 });

  function handleMove(event: React.MouseEvent<HTMLSpanElement>) {
    const node = ref.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    x.set((event.clientX - (box.left + box.width / 2)) * strength);
    y.set((event.clientY - (box.top + box.height / 2)) * strength);
  }

  function handleLeave() {
    x.set(0);
    y.set(0);
  }

  if (reduceMotion) {
    return <span className={cn("inline-flex", className)}>{children}</span>;
  }

  return (
    <motion.span
      ref={ref}
      // Display goes through `cn`, never `style`. As an inline style it beat every
      // class including `hidden`, so `<Magnetic className="hidden sm:inline-flex">`
      // in the header stayed visible on a phone — which pushed the menu button off
      // the right edge of a 390px screen and made the mobile nav unreachable.
      // twMerge lets the caller's display class win.
      className={cn("inline-flex", className)}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {children}
    </motion.span>
  );
}
