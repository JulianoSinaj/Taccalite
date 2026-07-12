import type { Metadata } from "next";
import { Clock, Flame, MapPin, Phone } from "lucide-react";
import ReservationForm from "@/components/ReservationForm";
import Reveal from "@/components/Reveal";
import { shops } from "@/lib/data";

export const metadata: Metadata = {
  title: "Prenota un Tavolo — Norcineria Taccalite",
  description:
    "Prenota un tavolo per una degustazione o riserva la tua porchetta del sabato nei negozi Taccalite ad Ancona.",
};

export default function PrenotazioniPage() {
  return (
    <div>
      {/* Hero band */}
      <section className="relative overflow-hidden bg-[#1c1512] px-5 pt-44 pb-24 sm:px-10 sm:pt-56 sm:pb-32">
        <div className="bg-noise absolute inset-0 opacity-10" />
        <div className="parallax-orb absolute -top-52 -right-52 h-[48rem] w-[48rem] opacity-10" />
        <Reveal className="relative mx-auto max-w-7xl">
          <span className="eyebrow mb-8 block">Ospitalità · su prenotazione</span>
          <h1 className="font-display max-w-4xl text-5xl leading-[0.95] tracking-tighter text-cream sm:text-7xl md:text-8xl">
            Il tuo posto
            <br />
            <span className="text-gold italic">a tavola</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed font-light text-cream/75">
            Un tavolo per la degustazione o la tua porzione di porchetta del sabato: compila il
            modulo e ti richiamiamo noi per confermare data e disponibilità.
          </p>
        </Reveal>
      </section>

      {/* Form + info */}
      <section className="bg-cream px-5 py-24 sm:px-10 sm:py-32">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Info column */}
          <div className="space-y-6 lg:col-span-5">
            <Reveal className="cinematic-shadow relative overflow-hidden rounded-[28px] bg-brown-950 p-8 sm:p-10">
              <div className="bg-noise absolute inset-0 opacity-15" />
              <div className="relative space-y-5">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/15 text-gold">
                  <Flame className="size-6" />
                </span>
                <h2 className="font-display text-3xl text-cream">La porchetta del sabato</h2>
                <p className="leading-relaxed font-light text-cream/75">
                  Esce calda dal forno ogni sabato mattina in Piazza Kennedy, in quantità
                  limitate. Prenotala entro il venerdì per essere sicuro di trovarla.
                </p>
                <p className="text-[10px] font-bold tracking-[0.25em] text-gold uppercase">
                  Sfornata il sabato · prenota entro venerdì
                </p>
              </div>
            </Reveal>

            {shops.map((shop, i) => (
              <Reveal
                key={shop.slug}
                delay={0.1 + i * 0.08}
                className="card-shadow-soft space-y-4 rounded-[28px] border border-brown-900/10 bg-white/60 p-8"
              >
                <span className="eyebrow eyebrow-dark block">{shop.specialty}</span>
                <h3 className="font-display text-2xl text-brown-950">{shop.name}</h3>
                <div className="space-y-2.5 text-sm font-semibold text-brown-800/85">
                  <p className="flex items-center gap-3">
                    <MapPin className="size-4 shrink-0 text-gold-deep" />
                    {shop.address}
                  </p>
                  <p className="flex items-center gap-3">
                    <Clock className="size-4 shrink-0 text-gold-deep" />
                    {shop.hours[0].label}: {shop.hours[0].value}
                  </p>
                  <a
                    href={`tel:${shop.phone.replace(/\s/g, "")}`}
                    className="underline-draw flex w-fit items-center gap-3 text-brown-950"
                  >
                    <Phone className="size-4 shrink-0 text-gold-deep" />
                    {shop.phone}
                  </a>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Form column */}
          <Reveal delay={0.15} className="lg:col-span-7">
            <ReservationForm />
          </Reveal>
        </div>
      </section>
    </div>
  );
}
