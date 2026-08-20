"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

// `ssr: false` keeps three.js out of the server bundle and off the critical path.
// The hero's LCP is the headline — plain text — and must never wait on WebGL.
const Seal3D = dynamic(() => import("./Seal3D"), { ssr: false });

/** Flat seal: the placeholder, the reduced-motion answer, and the safety net. */
function SealSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden role="presentation">
      <defs>
        <path
          id="seal-ring"
          d="M 100,100 m -74,0 a 74,74 0 1,1 148,0 a 74,74 0 1,1 -148,0"
          fill="none"
        />
        <linearGradient id="seal-foil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#eccb7a" />
          <stop offset="45%" stopColor="#d8b25c" />
          <stop offset="100%" stopColor="#b8913f" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="88" fill="url(#seal-foil)" />
      <circle cx="100" cy="100" r="82" fill="none" stroke="#2a1a10" strokeOpacity=".55" strokeWidth="1" />
      <circle cx="100" cy="100" r="64" fill="none" stroke="#2a1a10" strokeOpacity=".55" strokeWidth="1" />
      <text
        fill="#2a1a10"
        fontSize="10.5"
        fontWeight="600"
        letterSpacing="1.6"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        <textPath href="#seal-ring" startOffset="50%" textAnchor="middle">
          NORCINERIA TACCALITE · ANCONA · DAL 1946
        </textPath>
      </text>
      <text
        x="100"
        y="100"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#2a1a10"
        fontSize="62"
        fontWeight="600"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        T
      </text>
    </svg>
  );
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
 */
export default function SealMark({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  /**
   * `flat` — the SVG and nothing else. `warming` — canvas mounted and drawing,
   * still invisible. `struck` — the canvas has a real frame and takes the corner.
   */
  const [phase, setPhase] = useState<"flat" | "warming" | "struck">("flat");

  // Mount the canvas when the browser has nothing better to do, rather than at a
  // fixed 200ms — which reliably landed while the hero photograph and the two
  // variable fonts were still in flight, i.e. the busiest the main thread gets
  // all visit. The `timeout` is the backstop for a page that never goes idle.
  useEffect(() => {
    if (reduceMotion) return;

    let cancelled = false;
    const start = () => {
      if (!cancelled) setPhase((current) => (current === "flat" ? "warming" : current));
    };

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(start, { timeout: 1500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }

    const id = window.setTimeout(start, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [reduceMotion]);

  const handleReady = useCallback(() => setPhase("struck"), []);

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
          "absolute inset-0 flex items-center justify-center transition-opacity duration-500 ease-out",
          struck ? "opacity-0 delay-300" : "opacity-100"
        )}
      >
        <SealSvg className="h-full w-full drop-shadow-[0_18px_36px_rgba(42,26,16,0.22)]" />
      </div>

      {show3D && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-out",
            struck ? "opacity-100" : "opacity-0"
          )}
        >
          <Seal3D onReady={handleReady} />
        </div>
      )}
    </div>
  );
}
