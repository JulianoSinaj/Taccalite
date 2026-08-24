"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import SealSvg from "./SealSvg";
import { cn } from "@/lib/utils";

// `ssr: false` keeps three.js out of the server bundle and off the critical path.
// The hero's LCP is the headline — plain text — and must never wait on WebGL.
const Seal3D = dynamic(() => import("./Seal3D"), { ssr: false });

// …but off the critical path is not the same as last in the queue. Left to the
// render below, the chunk is not even asked for until React has hydrated, which
// puts a 255KB download *after* the slowest part of the visit rather than
// alongside it — and the intro veil then spends its whole budget waiting on a
// request that had not been made when the veil went up.
//
// This fires as soon as the client bundle evaluates this module, which is early
// enough to overlap the fetch with hydration. It resolves the same module record
// the `dynamic()` above will ask for, so the render costs nothing extra; it is a
// head start, not a second load. Reduced motion never mounts the canvas, so it
// is the one case that should not pay for the bytes.
if (typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  void import("./Seal3D");
}

/**
 * How long the intro veil is allowed to be held open for this canvas, counted
 * from the moment the component hydrates.
 *
 * The veil has its own hard cap, so this is not what stops the page hanging —
 * it is what stops a visitor whose machine will *never* draw the coin (no WebGL,
 * a blocked context, a throttled background tab) from staring at the paper for
 * the full cap to find that out. Comfortably longer than the chunk needs on a
 * warm cache, comfortably shorter than the cap.
 */
const GATE_TIMEOUT = 1100;

/**
 * Tell an intro veil, if one is listening, that it no longer needs to wait on
 * the seal.
 *
 * The current intro (components/IntroLoader.tsx) runs on its own clock and hangs
 * nothing on `window`, so today this is a no-op. It is kept as the seam: a veil
 * that wants to hold the page until the coin has a frame only has to define
 * `window.__taccaliteSealReady` before this component hydrates. Calling into
 * nothing is the correct behaviour in every other case.
 */
function releaseIntroVeil() {
  (window as Window & { __taccaliteSealReady?: () => void }).__taccaliteSealReady?.();
}

/**
 * The brand mark in the hero: struck gold in 3D once the page is settled, a flat
 * foil seal until then and for anyone who asked for less motion.
 *
 * The two marks are layered rather than swapped. The old version rendered one or
 * the other, flipping on a blind 200ms timer, which gave every visit the same
 * three-step stutter: the flat seal vanished, the corner sat empty for as long
 * as the three.js chunk took to arrive, and the canvas then appeared mid-build
 * before snapping into place. Nothing about that is the canvas being "heavy" —
 * it is the swap happening at a moment nobody can predict.
 *
 * So the flat seal stays put and owns the corner, the canvas mounts underneath
 * it unseen, and the handover only happens once the canvas says it has drawn
 * something finished. Every state in between looks like the finished page.
 *
 * On a hard load of the homepage all of that happens behind the intro veil,
 * which waits on this component before lifting: the visitor's first sight of the
 * hero already has gold in the corner, and the cross-fade below is only what
 * covers the cases where it doesn't.
 */
export default function SealMark({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  /**
   * `flat` — the SVG and nothing else. `warming` — canvas mounted and drawing,
   * still invisible. `struck` — the canvas has a real frame and takes the corner.
   */
  const [phase, setPhase] = useState<"flat" | "warming" | "struck">("flat");
  /**
   * Whether the next handover should happen without a cross-fade. Two causes,
   * one behaviour:
   *
   * The veil is still down, so the handover is entirely out of sight — and a
   * cross-fade nobody watches is not a cross-fade, it is a visitor arriving
   * partway through one.
   *
   * Or the drawing context has just been lost, so the canvas went blank in a
   * single frame — and half a second of fading the foil back in is half a second
   * of empty corner. Matching the abruptness of what happened is what stops it
   * reading as a fault.
   *
   * See the class lists below.
   */
  const [snap, setSnap] = useState(false);

  // Mount the canvas the moment hydration is done with the thread. This used to
  // wait for `requestIdleCallback`, on the reasoning that the canvas should not
  // compete with the hero photograph and the two variable fonts — but the veil is
  // now holding the page open precisely so this has room to draw, so idling
  // through that window only spent it. Contention is the point: everything the
  // veil waits on should be in flight at once.
  //
  // The next tick rather than the effect body itself, because the mount cannot
  // happen during the first render: `useReducedMotion` reads `matchMedia`, which
  // the server cannot, so branching on it in the initial tree is a hydration
  // mismatch. A timer and not `requestAnimationFrame` — rAF does not run in a
  // tab that is not compositing, which would leave a page opened in a background
  // tab with no canvas at all until the visitor looked at it.
  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setTimeout(
      () => setPhase((current) => (current === "flat" ? "warming" : current)),
      0
    );
    return () => window.clearTimeout(id);
  }, [reduceMotion]);

  // The gate's own deadline, whatever the canvas is doing. Reduced motion never
  // mounts a canvas at all, so it releases at once.
  //
  // The deadline does not start until the tab is on screen. It is there to catch
  // a machine that will *never* draw the coin — and a backgrounded tab is not
  // that machine, it is a paused one: rAF does not run, so the canvas cannot
  // report a frame however long it is given. Counting anyway meant a page opened
  // in a background tab released the gate on a stopwatch nobody was watching,
  // the veil lifted while still hidden, and the visitor arrived to find the seal
  // cross-fading to gold in front of them.
  useEffect(() => {
    if (reduceMotion) {
      releaseIntroVeil();
      return;
    }

    let timer = 0;

    function arm() {
      timer = window.setTimeout(releaseIntroVeil, GATE_TIMEOUT);
    }

    function onVisible() {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", onVisible);
      arm();
    }

    if (document.hidden) document.addEventListener("visibilitychange", onVisible);
    else arm();

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(timer);
    };
  }, [reduceMotion]);

  const handleReady = useCallback(() => {
    // Read at the moment of the handover, not during render: whether the veil is
    // still down is exactly the question "is anyone looking at this right now",
    // and the answer is only meaningful now. Assigned rather than only set, so a
    // handover that follows a restored context clears the snap the loss asked
    // for and comes back as an ordinary cross-fade.
    setSnap(document.documentElement.dataset.intro === "play");
    setPhase("struck");
    releaseIntroVeil();
  }, []);

  // The GPU has taken the context away — most often from a tab left in the
  // background, which is exactly where nobody is watching to notice. The canvas
  // is blank from this instant, so the foil has to be back in this instant.
  //
  // Back to `warming`, not `flat`: the canvas stays mounted, three rebuilds its
  // GL state on restore, and <Seal3D/> re-arms its ready signal on the other
  // side — so the coin can simply return. Unmounting would throw away a context
  // the browser is in the middle of handing back.
  const handleLost = useCallback(() => {
    setSnap(true);
    setPhase((current) => (current === "struck" ? "warming" : current));
  }, []);

  // Nothing times the canvas out. A canvas that has not reported a frame is not
  // necessarily a broken one — it is far more often a tab in the background,
  // where rAF is paused and so is the render loop. Left alone, it stays
  // invisible behind the flat seal for as long as that takes and fades in
  // whenever it does have something to show, which is the right answer for a
  // stalled context and a returning visitor alike.
  //
  // `reduceMotion` is part of `struck` and not just of `show3D`: were it only
  // the latter, flipping the OS setting mid-visit would unmount the canvas while
  // the flat seal underneath was still faded out, and the corner would empty.
  const struck = phase === "struck" && !reduceMotion;
  const show3D = !reduceMotion && phase !== "flat";

  return (
    // `relative` first so a caller's own positioning wins the merge; either way
    // the host is a containing block for the two stacked layers.
    <div className={cn("relative", className)} aria-hidden>
      <div
        className={cn(
          // The flat seal fades on a delay, so the canvas is already most of the
          // way up before it starts leaving. A straight cross-fade would dip
          // through a washed-out halfway point where neither mark is solid.
          "absolute inset-0 flex items-center justify-center transition-opacity ease-out",
          snap ? "duration-0 delay-0" : "duration-500",
          struck ? (snap ? "opacity-0" : "opacity-0 delay-300") : "opacity-100"
        )}
      >
        <SealSvg className="h-full w-full drop-shadow-[0_18px_36px_rgba(42,26,16,0.22)]" />
      </div>

      {show3D && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity ease-out",
            snap ? "duration-0" : "duration-700",
            struck ? "opacity-100" : "opacity-0"
          )}
        >
          <Seal3D onReady={handleReady} onLost={handleLost} />
        </div>
      )}
    </div>
  );
}
