"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Image from "next/image";

gsap.registerPlugin(ScrollTrigger);

type Dish = {
  src: string;
  alt: string;
  label: string;
};

const DISHES: Dish[] = [
  { src: "/images/home-hero-gastronomia.jpg", alt: "Banco gastronomia Taccalite", label: "La gastronomia" },
  { src: "/images/negozio-centro-formaggi.jpg", alt: "Formaggi selezionati Taccalite", label: "I formaggi" },
  { src: "/images/negozio-carni-prosciutto.jpg", alt: "Prosciutto di Norcia Taccalite", label: "I salumi" },
  { src: "/images/shop-shelves-prodotti.jpg", alt: "Prodotti in bottega Taccalite", label: "La bottega" },
];

export default function ScrollIntroSequence() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dishRefs = useRef<Array<HTMLDivElement | null>>([]);
  const textRef = useRef<HTMLDivElement>(null);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useGSAP(
    () => {
      if (reduceMotion !== false) return;
      const dishes = dishRefs.current.filter(Boolean) as HTMLDivElement[];
      if (dishes.length === 0) return;

      gsap.set(dishes[0], { opacity: 1, scale: 1, x: 0, y: 0 });
      gsap.set(dishes.slice(1), { opacity: 0 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: stageRef.current,
          start: "top top",
          end: "+=3200",
          pin: true,
          scrub: true,
          anticipatePin: 1,
        },
      });

      // Minimal text holds briefly, then gets out of the way early.
      tl.to(textRef.current, { opacity: 0, y: -30, duration: 0.5 }, 0.15);

      // Dish 1 (hero) holds, then drifts up and out — slow depth layer.
      tl.to(dishes[0], { scale: 1.18, y: -140, opacity: 0, duration: 1.2, ease: "none" }, 0.3);

      // Dish 2 crosses in fast from below, then exits left at a different speed.
      tl.fromTo(
        dishes[1],
        { opacity: 0, scale: 1.25, y: 220, x: 0 },
        { opacity: 1, scale: 1, y: 0, x: 0, duration: 0.9, ease: "none" },
        0.55
      );
      tl.to(dishes[1], { opacity: 0, scale: 0.82, x: -180, duration: 1, ease: "none" }, 1.55);

      // Dish 3 crosses in from the right, slower drift, different depth.
      tl.fromTo(
        dishes[2],
        { opacity: 0, scale: 1.3, x: 260, y: 0 },
        { opacity: 1, scale: 1, x: 0, y: 0, duration: 1.1, ease: "none" },
        1.75
      );
      tl.to(dishes[2], { opacity: 0, scale: 0.85, y: -160, duration: 1, ease: "none" }, 2.85);

      // Dish 4 settles into place and holds — bridges into normal page content.
      tl.fromTo(
        dishes[3],
        { opacity: 0, scale: 1.2, y: 180 },
        { opacity: 1, scale: 1, y: 0, duration: 1.1, ease: "none" },
        3.0
      );
    },
    { scope: rootRef, dependencies: [reduceMotion] }
  );

  // Accessible / reduced-motion fallback: a single static hero image, no scroll-jacking.
  if (reduceMotion) {
    return (
      <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-brown-950">
        <div className="bg-noise absolute inset-0 opacity-20" />
        <span className="text-xs font-semibold tracking-[0.25em] text-gold uppercase">Norcineria Taccalite</span>
        <span className="font-display mt-1 text-lg text-cream/70">Ancona, dal 1946</span>
        <div className="relative mt-8 h-[58vh] w-[62vw] max-w-xl overflow-hidden rounded-3xl border border-cream/10 shadow-2xl">
          <Image
            src={DISHES[0].src}
            alt={DISHES[0].alt}
            fill
            priority
            className="object-cover"
            sizes="80vw"
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <div ref={stageRef} className="relative h-screen w-full overflow-hidden bg-brown-950">
        <div className="bg-noise absolute inset-0 opacity-20" />

        <div
          ref={textRef}
          className="absolute inset-x-0 top-14 z-40 flex flex-col items-center text-center"
        >
          <span className="text-xs font-semibold tracking-[0.25em] text-gold uppercase">
            Norcineria Taccalite
          </span>
          <span className="mt-1 font-display text-lg text-cream/70">Ancona, dal 1946</span>
        </div>

        {DISHES.map((dish, i) => (
          <div
            key={dish.src}
            ref={(el) => {
              dishRefs.current[i] = el;
            }}
            className="absolute top-1/2 left-1/2 h-[46vh] w-[78vw] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-cream/10 shadow-2xl sm:h-[58vh] sm:w-[62vw]"
            style={{ zIndex: 10 + i, opacity: i === 0 ? 1 : 0 }}
          >
            <Image src={dish.src} alt={dish.alt} fill priority={i === 0} className="object-cover" sizes="80vw" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brown-950/80 to-transparent p-5">
              <span className="text-sm font-semibold tracking-wide text-cream">{dish.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
