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
      {/* Hero: big text left, reservation form right */}
      <section className="relative overflow-hidden bg-[#1c1512] px-5 pt-44 pb-24 sm:px-10 sm:pt-56 sm:pb-32">
        <div className="bg-noise absolute inset-0 opacity-10" />
        <div className="parallax-orb absolute -top-52 -right-52 h-[48rem] w-[48rem] opacity-10" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-start gap-16 lg:grid-cols-12 lg:gap-20">
          <Reveal className="lg:sticky lg:top-40 lg:col-span-5">
            <span className="eyebrow mb-8 block">Ospitalità · su prenotazione</span>
            <h1 className="font-display text-5xl leading-[0.95] tracking-tighter text-cream sm:text-7xl xl:text-8xl">
              Il tuo posto
              <br />
              <span className="text-gold italic">a tavola</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed font-light text-cream/75">
              Un tavolo per la degustazione o la tua porzione di porchetta del sabato: compila il
              modulo e ti richiamiamo noi per confermare data e disponibilità.
            </p>
            <div className="mt-12 space-y-5 border-t border-cream/10 pt-10">
              <div className="flex items-center gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/30 text-gold">
                  <Phone className="size-4" />
                </span>
                <p className="text-sm font-light text-cream/70">
                  Preferisci parlare con noi? Chiama uno dei negozi qui sotto.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/30 text-gold">
                  <Flame className="size-4" />
                </span>
                <p className="text-sm font-light text-cream/70">
                  La porchetta del sabato si prenota entro il venerdì.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.15} className="lg:col-span-7">
            <ReservationForm />
          </Reveal>
        </div>
      </section>

      {/* Info cards row */}
      <section className="bg-cream px-5 py-24 sm:px-10 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mb-14 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="eyebrow eyebrow-dark mb-4 block">Dove trovarci</span>
              <h2 className="font-display max-w-md text-4xl leading-tight tracking-tight text-brown-950 sm:text-5xl">
                Due negozi, <span className="text-gold-deep italic">una tradizione</span>
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed font-light text-brown-900/70">
              Passa a trovarci ad Ancona: al Centro per i formaggi, al Mercato del Piano per carni
              e salumi.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Porchetta card */}
            <Reveal className="group cinematic-shadow relative overflow-hidden rounded-[28px] bg-brown-950 p-8 transition-transform duration-500 will-change-transform hover:-translate-y-2 sm:p-9">
              <div className="bg-noise absolute inset-0 opacity-15" />
              <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-gold/10 blur-2xl transition-opacity duration-700 group-hover:opacity-100" />
              <div className="relative flex h-full flex-col">
                <div className="mb-8 flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/15 text-gold transition-transform duration-500 group-hover:scale-110">
                    <Flame className="size-6" />
                  </span>
                  <span className="rounded-full border border-gold/30 px-3 py-1 text-[9px] font-bold tracking-[0.2em] text-gold uppercase">
                    Ogni sabato
                  </span>
                </div>
                <h3 className="font-display text-3xl leading-tight text-cream">
                  La porchetta
                  <br />
                  del sabato
                </h3>
                <p className="mt-4 flex-1 leading-relaxed font-light text-cream/70">
                  Esce calda dal forno ogni sabato mattina in Piazza Kennedy, in quantità limitate.
                  Prenotala entro il venerdì per essere sicuro di trovarla.
                </p>
                <p className="mt-8 border-t border-cream/10 pt-6 text-[10px] font-bold tracking-[0.25em] text-gold uppercase">
                  Sfornata il sabato · prenota entro venerdì
                </p>
              </div>
            </Reveal>

            {/* Shop cards */}
            {shops.map((shop, i) => (
              <Reveal
                key={shop.slug}
                delay={0.1 + i * 0.08}
                className="group card-shadow-soft relative flex flex-col overflow-hidden rounded-[28px] border border-brown-900/10 bg-white/70 p-8 transition-all duration-500 will-change-transform hover:-translate-y-2 hover:border-gold/40 sm:p-9"
              >
                <div className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-gold to-gold-dark transition-transform duration-500 group-hover:scale-x-100" />
                <div className="mb-8 flex items-center justify-between">
                  <span className="font-display text-4xl text-brown-900/15 transition-colors duration-500 group-hover:text-gold/50">
                    0{i + 1}
                  </span>
                  <span className="eyebrow eyebrow-dark">{shop.specialty}</span>
                </div>
                <h3 className="font-display text-3xl leading-tight text-brown-950">{shop.name}</h3>
                <div className="mt-6 flex-1 space-y-4 text-sm font-semibold text-brown-800/85">
                  <p className="flex items-start gap-3">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-gold-deep" />
                    {shop.address}
                  </p>
                  <p className="flex items-start gap-3">
                    <Clock className="mt-0.5 size-4 shrink-0 text-gold-deep" />
                    <span>
                      {shop.hours[0].label}: {shop.hours[0].value}
                    </span>
                  </p>
                </div>
                <a
                  href={`tel:${shop.phone.replace(/\s/g, "")}`}
                  className="mt-8 flex items-center justify-between rounded-full border border-brown-900/15 px-6 py-3.5 text-sm font-semibold text-brown-950 transition-colors duration-300 hover:border-brown-950 hover:bg-brown-950 hover:text-cream"
                >
                  <span className="flex items-center gap-3">
                    <Phone className="size-4 shrink-0 text-gold-deep" />
                    {shop.phone}
                  </span>
                  <span className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-60">
                    Chiama
                  </span>
                </a>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
