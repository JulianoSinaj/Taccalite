"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

export default function MagneticCursor() {
  const [ready, setReady] = useState(false);
  const [hovering, setHovering] = useState(false);
  const activeMagnet = useRef<HTMLElement | null>(null);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const springX = useSpring(x, { damping: 25, stiffness: 300, mass: 0.5 });
  const springY = useSpring(y, { damping: 25, stiffness: 300, mass: 0.5 });

  useEffect(() => {
    const isFinePointer = window.matchMedia("(pointer: fine)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!isFinePointer || reduceMotion) return;
    setReady(true);

    function resetMagnet() {
      if (activeMagnet.current) {
        activeMagnet.current.style.transform = "";
        activeMagnet.current = null;
      }
    }

    function handleMove(e: MouseEvent) {
      x.set(e.clientX);
      y.set(e.clientY);

      const target = e.target as HTMLElement | null;
      const interactive = target?.closest("a, button");
      setHovering(!!interactive);

      const magnet = target?.closest<HTMLElement>("[data-magnetic]") ?? null;
      if (magnet !== activeMagnet.current) resetMagnet();
      if (magnet) {
        const rect = magnet.getBoundingClientRect();
        const relX = e.clientX - rect.left - rect.width / 2;
        const relY = e.clientY - rect.top - rect.height / 2;
        magnet.style.transition = "transform 0.2s ease-out";
        magnet.style.transform = `translate(${relX * 0.25}px, ${relY * 0.25}px)`;
        activeMagnet.current = magnet;
      }
    }

    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      resetMagnet();
    };
  }, [x, y]);

  if (!ready) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[9998] rounded-full border border-gold mix-blend-difference"
      style={{ x: springX, y: springY, translateX: "-50%", translateY: "-50%" }}
      animate={{ width: hovering ? 56 : 16, height: hovering ? 56 : 16 }}
      transition={{ duration: 0.2 }}
    />
  );
}
