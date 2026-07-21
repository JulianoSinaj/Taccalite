import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Bell, ChevronDown, Flame } from "lucide-react";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import MedallionBadge from "@/components/MedallionBadge";
import { getSetting, getPorchettaKgForDate } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "La Porchetta",
  description:
    "La porchetta artigianale Taccalite: la ricetta di famiglia, cotta lentamente ogni sabato ad Ancona.",
};

// English weekday keys (as stored in the `porchetta.day` setting) → JS getDay().
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** yyyy-mm-dd for a local Date, without the UTC shift of toISOString(). */
function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Trim trailing ".0" from half-kg quantities for display (e.g. 12.0 → "12"). */
function formatKg(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

const steps = [
  {
    title: "La selezione",
    text: "Scegliamo solo carne di suino di alta qualità, lavorata a mano dai nostri norcini.",
    image: "/images/negozio-carni-prosciutto.jpg",
    alt: "La selezione della carne",
  },
  {
    title: "L'aromatizzazione",
    text: "Rosmarino, aglio, finocchietto selvatico e le spezie della ricetta di famiglia, custodita da tre generazioni.",
    image:
      "https://images.unsplash.com/photo-1486887396153-fa416526c108?auto=format&fit=crop&q=80&w=800",
    alt: "La lavorazione artigianale a mano",
  },
  {
    title: "La cottura lenta",
    text: "Cotta lentamente in forno, fino a raggiungere la pelle croccante e la carne morbidissima all'interno.",
    image:
      "https://images.unsplash.com/photo-1615937657715-bc7b4b7962c1?auto=format&fit=crop&q=80&w=800",
    alt: "La cottura lenta in forno",
  },
];

const gallery = [
  {
    src: "/images/home-hero-gastronomia.jpg",
    alt: "Il banco gastronomia",
  },
  {
    src: "/images/negozio-carni-prosciutto.jpg",
    alt: "Il banco carni e salumi",
  },
  {
    src: "/images/negozio-centro-formaggi.jpg",
    alt: "Il banco formaggi",
  },
  {
    src: "/images/shop-shelves-prodotti.jpg",
    alt: "Gli scaffali della bottega",
  },
];

export default async function PorchettaPage() {
  // Live availability for the next porchetta pickup day (configurable; Saturday
  // by default). All reads are best-effort — the page still renders if unset.
  const [dayKey, capacityKg] = await Promise.all([
    getSetting<string>("porchetta.day", "saturday"),
    getSetting<number>("porchetta.weeklyCapacityKg", 0),
  ]);

  const now = new Date();
  const target = WEEKDAY_INDEX[String(dayKey).toLowerCase()] ?? 6; // fall back to Saturday
  const ahead = (target - now.getDay() + 7) % 7; // 0 = today is the pickup day
  const pickup = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead);
  const pickupIso = toIsoDate(pickup);

  const reservedKg = await getPorchettaKgForDate(pickupIso);
  const capacity = Number(capacityKg) || 0;
  const remainingKg = Math.max(0, capacity - reservedKg);
  const isFull = capacity > 0 && remainingKg <= 0;

  // "Sabato 26 luglio" — day name derives from the actual date, so it stays
  // correct even if the pickup day setting changes.
  const rawLabel = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(pickup);
  const pickupLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

  return (
    <div>
      {/* Hero */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brown-950">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&q=90&w=2000"
            alt="La porchetta artigianale Taccalite"
            fill
            preload
            className="object-cover opacity-60"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-brown-950 via-transparent to-brown-950/80" />
        </div>
        <Reveal className="relative z-20 max-w-4xl px-6 text-center">
          <span className="eyebrow mb-6 block">Specialità della casa</span>
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-8xl">
            La porchetta:
            <br />
            <span className="text-gold italic">la ricetta di famiglia</span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-xl font-light text-cream/70 lg:text-2xl">
            L&apos;eccellenza dell&apos;arte norcina marchigiana, tramandata dal 1946.
          </p>
        </Reveal>
        <div className="absolute right-6 bottom-8 z-30 hidden h-36 w-36 sm:block lg:right-10 lg:h-44 lg:w-44">
          <MedallionBadge className="h-full w-full" icon={<Flame className="size-1/2" />} />
        </div>
        <div className="absolute bottom-10 left-1/2 z-30 flex -translate-x-1/2 animate-bounce flex-col items-center gap-4 text-white/40">
          <span className="text-[9px] font-bold tracking-[0.4em] uppercase">Scroll</span>
          <div className="h-12 w-px bg-gradient-to-b from-white/40 to-transparent" />
        </div>
      </section>

      {/* Disponibilità — live availability strip */}
      <section className="bg-brown-900 px-5 py-10 sm:px-8 sm:py-14">
        <Reveal className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 rounded-[28px] border border-gold/25 bg-brown-950/50 px-6 py-7 backdrop-blur-sm sm:flex-row sm:px-10 sm:py-8">
          <div className="text-center sm:text-left">
            <span className="eyebrow mb-3 block">Prossima sfornata</span>
            <p className="font-display text-2xl leading-tight text-cream sm:text-3xl">
              {pickupLabel}
              {capacity > 0 &&
                (isFull ? (
                  <span className="text-gold italic"> · Al completo — lista d&apos;attesa</span>
                ) : (
                  <span className="text-cream/70">
                    {" "}
                    · <span className="font-bold text-gold">{formatKg(remainingKg)} kg</span> su{" "}
                    {formatKg(capacity)} disponibili
                  </span>
                ))}
            </p>
          </div>
          <Link
            href="/prenotazioni?tipo=porchetta"
            data-magnetic
            className="inline-flex shrink-0 items-center gap-3 rounded-full bg-gold px-8 py-3.5 text-sm font-semibold text-brown-950 shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-all duration-500 hover:-translate-y-1 hover:bg-gold-dark"
          >
            <Flame className="size-4" />
            Prenota la porchetta
          </Link>
        </Reveal>
      </section>

      {/* Eredità */}
      <section className="relative overflow-hidden bg-brown-900 px-5 py-32 sm:px-8 sm:py-48">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 lg:grid-cols-2 lg:gap-24">
          <Reveal className="space-y-10">
            <h2 className="font-display text-5xl leading-[0.95] tracking-tighter text-white sm:text-6xl lg:text-8xl">
              L&apos;eredità di una ricetta segreta
            </h2>
            <p className="text-xl leading-relaxed font-light text-cream/70">
              Tramandata di padre in figlio per tre generazioni, questa ricetta è il cuore della
              Norcineria Taccalite. Non è solo carne: è storia, passione e il profumo delle colline
              marchigiane raccolto in ogni boccone.
            </p>
            <div className="grid grid-cols-2 gap-8 py-6">
              <div className="space-y-2">
                <p className="font-display text-4xl font-bold text-gold italic">Cottura lenta</p>
                <p className="text-[10px] font-bold tracking-widest text-cream/65 uppercase">
                  Nel forno, per ore
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-display text-4xl font-bold text-gold italic">100% locale</p>
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
            <div className="cinematic-shadow relative z-10 h-[480px] w-full overflow-hidden rounded-[32px] sm:h-[600px] lg:w-[480px]">
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
      <section id="processo" className="bg-cream px-5 py-32 sm:px-8 sm:py-48">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mb-20 text-center sm:mb-32">
            <span className="eyebrow eyebrow-dark mb-6 block">Dalla terra alla tavola</span>
            <h2 className="font-display text-5xl tracking-tighter text-brown-950 sm:text-6xl md:text-7xl">
              Come nasce la nostra porchetta
            </h2>
          </Reveal>
          <RevealStagger className="grid grid-cols-1 gap-12 md:grid-cols-3">
            {steps.map((step, i) => (
              <RevealStaggerItem key={step.title} className="group">
                <div className="cinematic-shadow relative mb-10 aspect-[4/5] overflow-hidden rounded-[32px]">
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
                <h3 className="font-display mb-4 text-3xl text-brown-950">{step.title}</h3>
                <p className="leading-relaxed text-brown-900/75">{step.text}</p>
              </RevealStaggerItem>
            ))}
          </RevealStagger>
        </div>
      </section>

      {/* Il sapore perfetto */}
      <section className="relative overflow-hidden bg-brown-950 px-5 py-32 sm:px-8 sm:py-48">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="cinematic-shadow group relative h-[480px] overflow-hidden rounded-[40px] sm:h-[600px]">
              <Image
                src="https://images.unsplash.com/photo-1541529086526-db283c563270?auto=format&fit=crop&q=90&w=2000"
                alt="Il tagliere di specialità Taccalite"
                fill
                className="object-cover opacity-80 transition-transform duration-[3s] group-hover:scale-105"
                sizes="100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-brown-950/80 via-transparent to-transparent" />
              <div className="absolute bottom-10 left-6 max-w-xl sm:bottom-20 sm:left-16">
                <h2 className="font-display mb-6 text-4xl leading-tight tracking-tighter text-white sm:mb-8 sm:text-5xl lg:text-7xl">
                  Il sapore perfetto
                </h2>
                <p className="text-lg leading-relaxed font-light text-cream/70 sm:text-xl">
                  La croccantezza della pelle che si rompe sotto i denti, la morbidezza della carne,
                  il profumo delle erbe. Ogni morso racconta tre generazioni di maestria.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Quando assaporarla */}
      <section className="bg-cream-dark px-5 py-32 sm:px-8 sm:py-48">
        <div className="mx-auto max-w-5xl text-center">
          <Reveal className="mb-20">
            <span className="eyebrow eyebrow-dark mb-6 block">Esperienza in negozio</span>
            <h2 className="font-display text-5xl tracking-tighter text-brown-950 sm:text-6xl lg:text-7xl">
              Quando assaporarla
            </h2>
          </Reveal>
          <RevealStagger className="grid grid-cols-1 gap-12 text-left md:grid-cols-2">
            <RevealStaggerItem className="card-shadow-soft rounded-[28px] border border-brown-900/10 bg-white/50 p-10 sm:p-12">
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-gold/10">
                <Flame className="size-7 text-gold-dark" />
              </div>
              <h3 className="font-display mb-4 text-3xl text-brown-950">Ogni sabato mattina</h3>
              <p className="text-lg leading-relaxed text-brown-900/75">
                Disponibile calda appena sfornata presso le nostre botteghe ad Ancona.
              </p>
            </RevealStaggerItem>
            <RevealStaggerItem className="card-shadow-soft rounded-[28px] border border-brown-900/10 bg-white/50 p-10 sm:p-12">
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-gold/10">
                <Bell className="size-7 text-gold-dark" />
              </div>
              <h3 className="font-display mb-4 text-3xl text-brown-950">Su prenotazione</h3>
              <p className="text-lg leading-relaxed text-brown-900/75">
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
      <section className="bg-brown-900 px-5 py-32 sm:px-8 sm:py-48">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mb-16 space-y-6 sm:mb-24">
            <span className="eyebrow block">Galleria fotografica</span>
            <h2 className="font-display text-5xl tracking-tighter text-white sm:text-6xl">
              Scatti d&apos;autore
            </h2>
          </Reveal>
          <RevealStagger className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-10">
            {gallery.map((photo) => (
              <RevealStaggerItem
                key={photo.src}
                className="group cinematic-shadow relative aspect-square overflow-hidden rounded-[28px]"
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
      <section className="relative overflow-hidden bg-brown-950 py-40 sm:py-64">
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <Reveal className="relative z-10 mx-auto max-w-4xl px-8 text-center">
          <h2 className="font-display mb-12 text-4xl tracking-tighter text-white sm:text-5xl lg:text-7xl">
            Pronto a scoprire il nostro capolavoro?
          </h2>
          <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
            <Link
              href="/prenotazioni"
              data-magnetic
              className="inline-flex w-full items-center justify-center rounded-full bg-gold px-8 py-3.5 text-sm font-semibold text-brown-950 shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-all duration-500 hover:-translate-y-1 hover:bg-gold-dark sm:w-auto"
            >
              Prenota ora
            </Link>
            <Link
              href="/negozi"
              data-magnetic
              className="inline-flex w-full items-center justify-center rounded-full border border-white/20 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-500 hover:border-white/40 hover:bg-white/5 sm:w-auto"
            >
              Visita le botteghe
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
