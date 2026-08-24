"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * The original cinematic intro: a brown-950 curtain with the gold "T" ring drawing
 * itself in, the name rising under it, the tagline and a gold rule filling — then
 * the whole thing wipes upward and hands the page over.
 *
 * Restored from the first version of the site. The white "seal on paper" veil that
 * replaced it for a while is gone; this is the one the shop wants.
 *
 * Two things are deliberately not React's job here:
 *
 * The entrance. The curtain is in the server HTML, so it is on screen from the
 * first frame — but the first version animated it with Framer, which only starts
 * at hydration. On a cold load that left a dead brown screen for as long as the
 * bundle took to arrive, and *then* the ring began. The keyframes now live in
 * globals.css under `.intro-*` and start the moment the browser paints. The exit
 * wipe below is still Framer, and it is scheduled from when those keyframes
 * actually started rather than from when this component happened to hydrate, so
 * the sequence is the same length on every machine.
 *
 * The reload. Chrome keeps the previous page's last frame on screen until the new
 * document paints (paint holding), so a reload used to read as: the page, a cut
 * to brown, the animation, the page again — the "page first" was the old page
 * lingering through the server round-trip. The old document keeps painting after
 * `beforeunload`, so it drops the same brown curtain there
 * (`html[data-intro="leave"]` in globals.css) and the new document's first frame
 * continues it. `pageshow` clears it again for a page restored from bfcache.
 *
 * `data-intro="play"` on <html> while the curtain is down is the signal the rest
 * of the page reads: SealMark snaps its handover instead of cross-fading, and the
 * cookie bar waits for `taccalite:intro-done` rather than sliding in under —
 * or, on a bad compositor day, over — the curtain.
 *
 * It plays on every hard load of the storefront (the layout does not remount on a
 * soft navigation, so moving around the site never replays it). Reduced motion
 * shows the still card for a beat and leaves without the wipe.
 */
const TOTAL_DURATION = 2.6;
const EXIT_DURATION = 0.9;
export const INTRO_DONE_EVENT = "taccalite:intro-done";

// Playfair on purpose, not `.font-display`: inside `.site-shell` that class is
// remapped to Fraunces, and this screen is meant to look exactly as it did.
const DISPLAY_FONT = "var(--font-playfair), Georgia, serif";

/** How far the entrance keyframes already are, in ms, measured from their real start. */
function elapsedSince(node: HTMLElement): number {
  const starts = node
    .getAnimations({ subtree: true })
    .map((a) => a.startTime)
    .filter((t): t is number => typeof t === "number");
  if (!starts.length) return 0;
  const now = document.timeline.currentTime;
  if (typeof now !== "number") return 0;
  return Math.max(0, now - Math.min(...starts));
}

export default function IntroLoader() {
  const [phase, setPhase] = useState<"loading" | "exiting" | "done">("loading");
  const reduceMotion = useReducedMotion();
  const curtainRef = useRef<HTMLDivElement>(null);

  // The reload hand-off. Armed for the life of the page, not just the intro.
  useEffect(() => {
    const root = document.documentElement;
    let clear = 0;
    function leave() {
      root.dataset.intro = "leave";
      // A navigation can be cancelled (a download link, a blocked prompt); the
      // page must not stay brown if it never actually goes anywhere.
      clear = window.setTimeout(() => {
        if (root.dataset.intro === "leave") delete root.dataset.intro;
      }, 6000);
    }
    function restore() {
      if (root.dataset.intro === "leave") delete root.dataset.intro;
    }
    window.addEventListener("beforeunload", leave);
    window.addEventListener("pageshow", restore);
    return () => {
      window.clearTimeout(clear);
      window.removeEventListener("beforeunload", leave);
      window.removeEventListener("pageshow", restore);
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      // Next tick rather than in the effect body: the curtain is in the server
      // HTML, so the first client render has to match it before it can leave.
      const id = setTimeout(() => setPhase("done"), 320);
      return () => clearTimeout(id);
    }

    // Hold the page still behind the curtain. Swallowing the events (rather than
    // `overflow: hidden` on <body>) keeps the scrollbar in place — so nothing
    // shifts sideways when the curtain lifts — and it is also what holds Lenis,
    // which reads these same events.
    function hold(event: Event) {
      event.preventDefault();
    }
    const opts: AddEventListenerOptions = { passive: false, capture: true };
    window.addEventListener("wheel", hold, opts);
    window.addEventListener("touchmove", hold, opts);

    document.documentElement.dataset.intro = "play";

    // From the keyframes' own clock, so a slow bundle shortens the wait rather
    // than adding to it.
    const elapsed = curtainRef.current ? elapsedSince(curtainRef.current) : 0;
    const remaining = Math.max(0, TOTAL_DURATION * 1000 - elapsed);
    const exitTimer = setTimeout(() => setPhase("exiting"), remaining);

    return () => {
      clearTimeout(exitTimer);
      if (document.documentElement.dataset.intro === "play") delete document.documentElement.dataset.intro;
      window.removeEventListener("wheel", hold, opts);
      window.removeEventListener("touchmove", hold, opts);
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (phase === "exiting") {
      // The wipe reveals the page as it goes, so from here on people are watching.
      if (document.documentElement.dataset.intro === "play") delete document.documentElement.dataset.intro;
      const doneTimer = setTimeout(() => setPhase("done"), EXIT_DURATION * 1000);
      return () => clearTimeout(doneTimer);
    }
    if (phase === "done") {
      if (document.documentElement.dataset.intro === "play") delete document.documentElement.dataset.intro;
      window.dispatchEvent(new Event(INTRO_DONE_EVENT));
    }
  }, [phase]);

  function handleSkip() {
    if (phase === "loading") setPhase("exiting");
  }

  if (phase === "done") return null;

  return (
    <motion.div
      ref={curtainRef}
      className="intro-curtain bg-noise fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-brown-950"
      role="presentation"
      aria-hidden="true"
      initial={{ clipPath: "inset(0% 0% 0% 0%)" }}
      animate={{ clipPath: phase === "exiting" ? "inset(0% 0% 100% 0%)" : "inset(0% 0% 0% 0%)" }}
      transition={{ duration: EXIT_DURATION, ease: [0.76, 0, 0.24, 1] }}
    >
      <svg width="132" height="132" viewBox="0 0 132 132" className="mb-6">
        <circle
          className="intro-ring"
          cx="66"
          cy="66"
          r="60"
          pathLength="1"
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="1"
        />
        <circle
          className="intro-ring intro-ring--inner"
          cx="66"
          cy="66"
          r="50"
          pathLength="1"
          fill="none"
          stroke="var(--color-gold)"
          strokeOpacity="0.4"
          strokeWidth="0.5"
        />
        <text
          className="intro-mark"
          x="66"
          y="66"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-gold)"
          fontSize="58"
          fontWeight="600"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          T
        </text>
      </svg>

      <div
        className="intro-name absolute text-3xl font-semibold tracking-wide text-cream"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        Taccalite
      </div>

      <p className="intro-tagline mt-24 text-xs font-medium tracking-[0.25em] text-cream/50 uppercase">
        Norcineria di famiglia · dal 1946
      </p>

      <div className="intro-rule mt-8 h-px w-40 overflow-hidden bg-cream/10">
        <div className="intro-rule-fill h-full w-full bg-gold" />
      </div>

      <button
        type="button"
        onClick={handleSkip}
        className="intro-skip absolute right-6 bottom-6 text-xs font-medium tracking-wide text-cream/75 hover:text-cream sm:right-10 sm:bottom-10"
      >
        Salta →
      </button>
    </motion.div>
  );
}
