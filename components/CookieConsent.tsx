"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { INTRO_DONE_EVENT } from "@/components/IntroLoader";

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
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let undecided = true;
    try {
      undecided = !window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* private mode — show banner, choice just won't persist */
    }
    if (!undecided) return;

    // Not while the intro curtain is down. Sliding in behind it is pointless and,
    // on some compositors, it painted *through* the curtain — over the "Salta"
    // control, no less. The curtain announces when the page is actually visible.
    const show = () => setVisible(true);
    if (document.documentElement.dataset.intro !== "play") {
      const id = window.setTimeout(show, 0);
      return () => window.clearTimeout(id);
    }
    window.addEventListener(INTRO_DONE_EVENT, show, { once: true });
    return () => window.removeEventListener(INTRO_DONE_EVENT, show);
  }, []);

  /**
   * Publish this bar's height as `--consent-h` so the floating cart bar can
   * stand on top of it instead of underneath.
   *
   * On the desktop the two are one line and one pill at opposite ends of the
   * screen and never met. On a phone the notice wraps to three lines and the
   * cart bar — the control that carries the sale — was drawn behind it, fully
   * covered, on every first visit. Measured rather than assumed, because the
   * height depends on where the sentence wraps.
   */
  useEffect(() => {
    const node = barRef.current;
    const root = document.documentElement;
    if (!visible || !node) {
      root.style.removeProperty("--consent-h");
      return;
    }
    const observer = new ResizeObserver(() => {
      // `offsetHeight`, not `contentRect`: the bar's own padding — including the
      // safe-area inset it adds on a notched phone — is part of what the cart
      // bar has to clear.
      root.style.setProperty("--consent-h", `${node.offsetHeight}px`);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--consent-h");
    };
  }, [visible]);

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
          ref={barRef}
          role="dialog"
          aria-live="polite"
          aria-label="Preferenze cookie"
          // Above the header (80) and the mobile menu (75) so it stays dismissible.
          className="vt-consent px-safe pb-safe fixed inset-x-0 bottom-0 z-[95] border-t border-rule bg-paper/95 backdrop-blur-xl"
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
            {/* Reversed on a phone: the accept button leads, because a thumb
                reaching up from the bottom edge hits the *last* item in a column
                first and the dismissal is what the visitor is reaching for.
                Both are full-width rows there rather than two small words side
                by side — this bar is the first thing covering the page, so
                getting rid of it should not need aim. */}
            <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-5">
              <button
                type="button"
                onClick={() => choose("essential")}
                className="rounded-full border border-rule-strong px-6 py-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-taupe uppercase underline-offset-4 transition-colors hover:text-brown-950 hover:underline focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none sm:border-0 sm:px-0 sm:py-1"
              >
                Solo necessari
              </button>
              <button
                type="button"
                onClick={() => choose("accepted")}
                className="group/ck relative overflow-hidden rounded-full bg-brown-950 px-6 py-3.5 text-[0.6875rem] font-semibold tracking-[0.16em] text-cream uppercase focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:outline-none sm:py-2.5"
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
