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
 * document paints (paint holding), so a replayed intro reads as: the page, a cut
 * to brown, the animation, the page again — the "page first" being the old page
 * lingering through the server round-trip. Painting over it from `beforeunload`
 * was tried and does not hold: the compositor is under no obligation to present
 * another frame for a document that is already navigating away, so the cut landed
 * or did not, at random. The intro plays once per tab instead, and a reload has no
 * brown in it at all — see lib/intro.ts, and the gate script that runs ahead of
 * the curtain in app/(site)/layout.tsx.
 *
 * `data-intro="play"` on <html> while the curtain is down is the signal the rest
 * of the page reads: the cookie bar waits for `taccalite:intro-done` rather than
 * sliding in under — or, on a bad compositor day, over — the curtain.
 *
 * It used to have a second reader. `SealMark` layered a flat foil seal over a
 * WebGL coin and checked this flag to decide whether to cross-fade between them
 * or cut, since a cross-fade behind the curtain is one nobody sees. Both that
 * component and the coin are gone — the hero's mark is `SealStamp`, which is
 * finished in the server HTML and has no handover to schedule.
 *
 * It plays on the first hard load of a tab (the layout does not remount on a soft
 * navigation, so moving around the site never replays it either). Reduced motion
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

  useEffect(() => {
    // Everything below belongs to the curtain being up. Without this the cleanup
    // never ran: `phase === "done"` returns null but does not unmount the
    // component, so the scroll hold below stayed armed on `window` for the life of
    // the page — and with Lenis running `syncTouch: false`, a permanently
    // prevented `touchmove` is a storefront nobody can scroll on a phone.
    if (phase !== "loading") return;

    // Set by the gate script in the layout before this curtain was ever parsed:
    // the tab has had its intro, the curtain is already `display: none`, and
    // nobody is waiting on it — CookieConsent reads the same attribute and comes
    // straight up. Handed to the next tick for the reason spelled out below.
    if (document.documentElement.dataset.intro === "skip") {
      const id = setTimeout(() => setPhase("done"), 0);
      return () => clearTimeout(id);
    }

    if (reduceMotion) {
      // Next tick rather than in the effect body: the curtain is in the server
      // HTML, so the first client render has to match it before it can leave.
      const id = setTimeout(() => setPhase("done"), 320);
      return () => clearTimeout(id);
    }

    // Hold the page still behind the curtain. Swallowing the events (rather than
    // `overflow: hidden` on <body>) keeps the scrollbar in place, so nothing
    // shifts sideways when the curtain lifts. It does not hold Lenis, whatever
    // this comment used to claim — Lenis never reads `defaultPrevented`, so a
    // wheel during the intro still moves the page behind the curtain.
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
  }, [phase, reduceMotion]);

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

  // Esc ends it too. The curtain covers the whole viewport and swallows scroll
  // for the better part of four seconds, and until this the only way out was
  // clicking one small button in a corner — nothing at all for a visitor who is
  // not using a mouse.
  useEffect(() => {
    if (phase !== "loading") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPhase("exiting");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase]);

  if (phase === "done") return null;

  return (
    <motion.div
      ref={curtainRef}
      className="intro-curtain bg-noise fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-brown-950"
      // Deliberately *not* `aria-hidden` on the wrapper. It used to be, which
      // hid the skip button below from the accessibility tree while leaving it
      // focusable — the classic focusable-inside-aria-hidden fault, and here it
      // meant a screen-reader user was held behind an opaque full-screen curtain
      // with the only exit unannounced. The decoration carries `aria-hidden`
      // individually instead, so the button is the one thing that is announced.
      initial={{ clipPath: "inset(0% 0% 0% 0%)" }}
      animate={{ clipPath: phase === "exiting" ? "inset(0% 0% 100% 0%)" : "inset(0% 0% 0% 0%)" }}
      transition={{ duration: EXIT_DURATION, ease: [0.76, 0, 0.24, 1] }}
    >
      <svg width="132" height="132" viewBox="0 0 132 132" className="mb-6" aria-hidden>
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
        aria-hidden
        className="intro-name absolute text-3xl font-semibold tracking-wide text-cream"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        Taccalite
      </div>

      <p
        aria-hidden
        className="intro-tagline mt-24 text-xs font-medium tracking-[0.25em] text-cream/50 uppercase"
      >
        Norcineria di famiglia · dal 1946
      </p>

      <div aria-hidden className="intro-rule mt-8 h-px w-40 overflow-hidden bg-cream/10">
        <div className="intro-rule-fill h-full w-full bg-gold" />
      </div>

      {/* The first focusable thing in the document — the layout renders this
          component ahead of the header — so one Tab reaches it. Named in full
          for a screen reader, which gets no help from the arrow. */}
      <button
        type="button"
        onClick={handleSkip}
        aria-label="Salta l'introduzione"
        className="intro-skip tap absolute right-6 bottom-6 text-xs font-medium tracking-wide text-cream/75 hover:text-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none sm:right-10 sm:bottom-10"
      >
        <span aria-hidden>Salta →</span>
      </button>
    </motion.div>
  );
}
