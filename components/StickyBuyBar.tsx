"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Flame } from "lucide-react";
import PillButton from "./PillButton";

/**
 * Conversion bar that slides in after the hero scrolls out of view.
 * Fixed to the bottom edge; transform/opacity only.
 */
export default function StickyBuyBar() {
  const [visible, setVisible] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > window.innerHeight * 1.1);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { y: 96, opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: 96, opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6"
        >
          <div className="cinematic-shadow mx-auto flex max-w-3xl flex-col items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-brown-950/90 px-6 py-4 backdrop-blur-xl sm:flex-row sm:rounded-full sm:py-3 sm:pl-8 sm:pr-3">
            <div className="flex items-center gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
                <Flame className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-cream">La porchetta del sabato</p>
                <p className="text-[10px] font-bold tracking-[0.2em] text-gold uppercase">
                  Sfornata ogni sabato mattina · quantità limitate
                </p>
              </div>
            </div>
            <PillButton href="/prenotazioni" tone="gold" className="w-full sm:w-auto">
              Riserva la tua porzione
            </PillButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
