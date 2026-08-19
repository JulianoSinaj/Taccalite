"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useReducedMotionAfterMount } from "@/lib/use-reduced-motion-after-mount";

const EASE = [0.16, 1, 0.3, 1] as const;

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: "div" | "span";
};

/**
 * Fades its children up as they scroll into view.
 *
 * One element in every case, never two. Swapping the animated node for a plain
 * one under reduced motion looks like the obvious implementation and is a trap:
 * React reuses the DOM node, so Motion's `opacity: 0` stays on the style
 * attribute with nothing left to animate it away — the section simply never
 * appears. Reduced motion is expressed as an `animate` that resolves instantly
 * instead, which both clears the initial state and honours the request.
 */
export default function Reveal({ children, className = "", delay = 0, y = 28, as = "div" }: RevealProps) {
  const reduceMotion = useReducedMotionAfterMount();
  const Component = motion[as];

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y }}
      animate={reduceMotion ? { opacity: 1, y: 0 } : undefined}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: reduceMotion ? 0 : 0.7, delay: reduceMotion ? 0 : delay, ease: EASE }}
    >
      {children}
    </Component>
  );
}

type StaggerProps = {
  children: ReactNode;
  className?: string;
  gap?: number;
};

export function RevealStagger({ children, className = "" }: StaggerProps) {
  const reduceMotion = useReducedMotionAfterMount();

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate={reduceMotion ? "visible" : undefined}
      whileInView={reduceMotion ? undefined : "visible"}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ staggerChildren: reduceMotion ? 0 : 0.1 }}
    >
      {children}
    </motion.div>
  );
}

export function RevealStaggerItem({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotionAfterMount();

  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: reduceMotion ? 0 : 0.6, ease: EASE },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
