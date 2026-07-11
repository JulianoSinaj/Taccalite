import type { Metadata } from "next";
import Image from "next/image";
import ReservationForm from "@/components/ReservationForm";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Prenota un Tavolo — Norcineria Taccalite",
  description: "Prenota un tavolo o la tua porchetta in uno dei negozi Taccalite ad Ancona.",
};

export default function PrenotazioniPage() {
  return (
    <div className="pt-32 sm:pt-40">
      <section className="mx-auto flex max-w-7xl flex-col items-center px-5 py-12 sm:px-8 sm:py-20">
        <Reveal className="mb-12 w-full max-w-[800px]">
          <div className="cinematic-shadow relative h-[220px] overflow-hidden rounded-[32px] sm:h-[300px]">
            <Image
              src="https://images.unsplash.com/photo-1541529086526-db283c563270?auto=format&fit=crop&q=80&w=1200"
              alt="Un tagliere di specialità Taccalite"
              fill
              preload
              className="object-cover"
              sizes="(max-width: 800px) 100vw, 800px"
            />
          </div>
        </Reveal>
        <Reveal delay={0.15} className="max-w-2xl space-y-6 text-center">
          <h1 className="font-display text-5xl tracking-tighter text-brown-950 sm:text-6xl">
            Prenota un tavolo
          </h1>
          <p className="text-lg leading-relaxed text-brown-900/60">
            Compila il modulo per prenotare un tavolo o richiedere la tua porchetta. Ti
            ricontatteremo per confermare la disponibilità.
          </p>
        </Reveal>
      </section>

      <section className="bg-cream px-5 pt-8 pb-32 sm:px-8 sm:pb-48">
        <Reveal delay={0.2} className="mx-auto max-w-[700px]">
          <ReservationForm />
        </Reveal>
      </section>
    </div>
  );
}
