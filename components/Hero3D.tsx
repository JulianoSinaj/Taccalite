"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Medallion3D = dynamic(() => import("./Medallion3D"), { ssr: false });

export default function Hero3D({ className = "" }: { className?: string }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setEnabled(!reduceMotion);
  }, []);

  if (!enabled) return null;

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`}>
      <div className="pointer-events-auto h-full w-full">
        <Medallion3D />
      </div>
    </div>
  );
}
