"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
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
 */
export default function SealMark({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  // One frame after paint, so the canvas never competes with the headline.
  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 200);
    return () => window.clearTimeout(id);
  }, []);

  if (reduceMotion || !mounted) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <SealSvg className="h-full w-full drop-shadow-[0_18px_36px_rgba(42,26,16,0.22)]" />
      </div>
    );
  }

  return (
    <div className={className}>
      <Seal3D />
    </div>
  );
}
