"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import Image from "next/image";

// Spec'd spring: heavy enough to feel like a camera move, not a UI tween.
const SPRING = { mass: 0.5, stiffness: 50, damping: 20 };
const CINEMATIC_EASE = [0.16, 1, 0.3, 1] as const;

const FRAME =
  "absolute overflow-hidden rounded-[28px] border border-cream/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] ring-1 ring-black/20";

// Forced on every moving frame: keeps each layer on its own GPU-composited plane.
const GPU: React.CSSProperties = {
  willChange: "transform",
  transformStyle: "preserve-3d",
  backfaceVisibility: "hidden",
};

function FrameGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-white/[0.06]" />
  );
}

function SplitReveal({
  text,
  className,
  baseDelay = 0,
  stagger = 0.045,
}: {
  text: string;
  className?: string;
  baseDelay?: number;
  stagger?: number;
}) {
  return (
    <span className={`inline-block overflow-hidden align-bottom ${className ?? ""}`} aria-label={text}>
      {text.split("").map((char, i) => (
        <motion.span
          key={`${char}-${i}`}
          aria-hidden
          className="inline-block"
          initial={{ y: "110%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          transition={{ duration: 1.5, ease: CINEMATIC_EASE, delay: baseDelay + i * stagger }}
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
  // defaults to full motion (matches the rest of the codebase's pattern) so
  // this stays SSR-safe and never conditionally unmounts the scroll target.
  const reduceMotion = ready && !!reduceMotionPreferred;

  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ["start start", "end end"],
  });
  const p = useSpring(scrollYProgress, SPRING);

  // ——— Title: recedes upward as the camera starts to move.
  const headerOpacity = useTransform(p, [0, 0.22, 0.32], [1, 1, 0]);
  const headerY = useTransform(p, [0, 0.32], [0, -48]);
  const headerZ = useTransform(p, [0, 0.32], [0, -120]);

  // ——— Main hero dish: pushes backward into the screen and tilts down,
  // revealing the horizon behind it.
  const dish1Z = useTransform(p, [0, 1], [0, -300]);
  const dish1RotateX = useTransform(p, [0, 1], [0, 10]);
  const dish1Opacity = useTransform(p, [0, 0.8, 0.96], [1, 1, 0]);

  // ——— Foreground dishes: start BEHIND the camera (z: 600px with a 1200px
  // perspective ≈ 2× magnification, out of frame), then fly backwards past the
  // sides of the viewport into the scene.
  const dishLeftZ = useTransform(p, [0.08, 0.5, 1], [600, 80, -220]);
  const dishLeftOpacity = useTransform(p, [0.1, 0.32, 0.9, 1], [0, 1, 1, 0]);
  const dishLeftY = useTransform(p, [0.08, 1], ["6vh", "-4vh"]);

  const dishRightZ = useTransform(p, [0.16, 0.58, 1], [600, 60, -260]);
  const dishRightOpacity = useTransform(p, [0.18, 0.4, 0.9, 1], [0, 1, 1, 0]);
  const dishRightY = useTransform(p, [0.16, 1], ["8vh", "-6vh"]);

  // ——— Background ingredients: pinned deep behind the scene, drifting up at
  // a fraction of scroll speed — the macro-depth cue.
  const bgY = useTransform(p, [0, 1], [0, -200]);
  const bgYSlow = useTransform(p, [0, 1], [0, -120]);
  const bgOpacity = useTransform(p, [0, 0.12, 0.85, 1], [0.4, 0.75, 0.75, 0]);

  return (
    <div ref={wrapperRef} className="relative" style={{ height: reduceMotion ? "100vh" : "400vh" }}>
      {/* Pinned full-viewport 3D stage: everything inside lives in one shared
          perspective camera so translateZ reads as true depth. */}
      <div
        className="sticky top-0 h-screen w-full overflow-hidden bg-[#1c1512]"
        style={{ perspective: "1200px", perspectiveOrigin: "50% 50%" }}
      >
        <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
          <div className="bg-noise absolute inset-0 opacity-10" />

          {/* ——— Deep background: tiny details floating at z: -800 ——— */}
          {!reduceMotion && (
            <>
              <motion.div
                style={{ ...GPU, z: -800, y: bgY, opacity: bgOpacity }}
                className={`${FRAME} top-[12%] left-[12%] hidden h-[16vh] w-[12vw] sm:block`}
              >
                <Image
                  src="/images/shop-shelves-prodotti.jpg"
                  alt=""
                  fill
                  loading="lazy"
                  className="object-cover"
                  sizes="12vw"
                />
                <FrameGlow />
              </motion.div>
              <motion.div
                style={{ ...GPU, z: -800, y: bgYSlow, opacity: bgOpacity }}
                className={`${FRAME} top-[58%] right-[14%] hidden h-[14vh] w-[10vw] sm:block`}
              >
                <Image
                  src="/images/negozio-carni-prosciutto.jpg"
                  alt=""
                  fill
                  loading="lazy"
                  className="object-cover"
                  sizes="10vw"
                />
                <FrameGlow />
              </motion.div>
              <motion.div
                style={{ ...GPU, z: -800, y: bgY, opacity: bgOpacity }}
                className="absolute top-[30%] right-[28%] hidden h-40 w-40 rounded-full bg-gold/20 blur-3xl sm:block"
              />
              <motion.div
                style={{ ...GPU, z: -800, y: bgYSlow, opacity: bgOpacity }}
                className="absolute bottom-[18%] left-[26%] hidden h-52 w-52 rounded-full bg-gold/10 blur-3xl sm:block"
              />
            </>
          )}

          {/* ——— Typography: split-reveal on load, recedes on scroll ——— */}
          <motion.div
            style={reduceMotion ? undefined : { ...GPU, opacity: headerOpacity, y: headerY, z: headerZ }}
            className="absolute inset-x-0 top-0 z-50 flex flex-col items-center pt-20 sm:pt-24"
          >
            <span className="text-[11px] font-semibold tracking-[0.3em] text-gold uppercase">
              <SplitReveal text="Norcineria dal 1946" baseDelay={0.15} stagger={0.02} />
            </span>
            <span className="font-display mt-2 text-5xl font-semibold tracking-tight text-cream sm:text-6xl">
              <SplitReveal text="Taccalite" baseDelay={0.35} stagger={0.06} />
            </span>
          </motion.div>

          {/* ——— Main hero dish: cinematic glide-in on load, camera push on scroll.
              Entrance (y/opacity) lives on the inner element so it never fights
              the scroll-driven z/rotateX/opacity on the outer frame. ——— */}
          <motion.div
            style={
              reduceMotion
                ? undefined
                : { ...GPU, z: dish1Z, rotateX: dish1RotateX, opacity: dish1Opacity }
            }
            className="absolute top-1/2 left-1/2 z-20 h-[54vh] w-[80vw] -translate-x-1/2 -translate-y-1/2 sm:w-[38vw]"
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 1.5, ease: CINEMATIC_EASE }}
              style={GPU}
              className={`${FRAME} inset-0`}
            >
              <Image
                src="/images/home-hero-gastronomia.jpg"
                alt="Banco gastronomia Taccalite"
                fill
                preload
                className="object-cover"
                sizes="80vw"
              />
              <FrameGlow />
            </motion.div>
          </motion.div>

          {/* ——— Left foreground dish: flies in from behind the camera ——— */}
          {!reduceMotion && (
            <motion.div
              style={{
                ...GPU,
                z: dishLeftZ,
                y: dishLeftY,
                rotateY: -15,
                opacity: dishLeftOpacity,
              }}
              className={`${FRAME} top-[52%] left-[15%] z-30 hidden h-[34vh] w-[24vw] sm:block`}
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

          {/* ——— Right foreground dish: same fly-through, opposite tilt ——— */}
          {!reduceMotion && (
            <motion.div
              style={{
                ...GPU,
                z: dishRightZ,
                y: dishRightY,
                rotateY: 15,
                opacity: dishRightOpacity,
              }}
              className={`${FRAME} top-[18%] right-[10%] z-30 hidden h-[30vh] w-[21vw] sm:block`}
            >
              <Image
                src="/images/negozio-carni-prosciutto.jpg"
                alt="Prosciutto di Norcia Taccalite"
                fill
                loading="lazy"
                className="object-cover"
                sizes="22vw"
              />
              <FrameGlow />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
