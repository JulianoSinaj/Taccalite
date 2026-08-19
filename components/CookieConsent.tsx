"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const STORAGE_KEY = "taccalite-cookie-consent";

type Consent = "accepted" | "essential";

/**
 * Minimal GDPR cookie banner. The site currently sets only strictly-necessary
 * cookies (session), so "essential only" is the privacy-preserving default. The
 * stored choice gates any future analytics/marketing scripts.
 *
 * Deliberately a thin bar pinned to the bottom edge rather than the floating
 * card this used to be: that card was centred over the fold and covered the
 * hero's call to action on every single page — the first thing every visitor
 * saw. The notice is one honest sentence, so it gets the weight of one sentence.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      /* private mode — show banner, choice just won't persist */
      setVisible(true);
    }
  }, []);

  function choose(value: Consent) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
      window.dispatchEvent(new CustomEvent("taccalite:consent", { detail: value }));
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-live="polite"
          aria-label="Preferenze cookie"
          // Above the header (80) and the mobile menu (75) so it stays dismissible.
          className="vt-consent fixed inset-x-0 bottom-0 z-[95] border-t border-rule bg-paper/95 backdrop-blur-xl"
          initial={reduceMotion ? { opacity: 0 } : { y: "100%" }}
          animate={reduceMotion ? { opacity: 1 } : { y: "0%" }}
          exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mx-auto flex max-w-[88rem] flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
            <p className="text-[0.8125rem] leading-relaxed text-taupe">
              Usiamo solo cookie tecnici necessari al funzionamento del sito.{" "}
              <Link
                href="/cookie"
                className="text-brown-950 underline decoration-gold underline-offset-4 transition-colors hover:text-gold-deep"
              >
                Cookie policy
              </Link>{" "}
              ·{" "}
              <Link
                href="/privacy"
                className="text-brown-950 underline decoration-gold underline-offset-4 transition-colors hover:text-gold-deep"
              >
                Privacy
              </Link>
            </p>
            <div className="flex shrink-0 items-center gap-5">
              <button
                type="button"
                onClick={() => choose("essential")}
                className="text-[0.6875rem] font-semibold tracking-[0.16em] text-taupe uppercase underline-offset-4 transition-colors hover:text-brown-950 hover:underline focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
              >
                Solo necessari
              </button>
              <button
                type="button"
                onClick={() => choose("accepted")}
                className="group/ck relative overflow-hidden rounded-full bg-brown-950 px-6 py-2.5 text-[0.6875rem] font-semibold tracking-[0.16em] text-cream uppercase focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 bg-gold [clip-path:circle(0%_at_50%_120%)] transition-[clip-path] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/ck:[clip-path:circle(150%_at_50%_120%)]"
                />
                <span className="relative z-10 transition-colors duration-500 group-hover/ck:text-brown-950">
                  Accetta
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
