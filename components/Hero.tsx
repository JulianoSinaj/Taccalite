"use client";

import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import Photo from "./Photo";
import Hero3D from "./Hero3D";

type HeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  imageLabel: string;
  image?: string;
  primaryCta?: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
  showMedallion?: boolean;
  backLink?: { href: string; label: string };
};

export default function Hero({
  eyebrow,
  title,
  description,
  imageLabel,
  image,
  primaryCta,
  secondaryCta,
  showMedallion = false,
  backLink,
}: HeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, 60]);
  const imageScale = useTransform(scrollYProgress, [0, 1], reduceMotion ? [1, 1] : [1, 1.08]);

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-brown-950">
      <div className="bg-noise absolute inset-0 opacity-20" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:items-center lg:py-28">
        <div>
          {backLink && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Link href={backLink.href} className="text-sm font-medium text-cream/60 hover:text-cream">
                {backLink.label}
              </Link>
            </motion.div>
          )}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className={`text-xs font-semibold tracking-[0.2em] text-gold uppercase ${backLink ? "mt-4" : ""}`}
          >
            {eyebrow}
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-shadow-sm mt-3 text-4xl font-semibold text-cream sm:text-5xl lg:text-6xl"
          >
            {title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="mt-5 max-w-lg text-lg leading-relaxed text-cream/70"
          >
            {description}
          </motion.p>
          {(primaryCta || secondaryCta) && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="mt-8 flex flex-wrap gap-4"
            >
              {primaryCta && (
                <Link
                  href={primaryCta.href}
                  data-magnetic
                  className="rounded-full bg-gold px-6 py-3 text-sm font-semibold text-brown-950 transition-colors hover:bg-cream"
                >
                  {primaryCta.label}
                </Link>
              )}
              {secondaryCta && (
                <Link
                  href={secondaryCta.href}
                  data-magnetic
                  className="rounded-full border border-cream/30 px-6 py-3 text-sm font-semibold text-cream transition-colors hover:border-cream hover:bg-cream/10"
                >
                  {secondaryCta.label}
                </Link>
              )}
            </motion.div>
          )}
        </div>

        <motion.div
          style={{ y: imageY, scale: imageScale }}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.15 }}
          className="relative"
        >
          <Photo src={image} alt={title} label={imageLabel} ratio="wide" className="border-cream/10" priority />
          {showMedallion && (
            <div className="pointer-events-none absolute -bottom-10 -right-6 hidden h-36 w-36 drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:block lg:h-44 lg:w-44">
              <Hero3D />
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
