"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { MotionValue } from "motion/react";
import MedallionBadge from "./MedallionBadge";

const GoldSeal3D = dynamic(() => import("./GoldSeal3D"), { ssr: false });

type HeroSealProps = {
  scroll?: MotionValue<number>;
  className?: string;
};

/**
 * Lazy 3D brand seal. WebGL scene on capable devices; falls back to the
 * static rotating badge under reduced motion or before hydration.
 */
export default function HeroSeal({ scroll, className = "" }: HeroSealProps) {
  const [mode, setMode] = useState<"pending" | "3d" | "static">("pending");

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMode(reduceMotion ? "static" : "3d");
  }, []);

  if (mode === "static") {
    return <MedallionBadge className={className} />;
  }

  return (
    <div className={`pointer-events-none ${className}`} aria-hidden>
      {mode === "3d" && <GoldSeal3D scroll={scroll} />}
    </div>
  );
}
