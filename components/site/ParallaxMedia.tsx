"use client";

import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
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
 */
export default function ParallaxMedia({
  children,
  distance = 48,
  className,
}: ParallaxMediaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [-distance / 2, distance / 2]);

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div ref={ref} className={cn("relative overflow-hidden", className)}>
      <motion.div style={{ y }} className="absolute inset-[-6%]">
        {children}
      </motion.div>
    </div>
  );
}
