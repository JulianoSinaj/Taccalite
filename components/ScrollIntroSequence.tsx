"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import Image from "next/image";

const SPRING = { mass: 0.2, stiffness: 80, damping: 25 };

const FRAME =
  "absolute overflow-hidden rounded-[28px] border border-cream/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] ring-1 ring-black/20";

function FrameGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-white/[0.06]" />
  );
}

export default function ScrollIntroSequence() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reduceMotionPreferred = useReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  // Only ever true once we're actually sure the user wants reduced motion —
  // defaults to full motion (matches the rest of the codebase's pattern) so
  // this stays SSR-safe and never conditionally unmounts the scroll target.
  const reduceMotion = ready && !!reduceMotionPreferred;

  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ["start start", "end end"],
  });
  const p = useSpring(scrollYProgress, SPRING);

  // Phase 1 (0 -> 0.3): title recedes toward a fixed header feel.
  const headerOpacity = useTransform(p, [0, 0.22, 0.3], [1, 1, 0]);
  const headerScale = useTransform(p, [0, 0.3], [1, 0.86]);
  const headerY = useTransform(p, [0, 0.3], [0, -36]);

  // Hero dish holds through phase 1, recedes through phase 2/3.
  const dish1Scale = useTransform(p, [0, 0.3, 0.65, 0.88], [0.94, 1, 0.94, 0.82]);
  const dish1Opacity = useTransform(p, [0, 0.3, 0.78, 0.92], [1, 1, 1, 0]);

  // Left-foreground dish: fast parallax, grows as it passes close to camera.
  const dish2X = useTransform(p, [0.26, 0.55, 0.85, 1], ["-55vw", "0vw", "6vw", "16vw"]);
  const dish2Scale = useTransform(p, [0.26, 0.55, 0.85], [0.5, 1.08, 0.96]);
  const dish2Opacity = useTransform(p, [0.24, 0.34, 0.86, 1], [0, 1, 1, 0]);

  // Right-background dish: slower, deeper, smaller — classic parallax depth cue.
  const dish3X = useTransform(p, [0.3, 0.6, 0.9, 1], ["46vw", "4vw", "-4vw", "-14vw"]);
  const dish3Scale = useTransform(p, [0.3, 0.6, 0.9], [0.42, 0.68, 0.6]);
  const dish3Opacity = useTransform(p, [0.28, 0.4, 0.9, 1], [0, 0.85, 0.85, 0]);

  // Floating detail shot: settles last, bridges into normal content.
  const dish4Y = useTransform(p, [0.52, 0.82, 1], ["36vh", "0vh", "-8vh"]);
  const dish4Scale = useTransform(p, [0.52, 0.82], [0.72, 1]);
  const dish4Opacity = useTransform(p, [0.5, 0.62, 1], [0, 1, 1]);

  return (
    <div ref={wrapperRef} className="relative" style={{ height: reduceMotion ? "100vh" : "400vh" }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#1c1512]">
        <div className="bg-noise absolute inset-0 opacity-10" />

        <motion.div
          style={reduceMotion ? undefined : { opacity: headerOpacity, scale: headerScale, y: headerY }}
          className="absolute inset-x-0 top-0 z-50 flex flex-col items-center pt-20 sm:pt-24"
        >
          <span className="text-[11px] font-semibold tracking-[0.3em] text-gold uppercase">
            Norcineria dal 1946
          </span>
          <span className="font-display mt-2 text-5xl font-semibold tracking-tight text-cream sm:text-6xl">
            Taccalite
          </span>
        </motion.div>

        {/* Dish 3 — right background, deepest layer */}
        {!reduceMotion && (
          <motion.div
            style={{ x: dish3X, scale: dish3Scale, opacity: dish3Opacity }}
            className={`${FRAME} top-[16%] right-[6%] z-10 hidden h-[30vh] w-[22vw] sm:block`}
          >
            <Image
              src="/images/negozio-carni-prosciutto.jpg"
              alt="Prosciutto di Norcia Taccalite"
              fill
              loading="lazy"
              className="object-cover"
              sizes="30vw"
            />
            <FrameGlow />
          </motion.div>
        )}

        {/* Dish 1 — center hero, the anchor */}
        <motion.div
          style={
            reduceMotion
              ? undefined
              : { scale: dish1Scale, opacity: dish1Opacity }
          }
          className={`${FRAME} top-1/2 left-1/2 z-20 h-[54vh] w-[80vw] -translate-x-1/2 -translate-y-1/2 sm:w-[38vw]`}
        >
          <Image
            src="/images/home-hero-gastronomia.jpg"
            alt="Banco gastronomia Taccalite"
            fill
            priority
            className="object-cover"
            sizes="80vw"
          />
          <FrameGlow />
        </motion.div>

        {/* Dish 2 — left foreground, fastest / closest to camera */}
        {!reduceMotion && (
          <motion.div
            style={{ x: dish2X, scale: dish2Scale, opacity: dish2Opacity }}
            className={`${FRAME} bottom-[14%] left-[5%] z-30 hidden h-[32vh] w-[25vw] sm:block`}
          >
            <Image
              src="/images/negozio-centro-formaggi.jpg"
              alt="Formaggi selezionati Taccalite"
              fill
              loading="lazy"
              className="object-cover"
              sizes="26vw"
            />
            <FrameGlow />
          </motion.div>
        )}

        {/* Dish 4 — floating detail, settles last */}
        {!reduceMotion && (
          <motion.div
            style={{ y: dish4Y, scale: dish4Scale, opacity: dish4Opacity }}
            className={`${FRAME} right-[10%] bottom-[8%] z-40 hidden h-[20vh] w-[15vw] sm:block`}
          >
            <Image
              src="/images/shop-shelves-prodotti.jpg"
              alt="Prodotti in bottega Taccalite"
              fill
              loading="lazy"
              className="object-cover"
              sizes="16vw"
            />
            <FrameGlow />
          </motion.div>
        )}
      </div>
    </div>
  );
}
