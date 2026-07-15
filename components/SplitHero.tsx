"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import PillButton from "./PillButton";

const EASE = [0.16, 1, 0.3, 1] as const;

function RevealLine({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <span className="block overflow-hidden">
      <motion.span
        className="block"
        initial={{ y: "105%" }}
        animate={{ y: "0%" }}
        transition={{ duration: 1.2, ease: EASE, delay }}
      >
        {children}
      </motion.span>
    </span>
  );
}

export default function SplitHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  // Scroll-bound transforms only exist client-side; applying them during
  // hydration would mismatch the server-rendered markup.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const parallax = ready && !reduceMotion;

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, -40]);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-[#1c1512] pt-24 lg:min-h-screen"
    >
      <div className="bg-noise absolute inset-0 opacity-10" />
      <div className="parallax-orb absolute -top-52 -left-52 h-[52rem] w-[52rem] opacity-10" />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 py-24 sm:px-12 lg:min-h-[calc(100vh-6rem)] lg:grid-cols-[1.15fr_1fr] lg:gap-20">
        {/* ——— Massive serif typography, camera-left ——— */}
        <motion.div style={parallax ? { y: textY } : undefined} className="relative z-10">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
            className="eyebrow mb-8 block"
          >
            Norcineria dal 1946 · Ancona
          </motion.span>

          <h1 className="font-display text-[16vw] leading-[0.9] font-semibold tracking-tighter text-cream sm:text-[11vw] lg:text-[7.5vw]">
            <RevealLine delay={0.25}>Taccalite</RevealLine>
            <RevealLine delay={0.4}>
              <span className="text-cream/45">Norcineria</span>
            </RevealLine>
            <RevealLine delay={0.55}>
              <span className="text-gold italic">Porchetta</span>
            </RevealLine>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.8 }}
            className="mt-10 max-w-md text-lg leading-relaxed font-light text-cream/75"
          >
            Dal 1946 la nostra famiglia custodisce l&apos;arte norcina nel cuore delle Marche.
            Ogni sabato mattina la porchetta esce calda dal forno di Piazza Kennedy.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.95 }}
            className="mt-10 flex flex-wrap gap-4"
          >
            <PillButton href="/porchetta" tone="cream">
              Scopri la porchetta
            </PillButton>
            <PillButton href="/prenotazioni" tone="ghost">
              Prenota un tavolo
            </PillButton>
          </motion.div>
        </motion.div>

        {/* ——— Spatial focal point: large image card, camera-right ——— */}
        <motion.div
          style={parallax ? { y: imageY } : undefined}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease: EASE, delay: 0.5 }}
          className="relative"
        >
          <div className="cinematic-shadow relative aspect-[4/5] overflow-hidden rounded-lg">
            <Image
              src="https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&q=90&w=1600"
              alt="La porchetta artigianale Taccalite appena tagliata"
              fill
              preload
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 45vw"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-brown-950/40 via-transparent to-white/10" />
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.6 }}
        className="pointer-events-none absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-3 text-cream/50 lg:flex"
      >
        <span className="text-[9px] font-bold tracking-[0.5em] uppercase">Scroll</span>
        <div className="h-10 w-px bg-gradient-to-b from-cream/40 to-transparent" />
      </motion.div>
    </section>
  );
}
