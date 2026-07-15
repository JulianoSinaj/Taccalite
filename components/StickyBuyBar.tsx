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
          <div className="cinematic-shadow mx-auto flex w-fit max-w-full items-center justify-between gap-3 rounded-full border border-white/10 bg-brown-950/90 py-1.5 pl-4 pr-1.5 backdrop-blur-xl sm:w-auto sm:max-w-3xl sm:gap-4 sm:py-3 sm:pl-8 sm:pr-3">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold sm:h-10 sm:w-10">
                <Flame className="size-3.5 sm:size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-cream sm:text-sm">
                  La porchetta del sabato
                </p>
                <p className="hidden text-[10px] font-bold tracking-[0.2em] text-gold uppercase sm:block">
                  Sfornata ogni sabato mattina · quantità limitate
                </p>
              </div>
            </div>
            <PillButton
              href="/prenotazioni"
              tone="gold"
              className="shrink-0 px-4 py-2 text-xs sm:px-8 sm:py-3.5 sm:text-sm"
            >
              <span className="sm:hidden">Riserva</span>
              <span className="hidden sm:inline">Riserva la tua porzione</span>
            </PillButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
