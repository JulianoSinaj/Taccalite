"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import MedallionBadge from "./MedallionBadge";

// Spec'd spring: heavy enough to feel like a camera move, not a UI tween.
const SPRING = { mass: 0.5, stiffness: 50, damping: 20 };
const CINEMATIC_EASE = [0.16, 1, 0.3, 1] as const;

// Forced on every moving frame: keeps each layer on its own GPU-composited plane.
const GPU: React.CSSProperties = {
  willChange: "transform",
  transformStyle: "preserve-3d",
  backfaceVisibility: "hidden",
};

function SplitReveal({
  text,
  className,
  baseDelay = 0,
  stagger = 0.06,
}: {
  text: string;
  className?: string;
  baseDelay?: number;
  stagger?: number;
}) {
  return (
    <span className={`inline-block overflow-visible align-bottom ${className ?? ""}`} aria-label={text}>
      {text.split("").map((char, i) => (
        <motion.span
          key={`${char}-${i}`}
          aria-hidden
          className="inline-block"
          initial={{ y: "110%", opacity: 0, rotateX: -90, filter: "blur(10px)" }}
          animate={{ y: "0%", opacity: 1, rotateX: 0, filter: "blur(0px)" }}
          transition={{ duration: 1.2, ease: CINEMATIC_EASE, delay: baseDelay + i * stagger }}
        >
          {char === " " ? " " : char}
        </motion.span>
      ))}
    </span>
  );
}

export default function ScrollIntroSequence() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reduceMotionPreferred = useReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  // Only ever true once we're actually sure the user wants reduced motion —
  // defaults to full motion so this stays SSR-safe and never conditionally
  // unmounts the scroll target.
  const reduceMotion = ready && !!reduceMotionPreferred;

  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ["start start", "end end"],
  });
  const p = useSpring(scrollYProgress, SPRING);

  // ——— Hero frame: the camera pushes it deep into the scene while tilting.
  const frameZ = useTransform(p, [0, 1], [0, -1200]);
  const frameRotateX = useTransform(p, [0, 1], [0, 18]);
  const frameRotateY = useTransform(p, [0, 1], [0, 8]);
  const frameOpacity = useTransform(p, [0, 0.85, 1], [1, 1, 0.4]);

  // ——— Title: recedes faster than the frame, drifting upward.
  const titleZ = useTransform(p, [0, 1], [0, -600]);
  const titleY = useTransform(p, [0, 1], [0, -80]);
  const titleOpacity = useTransform(p, [0, 0.5, 0.8], [1, 0.8, 0]);

  // ——— Left content block: holds, then slides away as the scene recedes.
  const contentOpacity = useTransform(p, [0, 0.45, 0.7], [1, 1, 0]);
  const contentY = useTransform(p, [0, 0.7], [0, -60]);

  // ——— Ambience: orbs drift at a fraction of scroll speed.
  const orb1X = useTransform(p, [0, 1], [0, 160]);
  const orb1Y = useTransform(p, [0, 1], [0, 80]);
  const orb2X = useTransform(p, [0, 1], [0, -120]);
  const orb2Y = useTransform(p, [0, 1], [0, -140]);

  const scrollHintOpacity = useTransform(p, [0, 0.12], [1, 0]);

  return (
    <div ref={wrapperRef} className="relative" style={{ height: reduceMotion ? "100vh" : "400vh" }}>
      {/* Pinned full-viewport 3D stage: one shared perspective camera so
          translateZ reads as true depth. */}
      <div
        className="sticky top-0 h-screen w-full overflow-hidden bg-[#1c1512]"
        style={{ perspective: "1500px", perspectiveOrigin: "50% 50%" }}
      >
        <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
          <div className="bg-noise absolute inset-0 opacity-10" />

          {!reduceMotion && (
            <>
              <motion.div
                style={{ x: orb1X, y: orb1Y }}
                className="parallax-orb absolute -top-40 -left-40 h-[60rem] w-[60rem] opacity-10"
              />
              <motion.div
                style={{
                  x: orb2X,
                  y: orb2Y,
                  background: "radial-gradient(circle, var(--color-brown-600) 0%, transparent 70%)",
                }}
                className="parallax-orb absolute -right-40 -bottom-40 h-[50rem] w-[50rem] opacity-10"
              />
            </>
          )}

          <div className="relative flex h-full w-full items-center px-6 pt-24 sm:px-12 lg:px-24 lg:pt-0">
            {/* ——— Asymmetric value-proposition block, camera-left ——— */}
            <motion.div
              style={reduceMotion ? undefined : { opacity: contentOpacity, y: contentY }}
              className="relative z-30 flex w-full flex-col items-start gap-8 lg:w-2/5"
            >
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 1.1, ease: CINEMATIC_EASE }}
                className="space-y-4"
              >
                <span className="eyebrow block">L&apos;antica arte marchigiana</span>
                <h2 className="font-display max-w-[500px] text-4xl leading-[1.05] font-medium tracking-tight text-white sm:text-5xl lg:text-[56px]">
                  La tradizione norcina nel cuore delle Marche
                </h2>
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 1.3, ease: CINEMATIC_EASE }}
                className="max-w-[480px] text-lg leading-relaxed font-light text-cream/70"
              >
                Da tre generazioni la famiglia Taccalite seleziona formaggi, salumi e carni con la
                stessa cura di sempre. Due negozi ad Ancona, un&apos;unica passione di famiglia.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 1.5, ease: CINEMATIC_EASE }}
                className="flex w-64 flex-col gap-3"
              >
                <Link
                  href="/negozi"
                  data-magnetic
                  className="inline-flex w-full items-center justify-center rounded-full bg-gold px-8 py-3.5 text-sm font-semibold text-brown-950 shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-all duration-500 hover:-translate-y-1 hover:bg-gold-dark hover:shadow-[0_20px_30px_-10px_rgba(225,190,100,0.4)]"
                >
                  Scopri i nostri negozi
                </Link>
                <Link
                  href="/prenotazioni"
                  data-magnetic
                  className="inline-flex w-full items-center justify-center rounded-full border border-white/20 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-500 hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/5"
                >
                  Prenota un tavolo
                </Link>
              </motion.div>
            </motion.div>

            {/* ——— Cinematic stage, camera-right ——— */}
            <div className="relative hidden h-full flex-col items-center justify-center lg:flex lg:w-3/5">
              <motion.div
                style={reduceMotion ? undefined : { ...GPU, z: titleZ, y: titleY, opacity: titleOpacity }}
                className="absolute top-[16%] z-40"
              >
                <h1 className="font-display text-7xl font-medium tracking-tighter text-white italic opacity-80">
                  <SplitReveal text="Taccalite" baseDelay={0.3} />
                </h1>
              </motion.div>

              <motion.div
                style={
                  reduceMotion
                    ? undefined
                    : { ...GPU, z: frameZ, rotateX: frameRotateX, rotateY: frameRotateY, opacity: frameOpacity }
                }
                className="relative z-20 aspect-[16/9] w-[62vw] max-w-5xl"
              >
                <motion.div
                  initial={{ y: 90, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 1.8, delay: 0.6, ease: CINEMATIC_EASE }}
                  style={GPU}
                  className="cinematic-shadow absolute inset-0 overflow-hidden rounded-[32px]"
                >
                  <Image
                    src="/images/home-hero-gastronomia.jpg"
                    alt="Il banco gastronomia della Norcineria Taccalite"
                    fill
                    preload
                    className="object-cover"
                    sizes="62vw"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-brown-950/40 via-transparent to-white/10" />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 1, delay: 1.8, ease: CINEMATIC_EASE }}
                  className="absolute -right-10 -bottom-10 h-32 w-32 md:h-44 md:w-44"
                >
                  <MedallionBadge className="h-full w-full" />
                </motion.div>
              </motion.div>
            </div>
          </div>

          <motion.div
            style={reduceMotion ? undefined : { opacity: scrollHintOpacity }}
            className="absolute bottom-10 left-1/2 z-40 flex -translate-x-1/2 animate-bounce flex-col items-center gap-4 text-white/40"
          >
            <span className="text-[10px] font-bold tracking-[0.5em] uppercase">
              Scroll per esplorare
            </span>
            <div className="h-14 w-px bg-gradient-to-b from-white/60 to-transparent" />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
