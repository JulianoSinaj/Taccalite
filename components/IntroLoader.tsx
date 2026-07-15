"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const TOTAL_DURATION = 2.6;
const EXIT_DURATION = 0.9;

export default function IntroLoader() {
  const [phase, setPhase] = useState<"loading" | "exiting" | "done">("loading");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      setPhase("done");
      return;
    }
    document.body.style.overflow = "hidden";
    const exitTimer = setTimeout(() => setPhase("exiting"), TOTAL_DURATION * 1000);
    return () => clearTimeout(exitTimer);
  }, [reduceMotion]);

  useEffect(() => {
    if (phase === "exiting") {
      const doneTimer = setTimeout(() => {
        setPhase("done");
        document.body.style.overflow = "";
      }, EXIT_DURATION * 1000);
      return () => clearTimeout(doneTimer);
    }
  }, [phase]);

  function handleSkip() {
    if (phase === "loading") setPhase("exiting");
  }

  if (phase === "done") return null;

  return (
    <motion.div
      className="bg-noise fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-brown-950"
      role="presentation"
      aria-hidden="true"
      initial={{ clipPath: "inset(0% 0% 0% 0%)" }}
      animate={{ clipPath: phase === "exiting" ? "inset(0% 0% 100% 0%)" : "inset(0% 0% 0% 0%)" }}
      transition={{ duration: EXIT_DURATION, ease: [0.76, 0, 0.24, 1] }}
    >
      <motion.svg width="132" height="132" viewBox="0 0 132 132" initial="hidden" animate="visible" className="mb-6">
        <motion.circle
          cx="66"
          cy="66"
          r="60"
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="1"
          variants={{
            hidden: { pathLength: 0, opacity: 0 },
            visible: { pathLength: 1, opacity: 1, transition: { duration: 1.4, ease: "easeInOut" } },
          }}
        />
        <motion.circle
          cx="66"
          cy="66"
          r="50"
          fill="none"
          stroke="var(--color-gold)"
          strokeOpacity="0.4"
          strokeWidth="0.5"
          variants={{
            hidden: { pathLength: 0, opacity: 0 },
            visible: { pathLength: 1, opacity: 1, transition: { duration: 1.4, ease: "easeInOut", delay: 0.15 } },
          }}
        />
        <motion.text
          x="66"
          y="66"
          textAnchor="middle"
          dominantBaseline="central"
          className="font-display"
          fill="var(--color-gold)"
          fontSize="58"
          fontWeight="600"
          variants={{
            hidden: { opacity: 0, scale: 0.82, filter: "blur(6px)" },
            visible: {
              opacity: 1,
              scale: 1,
              filter: "blur(0px)",
              transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.7 },
            },
          }}
          style={{ transformOrigin: "66px 66px" }}
        >
          T
        </motion.text>
      </motion.svg>

      <motion.div
        className="font-display absolute text-3xl font-semibold tracking-wide text-cream"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.9, ease: "easeOut" }}
      >
        Taccalite
      </motion.div>

      <motion.p
        className="mt-24 text-xs font-medium tracking-[0.25em] text-cream/50 uppercase"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.3 }}
      >
        Norcineria di famiglia · dal 1946
      </motion.p>

      <motion.div
        className="mt-8 h-px w-40 overflow-hidden bg-cream/10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.4 }}
      >
        <motion.div
          className="h-full bg-gold"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          style={{ transformOrigin: "left", width: "100%" }}
          transition={{ duration: 1.1, delay: 1.5, ease: [0.76, 0, 0.24, 1] }}
        />
      </motion.div>

      <motion.button
        type="button"
        onClick={handleSkip}
        className="absolute right-6 bottom-6 text-xs font-medium tracking-wide text-cream/75 hover:text-cream sm:right-10 sm:bottom-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
      >
        Salta →
      </motion.button>
    </motion.div>
  );
}
