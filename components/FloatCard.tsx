"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FloatCardProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Card surface that floats up 8px on hover while its shadow blooms into a
 * heavy, soft blur. Transform + shadow only — never affects layout.
 */
export default function FloatCard({ children, className }: FloatCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -8 }}
      transition={{ type: "spring", stiffness: 260, damping: 22, mass: 0.6 }}
      className={cn(
        "h-full transition-shadow duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-[0_48px_90px_-30px_rgba(42,26,16,0.45)]",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
