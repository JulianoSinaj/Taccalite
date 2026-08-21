import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Bell, ChevronDown, Flame } from "lucide-react";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import MedallionBadge from "@/components/MedallionBadge";
import PageHero from "@/components/site/PageHero";
import CTA from "@/components/site/CTA";
import { porchettaAvailability } from "@/lib/reservations";
import { siteRecords } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "La Porchetta",
  description:
    "La porchetta artigianale Taccalite: la ricetta di famiglia, cotta lentamente ogni sabato ad Ancona.",
};

/** Trim trailing ".0" from half-kg quantities for display (e.g. 12.0 → "12"). */
function formatKg(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

export default async function PorchettaPage() {
  // Live availability for the next porchetta pickup day (configurable; Saturday
  // by default), resolved **per shop** — each location roasts its own batch
  // against its own cap, so a single shared figure was wrong for both. All reads
  // are best-effort: the page still renders if nothing is configured.
  const [availability, steps, gallery] = await Promise.all([
    porchettaAvailability(),
    // Editable in the gestionale (`porchetta.steps`, `porchetta.gallery`); the
    // defaults are the text and the images this page already showed.
    siteRecords("porchetta.steps"),
    siteRecords("porchetta.gallery"),
  ]);
  const { pickupLabel, shops: shopAvailability, hasCapacity, allFull } = availability;
  // With one roasting shop the strip reads as it always did; with more, each gets
  // its own figure rather than being averaged into a number true of neither.
  const capped = shopAvailability.filter((s) => s.capacityKg > 0);

  return (
    <div>
      {/* Hero.
          Was a full-bleed stock photograph of somebody else's roast under a
          near-black wash — the only remaining dark opening on the site, and the
          one page where a stock image would be claiming to be the product. On
          paper, with the seal, it says the same thing without borrowing. */}
      <PageHero
        eyebrow="Specialità della casa"
        title={[
          "La porchetta:",
          <span key="2" className="wonk text-gold-deep">
            la ricetta di famiglia
          </span>,
        ]}
        lede="L'eccellenza dell'arte norcina marchigiana, tramandata dal 1946. Cottura lenta, erbe delle Marche, e il sabato mattina fuori dal forno."
        aside={
          <div className="relative mx-auto hidden max-w-sm lg:block">
            <div className="relative aspect-square">
              <MedallionBadge className="h-full w-full" icon={<Flame className="size-1/2" />} />
            </div>
          </div>
        }
      />

      {/* Disponibilità — live availability strip. Real numbers from the day's
          bookings, so it earns the gold border it sits behind. */}
      <section className="px-5 pb-16 sm:px-8 lg:px-12">
        <Reveal className="mx-auto flex max-w-[88rem] flex-col items-center justify-between gap-6 border border-gold/50 bg-paper-warm px-6 py-7 sm:flex-row sm:px-8 lg:px-12 sm:py-8">
          <div className="text-center sm:text-left">
            <p className="mb-3 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
              Prossima sfornata
            </p>
            <p className="font-display text-2xl leading-tight font-semibold text-brown-950 sm:text-3xl">
              {pickupLabel}
              {hasCapacity && allFull && (
                <span className="wonk text-gold-deep"> · Al completo — lista d&apos;attesa</span>
              )}
              {hasCapacity && !allFull && capped.length === 1 && (
                <span className="text-brown-700">
                  {" "}
                  ·{" "}
                  <span className="font-bold text-gold-deep tabular-nums">
                    {formatKg(capped[0].remainingKg)} kg
                  </span>{" "}
                  su {formatKg(capped[0].capacityKg)} disponibili
                </span>
              )}
            </p>
            {hasCapacity && !allFull && capped.length > 1 && (
              <ul className="mt-3 space-y-1 text-sm text-brown-700">
                {capped.map((s) => (
                  <li key={s.slug}>
                    <span className="font-semibold text-brown-950">{s.name}</span>
                    {" · "}
                    {s.isFull ? (
                      <span className="text-gold-deep">al completo</span>
                    ) : (
                      <>
                        <span className="font-bold text-gold-deep tabular-nums">
                          {formatKg(s.remainingKg)} kg
                        </span>{" "}
                        su {formatKg(s.capacityKg)} disponibili
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link
            href="/prenotazioni?tipo=porchetta"
            className="group/av relative inline-flex shrink-0 items-center gap-3 overflow-hidden rounded-full bg-gold px-8 py-3.5 text-sm font-semibold text-on-gold focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <span
              aria-hidden
              className="absolute inset-0 bg-brown-950 [clip-path:circle(0%_at_50%_120%)] transition-[clip-path] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/av:[clip-path:circle(150%_at_50%_120%)]"
            />
            <span className="relative z-10 inline-flex items-center gap-3 transition-colors duration-500 group-hover/av:text-cream">
              <Flame className="size-4" />
              Prenota la porchetta
            </span>
          </Link>
        </Reveal>
      </section>

      {/* Eredità */}
      <section className="relative overflow-hidden bg-brown-900 px-5 py-16 sm:px-8 sm:py-48">
        <div className="mx-auto grid max-w-[88rem] grid-cols-1 items-center gap-16 lg:grid-cols-2 lg:gap-24">
          <Reveal className="space-y-10">
            <h2 className="font-display text-5xl leading-[0.95] tracking-[-0.028em] text-cream sm:text-6xl lg:text-8xl">
              L&apos;eredità di una ricetta segreta
            </h2>
            <p className="text-xl leading-relaxed text-cream/70">
              Tramandata di padre in figlio per tre generazioni, questa ricetta è il cuore della
              Norcineria Taccalite. Non è solo carne: è storia, passione e il profumo delle colline
              marchigiane raccolto in ogni boccone.
            </p>
            <div className="grid grid-cols-2 gap-8 py-6">
              <div className="space-y-2">
                <p className="font-display text-4xl font-bold wonk text-gold">Cottura lenta</p>
                <p className="text-[10px] font-bold tracking-widest text-cream/65 uppercase">
                  Nel forno, per ore
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-display text-4xl font-bold wonk text-gold">100% locale</p>
                <p className="text-[10px] font-bold tracking-widest text-cream/65 uppercase">
                  Erbe marchigiane
                </p>
              </div>
            </div>
            <a
              href="#processo"
              data-magnetic
              className="inline-flex items-center gap-3 rounded-full bg-gold px-8 py-3.5 text-sm font-semibold text-brown-950 shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-all duration-500 hover:-translate-y-1 hover:bg-gold-dark"
            >
              Scopri il processo
              <ChevronDown className="size-4" />
            </a>
          </Reveal>
          <Reveal delay={0.15} className="relative flex justify-center">
            <div className="cinematic-shadow relative z-10 h-[480px] w-full overflow-hidden sm:h-[600px] lg:w-[480px]">
              <Image
                src="https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&q=80&w=800"
                alt="Gli ingredienti della ricetta"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 480px"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Processo */}
      <section id="processo" className="bg-cream px-5 py-16 sm:px-8 sm:py-48">
        <div className="mx-auto max-w-[88rem]">
          <Reveal className="mb-20 text-center sm:mb-32">
            <span className="eyebrow eyebrow-dark mb-6 block">Dalla terra alla tavola</span>
            <h2 className="font-display display-xl font-semibold text-brown-950">
              Come nasce la nostra porchetta
            </h2>
          </Reveal>
          <RevealStagger className="grid grid-cols-1 gap-12 md:grid-cols-3">
            {steps.map((step, i) => (
              <RevealStaggerItem key={step.title} className="group">
                <div className="cinematic-shadow relative mb-10 aspect-[4/5] overflow-hidden">
                  <Image
                    src={step.image}
                    alt={step.alt}
                    fill
                    className="object-cover transition-transform duration-[1.5s] group-hover:scale-110"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div className="font-display absolute top-6 left-6 flex h-12 w-12 items-center justify-center rounded-full bg-gold text-2xl font-bold text-brown-950 shadow-lg">
                    {i + 1}
                  </div>
                </div>
                <h3 className="font-display mb-4 text-[1.5rem] leading-tight font-semibold tracking-[-0.02em] text-brown-950">{step.title}</h3>
                <p className="leading-relaxed text-brown-700">{step.text}</p>
              </RevealStaggerItem>
            ))}
          </RevealStagger>
        </div>
      </section>

      {/* Il sapore perfetto */}
      <section className="relative overflow-hidden bg-brown-950 px-5 py-16 sm:px-8 sm:py-48">
        <div className="mx-auto max-w-[88rem]">
          <Reveal>
            <div className="cinematic-shadow group relative h-[480px] overflow-hidden sm:h-[600px]">
              <Image
                src="https://images.unsplash.com/photo-1541529086526-db283c563270?auto=format&fit=crop&q=90&w=2000"
                alt="Il tagliere di specialità Taccalite"
                fill
                className="object-cover opacity-80 transition-transform duration-[3s] group-hover:scale-105"
                sizes="100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-brown-950/80 via-transparent to-transparent" />
              <div className="absolute bottom-10 left-6 max-w-xl sm:bottom-20 sm:left-16">
                <h2 className="font-display mb-6 text-4xl leading-tight tracking-[-0.028em] text-cream sm:mb-8 sm:text-5xl lg:text-7xl">
                  Il sapore perfetto
                </h2>
                <p className="text-lg leading-relaxed text-cream/70 sm:text-xl">
                  La croccantezza della pelle che si rompe sotto i denti, la morbidezza della carne,
                  il profumo delle erbe. Ogni morso racconta tre generazioni di maestria.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Quando assaporarla */}
      <section className="bg-paper-warm px-5 py-16 sm:px-8 sm:py-48">
        <div className="mx-auto max-w-5xl text-center">
          <Reveal className="mb-20">
            <span className="eyebrow eyebrow-dark mb-6 block">Esperienza in negozio</span>
            <h2 className="font-display display-xl font-semibold text-brown-950">
              Quando assaporarla
            </h2>
          </Reveal>
          <RevealStagger className="grid grid-cols-1 gap-12 text-left md:grid-cols-2">
            <RevealStaggerItem className="card-shadow-soft border border-rule bg-paper p-10 sm:p-12">
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-gold/10">
                <Flame className="size-7 text-gold-dark" />
              </div>
              <h3 className="font-display mb-4 text-[1.5rem] leading-tight font-semibold tracking-[-0.02em] text-brown-950">Ogni sabato mattina</h3>
              <p className="text-lg leading-relaxed text-brown-700">
                Disponibile calda appena sfornata presso le nostre botteghe ad Ancona.
              </p>
            </RevealStaggerItem>
            <RevealStaggerItem className="card-shadow-soft border border-rule bg-paper p-10 sm:p-12">
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-gold/10">
                <Bell className="size-7 text-gold-dark" />
              </div>
              <h3 className="font-display mb-4 text-[1.5rem] leading-tight font-semibold tracking-[-0.02em] text-brown-950">Su prenotazione</h3>
              <p className="text-lg leading-relaxed text-brown-700">
                Per essere sicuro di trovarla, prenota la tua porchetta in negozio o per telefono
                entro il venerdì.
              </p>
            </RevealStaggerItem>
          </RevealStagger>
          <Reveal className="mt-20">
            <Link
              href="/prenotazioni"
              data-magnetic
              className="inline-flex items-center rounded-full bg-gold px-10 py-4 text-base font-semibold text-brown-950 shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-all duration-500 hover:-translate-y-1 hover:bg-gold-dark"
            >
              Riserva la tua porzione
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Galleria */}
      <section className="bg-paper px-5 py-16 sm:px-8 sm:py-48">
        <div className="mx-auto max-w-[88rem]">
          <Reveal className="mb-16 space-y-6 sm:mb-24">
            <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
              <span aria-hidden className="h-px w-10 bg-gold" />
              Galleria fotografica
            </p>
            <h2 className="font-display display-lg font-semibold text-brown-950">
              Scatti d&apos;autore
            </h2>
          </Reveal>
          <RevealStagger className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-10">
            {gallery.map((photo) => (
              <RevealStaggerItem
                key={photo.src}
                className="group cinematic-shadow relative aspect-square overflow-hidden"
              >
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  className="object-cover transition-transform duration-1000 group-hover:scale-110"
                  sizes="(max-width: 768px) 50vw, 25vw"
                />
              </RevealStaggerItem>
            ))}
          </RevealStagger>
        </div>
      </section>

      {/* CTA finale */}
      <section className="bg-paper-warm py-16 sm:py-40">
        <Reveal className="mx-auto max-w-4xl px-8 text-center">
          <h2 className="font-display display-lg mb-12 font-semibold text-brown-950">
            Pronto ad <span className="wonk text-gold-deep">assaggiarla?</span>
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <CTA href="/prenotazioni" tone="gold">
              Prenota ora
            </CTA>
            <CTA href="/sedi" tone="outline">
              Visita le botteghe
            </CTA>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
