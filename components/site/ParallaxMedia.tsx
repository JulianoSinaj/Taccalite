"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useReducedMotionAfterMount } from "@/lib/use-reduced-motion-after-mount";
import { cn } from "@/lib/utils";

type ParallaxMediaProps = {
  children: ReactNode;
  /** Pixels of travel across the whole pass through the viewport. */
  distance?: number;
  className?: string;
};

/**
 * Drifts its child against the page as it scrolls past.
 *
 * The child is scaled slightly beyond its frame so the drift never exposes an
 * edge, and the frame itself is what clips — so this wraps the *inside* of a
 * framed photo, not the frame.
 *
 * One element in both branches, and the ref always attached. The reduced-motion
 * path used to return a bare `<div className={className}>`: no `relative`, so
 * every `fill` image inside it escaped to the nearest positioned ancestor and
 * the photograph landed in the wrong box — and no ref, so `useScroll` warned
 * that its target was never hydrated. Reduced motion should mean the picture
 * holds still, not that it moves somewhere else.
 */
export default function ParallaxMedia({
  children,
  distance = 48,
  className,
}: ParallaxMediaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotionAfterMount();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  // The travel is collapsed to zero rather than the style being removed: taking
  // `style` away leaves Motion's last transform on the node, which parks the
  // photograph a few pixels off inside its own frame and never puts it back.
  const travel = reduceMotion ? 0 : distance / 2;
  const y = useTransform(scrollYProgress, [0, 1], [-travel, travel]);

  return (
    <div ref={ref} className={cn("relative overflow-hidden", className)}>
      <motion.div style={{ y }} className="absolute inset-[-6%]">
        {children}
      </motion.div>
    </div>
  );
}
