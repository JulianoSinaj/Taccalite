"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";

const ACTS = [
  {
    n: "01",
    title: "La cottura lenta",
    text: "Rosmarino, aglio, finocchietto selvatico. Poi ore di forno, finché la pelle non canta sotto il coltello e la carne si scioglie.",
    image:
      "https://images.unsplash.com/photo-1615937657715-bc7b4b7962c1?auto=format&fit=crop&q=80&w=1600",
    alt: "La cottura lenta in forno",
  },
  {
    n: "02",
    title: "La selezione",
    text: "Solo suino di alta qualità, scelto capo per capo e lavorato a mano dai nostri norcini, come si fa in famiglia dal 1946.",
    image: "/images/selezione-prosciutto-camino.jpg",
    alt: "Il prosciutto stagionato accanto al fuoco, con aglio e peperoncini",
  },
  {
    n: "03",
    title: "Il sabato mattina",
    text: "Esce calda dal forno di Piazza Kennedy. Il profumo attraversa la piazza; chi la conosce arriva presto, perché finisce sempre.",
    image:
      "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&q=80&w=1600",
    alt: "La porchetta calda del sabato, appena tagliata",
  },
];

function Act({
  act,
  index,
  progress,
  ready,
}: {
  act: (typeof ACTS)[number];
  index: number;
  progress: MotionValue<number>;
  ready: boolean;
}) {
  const start = index / ACTS.length;
  const end = (index + 1) / ACTS.length;
  const fade = 0.045;
  const isFirst = index === 0;
  const isLast = index === ACTS.length - 1;

  // Crossfades overlap symmetrically around each act boundary so the
  // outgoing and incoming acts always sum to full coverage — no dark gap
  // where lower stacked acts could bleed through.
  const opacity = useTransform(
    progress,
    isFirst
      ? [end - fade, end + fade]
      : isLast
        ? [start - fade, start + fade]
        : [start - fade, start + fade, end - fade, end + fade],
    isFirst ? [1, 0] : isLast ? [0, 1] : [0, 1, 1, 0]
  );
  // Hard-hide acts outside their window so a non-adjacent act can never
  // paint through a partially transparent crossfade above it.
  const visibility = useTransform(progress, (v) =>
    (isFirst || v > start - fade) && (isLast || v < end + fade) ? "visible" : "hidden"
  );
  const imageScale = useTransform(progress, [start, end], [1.18, 1.02]);
  const textY = useTransform(progress, [start, start + 0.06, end], [48, 0, -24]);

  return (
    <motion.div
      style={ready ? { opacity, visibility } : undefined}
      className={`absolute inset-0 ${ready ? "" : index === 0 ? "opacity-100" : "opacity-0"}`}
    >
      <motion.div style={ready ? { scale: imageScale } : undefined} className="absolute inset-0">
        <Image
          src={act.image}
          alt={act.alt}
          fill
          className="object-cover"
          sizes="100vw"
          quality={82}
        />
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-t from-brown-950 via-brown-950/45 to-brown-950/30" />
      <div className="bg-noise absolute inset-0 opacity-15" />

      <motion.div
        style={ready ? { y: textY } : undefined}
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-7xl px-6 pb-20 sm:px-12 sm:pb-28"
      >
        <p className="font-display text-7xl font-bold text-gold/25 sm:text-8xl">{act.n}</p>
        <h3 className="font-display mt-2 max-w-2xl text-4xl leading-[0.95] tracking-tighter text-cream sm:text-6xl lg:text-7xl">
          {act.title}
        </h3>
        <p className="mt-6 max-w-lg text-lg leading-relaxed font-light text-cream/80 sm:text-xl">
          {act.text}
        </p>
        <p className="mt-8 text-[10px] font-bold tracking-[0.3em] text-cream/60 uppercase">
          {act.n} / 0{ACTS.length} — Come nasce la porchetta
        </p>
      </motion.div>
    </motion.div>
  );
}

/**
 * 350vh pinned scroll-film: the porchetta process in three acts, scrubbed
 * by scroll progress with full-bleed crossfading imagery and a gold
 * progress rail. Falls back to stacked static panels under reduced motion.
 */
export default function ScrollFilm() {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const railScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  if (reduceMotion) {
    return (
      <section className="bg-brown-950">
        {ACTS.map((act) => (
          <div key={act.n} className="relative flex min-h-[70vh] items-end overflow-hidden">
            <Image src={act.image} alt={act.alt} fill className="object-cover" sizes="100vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-brown-950 via-brown-950/40 to-transparent" />
            <div className="relative mx-auto w-full max-w-7xl px-6 pb-16 sm:px-12">
              <p className="font-display text-6xl font-bold text-gold/25">{act.n}</p>
              <h3 className="font-display mt-2 text-4xl tracking-tighter text-cream sm:text-5xl">
                {act.title}
              </h3>
              <p className="mt-4 max-w-lg text-lg font-light text-cream/80">{act.text}</p>
            </div>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section ref={ref} className="relative bg-brown-950" style={{ height: "350vh" }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        {ACTS.map((act, i) => (
          <Act key={act.n} act={act} index={i} progress={scrollYProgress} ready={ready} />
        ))}

        {/* Gold progress rail */}
        <div className="absolute top-1/2 right-6 hidden h-40 w-px -translate-y-1/2 bg-cream/15 sm:block lg:right-12">
          <motion.div
            style={{ scaleY: railScale }}
            className="h-full w-full origin-top bg-gold"
          />
        </div>
      </div>
    </section>
  );
}
