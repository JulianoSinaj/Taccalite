"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { ArrowRight, Award, Flame, MapPin } from "lucide-react";
import SaturdayCountdown from "./SaturdayCountdown";
import PillButton from "./PillButton";
import { shops, blogPosts } from "@/lib/data";
import { cn } from "@/lib/utils";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Spring reveal: each tile rises into place as it enters the viewport. */
function Tile({
  children,
  className,
  index = 0,
}: {
  children: ReactNode;
  className?: string;
  index?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 36, scale: 0.985 }}
      whileInView={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        type: "spring",
        stiffness: 110,
        damping: 20,
        mass: 0.9,
        delay: index * 0.07,
      }}
      className={cn("will-change-transform", className)}
    >
      {children}
    </motion.div>
  );
}

/**
 * "Il mondo Taccalite" bento. Mobile is deliberately dense — slim horizontal
 * rows and a 2-up pair — while md+ expands into the full 6-column bento.
 */
export default function WorldBento() {
  const latestPost = blogPosts[0];

  return (
    <section className="bg-cream-dark px-5 py-16 sm:px-12 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display mb-10 max-w-3xl text-4xl leading-[0.95] tracking-tighter text-brown-950 sm:mb-16 sm:text-6xl md:text-7xl">
          Il mondo Taccalite,
          <span className="text-gold-deep italic"> in un colpo d&apos;occhio</span>
        </h2>

        <div className="grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-6">
          {/* Countdown — the hero tile */}
          <Tile index={0} className="col-span-2 md:col-span-4 md:row-span-2">
            <div className="relative h-full overflow-hidden rounded-3xl bg-[#1c1512] sm:rounded-[28px]">
              <Image
                src="https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&q=80&w=1400"
                alt="La porchetta del sabato"
                fill
                className="object-cover opacity-25"
                sizes="(max-width: 768px) 100vw, 66vw"
              />
              <div className="bg-noise absolute inset-0 opacity-15" />
              <div className="relative flex h-full flex-col justify-between gap-6 p-6 sm:gap-10 sm:p-12">
                <div className="space-y-3 sm:space-y-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 text-gold sm:h-12 sm:w-12">
                    <Flame className="size-4 sm:size-6" />
                  </span>
                  <h3 className="font-display max-w-md text-2xl leading-tight text-cream sm:text-4xl">
                    La prossima porchetta esce dal forno tra
                  </h3>
                </div>
                <SaturdayCountdown />
                <div className="flex flex-wrap items-center gap-4 sm:gap-5">
                  <PillButton
                    href="/prenotazioni"
                    tone="gold"
                    className="px-5 py-2.5 text-xs sm:px-8 sm:py-3.5 sm:text-sm"
                  >
                    Riserva la tua porzione
                  </PillButton>
                  <p className="text-[9px] font-bold tracking-[0.25em] text-cream/65 uppercase sm:text-[10px]">
                    Sabato · Piazza Kennedy · fino a esaurimento
                  </p>
                </div>
              </div>
            </div>
          </Tile>

          {/* Le botteghe — slim horizontal row on mobile */}
          <Tile index={1} className="col-span-2 md:col-span-2">
            <Link
              href="/negozi"
              className="group relative flex h-full flex-col justify-between gap-5 overflow-hidden rounded-3xl border border-brown-900/10 bg-white/60 p-5 transition-all duration-500 hover:border-brown-900/25 sm:rounded-[28px] sm:gap-8 sm:p-8"
            >
              <div className="space-y-3 sm:space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl text-brown-950 sm:text-2xl">
                    Le due botteghe
                  </h3>
                  <ArrowRight className="size-4 text-gold-deep transition-transform group-hover:translate-x-1 md:hidden" />
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-1 md:gap-0 md:space-y-4">
                  {shops.map((shop) => (
                    <div
                      key={shop.slug}
                      className="border-t border-brown-900/10 pt-3 md:pt-4"
                    >
                      <p className="text-xs font-bold text-brown-950 sm:text-sm">{shop.name}</p>
                      <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug font-semibold text-brown-800/80 sm:items-center sm:gap-2 sm:text-xs">
                        <MapPin className="mt-0.5 size-3 shrink-0 text-gold-deep sm:mt-0 sm:size-3.5" />
                        {shop.address}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <span className="hidden items-center gap-2 text-sm font-bold text-gold-deep transition-all group-hover:gap-4 md:inline-flex">
                Trova la più vicina
                <ArrowRight className="size-4" />
              </span>
            </Link>
          </Tile>

          {/* Club — half-width square on mobile */}
          <Tile index={2} className="md:col-span-2">
            <Link
              href="/account"
              className="group relative flex h-full flex-col justify-between gap-5 overflow-hidden rounded-3xl bg-brown-950 p-5 sm:rounded-[28px] sm:gap-8 sm:p-8"
            >
              <div className="bg-noise absolute inset-0 opacity-15" />
              <div className="relative space-y-2 sm:space-y-3">
                <Award className="size-5 text-gold sm:size-7" />
                <h3 className="font-display text-lg leading-tight text-cream sm:text-2xl">
                  Club Taccalite
                </h3>
                <p className="hidden text-sm leading-relaxed font-light text-cream/75 sm:block">
                  Punti a ogni acquisto, premi dal banco: taglieri, Verdicchio e porchetta.
                </p>
                <p className="text-[11px] leading-snug font-light text-cream/75 sm:hidden">
                  Punti a ogni acquisto, premi dal banco.
                </p>
              </div>
              <span className="relative inline-flex items-center gap-2 text-xs font-bold text-gold transition-all group-hover:gap-4 sm:text-sm">
                Entra nel club
                <ArrowRight className="size-3.5 sm:size-4" />
              </span>
            </Link>
          </Tile>

          {/* 1946 — half-width square on mobile */}
          <Tile index={3} className="md:col-span-2">
            <div className="flex h-full flex-col justify-between gap-5 rounded-3xl bg-gold p-5 sm:rounded-[28px] sm:gap-8 sm:p-8">
              <p className="font-display text-4xl font-bold tracking-tighter text-brown-950 sm:text-7xl">
                1946
              </p>
              <p className="text-[11px] leading-snug font-semibold text-brown-950/85 sm:text-sm sm:leading-relaxed">
                Tre generazioni, una sola ricetta. La bottega di famiglia nel cuore di Ancona.
              </p>
            </div>
          </Tile>

          {/* Ultima news — horizontal thumbnail card on mobile */}
          {latestPost && (
            <Tile index={4} className="col-span-2 md:col-span-4">
              <Link
                href={`/blog/${latestPost.slug}`}
                className="group relative flex h-full items-stretch overflow-hidden rounded-3xl border border-brown-900/10 bg-white/60 sm:rounded-[28px] md:min-h-[220px] md:border-0 md:bg-transparent"
              >
                {/* Mobile: compact thumbnail row */}
                <div className="relative w-28 shrink-0 overflow-hidden md:hidden">
                  {latestPost.image && (
                    <Image
                      src={latestPost.image}
                      alt={latestPost.title}
                      fill
                      className="object-cover transition-transform duration-[1.8s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                      sizes="112px"
                    />
                  )}
                </div>
                <div className="flex flex-col justify-center gap-1.5 p-4 md:hidden">
                  <p className="text-[9px] font-bold tracking-[0.25em] text-gold-deep uppercase">
                    Dal diario · {formatDate(latestPost.date)}
                  </p>
                  <h3 className="font-display text-base leading-snug text-brown-950">
                    {latestPost.title}
                  </h3>
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-gold-deep transition-all group-hover:gap-3">
                    Leggi la storia
                    <ArrowRight className="size-3.5" />
                  </span>
                </div>

                {/* md+: original full-bleed image tile */}
                <div className="relative hidden h-full w-full flex-col justify-end md:flex">
                  {latestPost.image && (
                    <Image
                      src={latestPost.image}
                      alt={latestPost.title}
                      fill
                      className="object-cover transition-transform duration-[1.8s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                      sizes="66vw"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-brown-950/90 via-brown-950/35 to-transparent" />
                  <div className="relative space-y-2 p-8">
                    <p className="text-[10px] font-bold tracking-[0.25em] text-gold uppercase">
                      Dal diario · {formatDate(latestPost.date)}
                    </p>
                    <h3 className="font-display max-w-xl text-2xl leading-tight text-cream sm:text-3xl">
                      {latestPost.title}
                    </h3>
                    <span className="inline-flex items-center gap-2 pt-1 text-sm font-bold text-cream transition-all group-hover:gap-4">
                      Leggi la storia
                      <ArrowRight className="size-4" />
                    </span>
                  </div>
                </div>
              </Link>
            </Tile>
          )}
        </div>
      </div>
    </section>
  );
}
