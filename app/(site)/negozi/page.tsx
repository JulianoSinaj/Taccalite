import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Bus,
  Car,
  Check,
  Clock,
  Flame,
  Footprints,
  MapPin,
  Phone,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import PillButton from "@/components/PillButton";
import JsonLd from "@/components/JsonLd";
import ShopLocator, { OpenPill, type LocatorShop } from "@/components/ShopLocator";
import { getShops } from "@/lib/db/queries";
import { isOpenNow, todayRowIndex } from "@/lib/hours";
import { shopSchema, breadcrumbSchema, faqSchema } from "@/lib/seo";
import type { ShopRow } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Le Botteghe — Dove trovarci ad Ancona",
  description:
    "Indirizzi, orari, mappa e indicazioni delle due botteghe Taccalite ad Ancona: i grandi formaggi in Piazza Kennedy, carni e salumi al Mercato Coperto del Piano.",
};

/* ────────────────────────────────────────────────────────────────────────────
 * "Come arrivare" — practical directions per shop. Not in the DB (it's
 * one-off local knowledge), so it lives here like `shopContent` on the shop
 * page. Keyed by slug; unknown slugs fall back to a generic block.
 * TODO(owner): verify the parking / bus details below on the ground.
 * ────────────────────────────────────────────────────────────────────────── */
type Directions = { walk: string; car: string; transit: string; note?: string };

const directionsBySlug: Record<string, Directions> = {
  centro: {
    walk: "In fondo a Corso Stamira, a due passi dal porto e da Piazza della Repubblica: dal centro storico si arriva comodamente a piedi.",
    car: "Parcheggio Traiano (Via XXIX Settembre) a pochi minuti a piedi; strisce blu nelle vie intorno alla piazza.",
    transit:
      "Fermate dei bus urbani Conerobus in zona porto / Piazza Kennedy; dalla stazione centrale circa dieci minuti di autobus.",
  },
  carni: {
    walk: "Dentro il Mercato Coperto del Piano, in Piazza d'Armi: il mercato storico del quartiere Piano San Lazzaro.",
    car: "Parcheggi a raso nell'area di Piazza d'Armi e strisce blu nelle vie del quartiere.",
    transit:
      "A pochi minuti a piedi dal nodo dei bus di Piazza Ugo Bassi; diverse linee urbane fermano lungo Corso Carlo Alberto.",
    note: "Gli orari seguono quelli del mercato coperto: se hai dubbi, chiamaci prima di passare.",
  },
};

const genericDirections: Directions = {
  walk: "Nel cuore di Ancona, raggiungibile a piedi dal centro.",
  car: "Parcheggi pubblici nelle vicinanze.",
  transit: "Servita dalle linee urbane Conerobus.",
};

/**
 * Free-text query for the Google Maps embed / directions links. Business name +
 * the stored street address resolves to the shop's own Google listing. Keep
 * `shops.address` a plain street address ("Piazza d'Armi, 59 — Ancona"): a
 * venue name in that field (e.g. "Mercato Coperto del Piano — Ancona") makes
 * Google fuzzy-match the wrong neighbourhood with no pin.
 */
function mapsQueryFor(shop: ShopRow) {
  return `Norcineria Taccalite, ${shop.address}`;
}
function telHref(phone: string) {
  return `tel:${phone.replace(/\s/g, "")}`;
}
function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

export default async function NegoziPage() {
  const shops = await getShops();
  const now = new Date();

  const locatorShops: LocatorShop[] = shops.map((s) => {
    const idx = todayRowIndex(s.hours, now);
    return {
      slug: s.slug,
      name: s.name,
      specialty: s.specialty,
      address: s.address,
      phone: s.phone,
      image: s.image,
      today: idx >= 0 ? s.hours[idx] : null,
      hoursConfirmed: s.hoursConfirmed,
      open: s.hoursConfirmed ? isOpenNow(s.hours, now) : null,
      mapsQuery: mapsQueryFor(s),
    };
  });
  const bySlug = new Map(locatorShops.map((s) => [s.slug, s]));

  const porchettaShops = shops.filter((s) => s.porchettaEnabled);
  const tableShops = shops.filter((s) => s.reservationsEnabled);
  const pickupShops = shops.filter((s) => s.storeEnabled);

  // FAQ answers are phrased from live shop data so they never drift from the DB.
  const faqs: { question: string; answer: string }[] = [
    {
      question: "Quale bottega scelgo?",
      answer:
        shops.length > 1
          ? `Dipende da cosa cerchi: ${shops
              .map((s) => `${s.specialty.toLowerCase()} da ${s.name} (${s.address})`)
              .join("; ")}. Stessa famiglia, stessa cura in entrambe.`
          : `Ti aspettiamo da ${shops[0]?.name ?? "Taccalite"} (${shops[0]?.address ?? "Ancona"}).`,
    },
    {
      question: "Dove trovo la porchetta del sabato?",
      answer:
        porchettaShops.length > 0
          ? `Ogni sabato mattina, calda appena sfornata, da ${joinNames(porchettaShops.map((s) => s.name))}. Per essere sicuro di trovarla prenotala entro il venerdì: dal modulo prenotazioni o per telefono.`
          : "La porchetta del sabato è al momento sospesa: seguici sulle news per la ripresa.",
    },
    {
      question: "Si può mangiare in bottega?",
      answer:
        tableShops.length > 0
          ? `Sì: taglieri di salumi e formaggi e degustazioni al banco, su prenotazione, da ${joinNames(tableShops.map((s) => s.name))}. Prenota online e ti richiamiamo per confermare.`
          : "Al momento non offriamo degustazioni al banco; puoi ordinare online o passare a trovarci.",
    },
    {
      question: "Fate spedizioni o devo venire in negozio?",
      answer:
        pickupShops.length > 0
          ? `Entrambe le cose: dall'e-shop scegli la spedizione a casa oppure il ritiro gratuito in bottega da ${joinNames(pickupShops.map((s) => s.name))}.`
          : "Dall'e-shop puoi ordinare con spedizione a casa.",
    },
    {
      question: "Avete un programma fedeltà?",
      answer:
        "Sì, il Club Taccalite: punti a ogni acquisto e premi dal banco. Ti iscrivi in un minuto dalla tua area personale.",
    },
  ];

  return (
    <div>
      <JsonLd
        schema={[
          ...shops.map(shopSchema),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Le Botteghe", path: "/negozi" },
          ]),
          faqSchema(faqs),
        ]}
      />

      {/* ── Hero: headline + live "adesso" card ─────────────────────────── */}
      <section className="relative overflow-hidden bg-[#1c1512] px-5 pt-44 pb-24 sm:px-10 sm:pt-56 sm:pb-32">
        <div className="bg-noise absolute inset-0 opacity-10" />
        <div className="parallax-orb absolute -top-52 -right-52 h-[48rem] w-[48rem] opacity-10" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 lg:grid-cols-12 lg:gap-20">
          <Reveal className="lg:col-span-7">
            <span className="eyebrow mb-8 block">Dove trovarci · Ancona</span>
            <h1 className="font-display max-w-4xl text-5xl leading-[0.95] tracking-tighter text-cream sm:text-7xl md:text-8xl">
              Due botteghe,
              <br />
              <span className="text-gold italic">un&apos;anima sola</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed font-light text-cream/75">
              Il banco dei grandi formaggi in Piazza Kennedy e quello delle carni al Mercato
              Coperto del Piano. Qui trovi orari, mappa e indicazioni: scegli la bottega più
              vicina e vieni ad assaggiare.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <PillButton href="#mappa" tone="gold">
                Apri la mappa
              </PillButton>
              <PillButton href="#orari" tone="ghost">
                Vedi gli orari
              </PillButton>
            </div>
          </Reveal>

          {/* Live status card */}
          <Reveal delay={0.15} className="lg:col-span-5">
            <div className="cinematic-shadow relative overflow-hidden rounded-[32px] border border-white/8 bg-brown-900/60 backdrop-blur">
              <div className="relative aspect-[16/9]">
                <Image
                  src="/images/coppa-finocchio-bottega.jpg"
                  alt="Coppa artigianale con finocchio, aglio e semi di finocchio sul banco della bottega"
                  fill
                  preload
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 40vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-brown-950 via-brown-950/30 to-transparent" />
                <span className="eyebrow absolute bottom-5 left-6">Adesso, in bottega</span>
              </div>
              <ul className="divide-y divide-white/8">
                {locatorShops.map((shop) => (
                  <li key={shop.slug} className="flex items-center gap-4 px-6 py-5">
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-xl leading-tight text-cream">{shop.name}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs font-medium text-cream/60">
                        <Clock className="size-3.5 shrink-0 text-gold" />
                        {shop.today ? shop.today.value : "Chiamaci per gli orari"}
                      </p>
                    </div>
                    {shop.open ? (
                      <OpenPill
                        state={shop.open}
                        className={
                          shop.open.open
                            ? "bg-green-500/15 text-green-300"
                            : "bg-white/8 text-cream/60"
                        }
                      />
                    ) : (
                      <a
                        href={telHref(shop.phone)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1 text-[10px] font-bold tracking-widest text-cream/70 uppercase hover:text-cream"
                      >
                        <Phone className="size-3" />
                        Chiama
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Map + locator ──────────────────────────────────────────────── */}
      <section id="mappa" className="scroll-mt-24 bg-cream px-5 py-24 sm:px-10 sm:py-32">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mb-14 max-w-3xl">
            <span className="eyebrow eyebrow-dark mb-6 block">La mappa</span>
            <h2 className="font-display text-4xl leading-[0.95] tracking-tighter text-brown-950 sm:text-5xl md:text-6xl">
              Scegli la bottega,
              <span className="text-gold-deep italic"> ti portiamo lì.</span>
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed font-light text-brown-900/70">
              Tocca una bottega per vederla sulla mappa e avviare le indicazioni dal punto in cui
              ti trovi.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <ShopLocator shops={locatorShops} />
          </Reveal>
        </div>
      </section>

      {/* ── Weekly hours, side by side ─────────────────────────────────── */}
      <section id="orari" className="scroll-mt-24 bg-cream-dark px-5 py-24 sm:px-10 sm:py-32">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mb-14 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <span className="eyebrow eyebrow-dark mb-6 block">Orari di apertura</span>
              <h2 className="font-display text-4xl leading-[0.95] tracking-tighter text-brown-950 sm:text-5xl md:text-6xl">
                Quando siamo
                <span className="text-gold-deep italic"> al banco</span>
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-brown-900/65">
              Nei giorni festivi gli orari possono variare: se vieni da lontano, chiamaci prima di
              metterti in viaggio.
            </p>
          </Reveal>

          <RevealStagger className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {shops.map((shop) => {
              const todayIdx = todayRowIndex(shop.hours, now);
              const state = bySlug.get(shop.slug)?.open ?? null;
              return (
                <RevealStaggerItem
                  key={shop.slug}
                  className="rounded-[28px] border border-brown-900/10 bg-white/60 p-7 sm:p-9"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="eyebrow eyebrow-dark mb-3 block">{shop.specialty}</span>
                      <h3 className="font-display text-3xl leading-tight tracking-tight text-brown-950">
                        {shop.name}
                      </h3>
                    </div>
                    <OpenPill state={state} className="mt-1" />
                  </div>

                  <dl className="mt-8 divide-y divide-brown-900/10 border-y border-brown-900/10">
                    {shop.hours.length === 0 && (
                      <div className="py-4 text-sm text-brown-900/65">
                        Orari in aggiornamento — chiamaci per conferma.
                      </div>
                    )}
                    {shop.hours.map((row, i) => {
                      const isToday = i === todayIdx;
                      return (
                        <div
                          key={`${row.label}-${i}`}
                          className={`flex items-baseline justify-between gap-6 py-4 ${
                            isToday ? "-mx-4 rounded-2xl bg-gold/15 px-4" : ""
                          }`}
                        >
                          <dt className="flex items-center gap-3 text-sm font-semibold text-brown-950">
                            {row.label}
                            {isToday && (
                              <span className="rounded-full bg-brown-950 px-2 py-0.5 text-[9px] font-bold tracking-widest text-cream uppercase">
                                Oggi
                              </span>
                            )}
                          </dt>
                          <dd className="text-right text-sm text-brown-900/75">{row.value}</dd>
                        </div>
                      );
                    })}
                  </dl>

                  {!shop.hoursConfirmed && (
                    <p className="mt-4 text-xs text-brown-900/55">Orari da confermare in negozio.</p>
                  )}

                  <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-semibold text-brown-800/85">
                    <a href={telHref(shop.phone)} className="inline-flex items-center gap-2 hover:text-brown-950">
                      <Phone className="size-4 text-gold-deep" />
                      {shop.phone}
                    </a>
                    <span className="inline-flex items-center gap-2">
                      <MapPin className="size-4 text-gold-deep" />
                      {shop.address}
                    </span>
                  </div>
                </RevealStaggerItem>
              );
            })}
          </RevealStagger>
        </div>
      </section>

      {/* ── Which shop for what ────────────────────────────────────────── */}
      <section
        id="cosa-trovi"
        className="relative scroll-mt-24 overflow-hidden bg-brown-950 px-5 py-24 sm:px-10 sm:py-32"
      >
        <div className="bg-noise absolute inset-0 opacity-10" />
        <div className="relative mx-auto max-w-7xl">
          <Reveal className="mb-14 max-w-3xl">
            <span className="eyebrow mb-6 block">Quale bottega per cosa</span>
            <h2 className="font-display text-4xl leading-[0.95] tracking-tighter text-cream sm:text-5xl md:text-6xl">
              Stessa famiglia,
              <span className="text-gold italic"> due banchi diversi</span>
            </h2>
          </Reveal>

          <RevealStagger className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {shops.map((shop) => (
              <RevealStaggerItem
                key={shop.slug}
                className="group relative overflow-hidden rounded-[28px] border border-white/8 bg-brown-900/40 p-7 sm:p-9"
              >
                <Link
                  href={`/negozi/${shop.slug}`}
                  className="relative mb-7 block aspect-[16/9] overflow-hidden rounded-2xl"
                >
                  <Image
                    src={shop.image}
                    alt={shop.name}
                    fill
                    className="object-cover transition-transform duration-[1.8s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brown-950/60 via-transparent to-transparent" />
                  <span className="absolute top-4 left-4 rounded-full bg-cream/90 px-3 py-1 text-[10px] font-bold tracking-widest text-brown-950 uppercase backdrop-blur">
                    {shop.specialty}
                  </span>
                </Link>
                <h3 className="font-display text-3xl leading-tight tracking-tight text-cream">
                  {shop.name}
                </h3>
                <p className="mt-2 text-sm font-light text-cream/65">{shop.tagline}</p>

                {shop.highlights.length > 0 && (
                  <ul className="mt-6 space-y-2.5">
                    {shop.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-3 text-sm leading-relaxed text-cream/80">
                        <Check className="mt-0.5 size-4 shrink-0 text-gold" />
                        {h}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-7 flex flex-wrap gap-2">
                  {shop.porchettaEnabled && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 px-3 py-1 text-[10px] font-bold tracking-widest text-gold uppercase">
                      <Flame className="size-3" />
                      Porchetta del sabato
                    </span>
                  )}
                  {shop.storeEnabled && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-[10px] font-bold tracking-widest text-cream/80 uppercase">
                      <ShoppingBag className="size-3" />
                      Ritiro e-shop
                    </span>
                  )}
                  {shop.reservationsEnabled && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-[10px] font-bold tracking-widest text-cream/80 uppercase">
                      <UtensilsCrossed className="size-3" />
                      Tavolo e degustazioni
                    </span>
                  )}
                </div>

                <Link
                  href={`/negozi/${shop.slug}`}
                  className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-gold transition-all group-hover:gap-4"
                >
                  Esplora la bottega
                  <ArrowRight className="size-4" />
                </Link>
              </RevealStaggerItem>
            ))}
          </RevealStagger>
        </div>
      </section>

      {/* ── How to get there ───────────────────────────────────────────── */}
      <section id="come-arrivare" className="scroll-mt-24 bg-cream px-5 py-24 sm:px-10 sm:py-32">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mb-14 max-w-3xl">
            <span className="eyebrow eyebrow-dark mb-6 block">Come arrivare</span>
            <h2 className="font-display text-4xl leading-[0.95] tracking-tighter text-brown-950 sm:text-5xl md:text-6xl">
              A piedi, in auto
              <span className="text-gold-deep italic"> o in autobus</span>
            </h2>
          </Reveal>

          <div className="space-y-6">
            {shops.map((shop) => {
              const d = directionsBySlug[shop.slug] ?? genericDirections;
              const query = mapsQueryFor(shop);
              return (
                <Reveal
                  key={shop.slug}
                  className="rounded-[28px] border border-brown-900/10 bg-white/50 p-7 sm:p-9"
                >
                  <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
                    <div className="lg:w-[30%]">
                      <span className="eyebrow eyebrow-dark mb-3 block">{shop.specialty}</span>
                      <h3 className="font-display text-3xl leading-tight tracking-tight text-brown-950">
                        {shop.name}
                      </h3>
                      <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-brown-800/80">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-gold-deep" />
                        {shop.address}
                      </p>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-magnetic
                        className="mt-6 inline-flex items-center gap-3 rounded-full bg-brown-950 px-6 py-3 text-sm font-semibold text-cream transition-all duration-500 hover:-translate-y-0.5 hover:bg-brown-900"
                      >
                        Avvia le indicazioni
                        <ArrowRight className="size-4" />
                      </a>
                    </div>
                    <dl className="grid flex-1 grid-cols-1 gap-6 sm:grid-cols-3">
                      {[
                        { icon: Footprints, label: "A piedi", text: d.walk },
                        { icon: Car, label: "In auto", text: d.car },
                        { icon: Bus, label: "Mezzi pubblici", text: d.transit },
                      ].map(({ icon: Icon, label, text }) => (
                        <div key={label} className="space-y-3">
                          <dt className="flex items-center gap-2 text-[11px] font-bold tracking-widest text-brown-950 uppercase">
                            <Icon className="size-4 text-gold-deep" />
                            {label}
                          </dt>
                          <dd className="text-sm leading-relaxed text-brown-900/70">{text}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  {d.note && (
                    <p className="mt-6 border-t border-brown-900/10 pt-5 text-xs text-brown-900/55">
                      {d.note}
                    </p>
                  )}
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section id="faq" className="scroll-mt-24 bg-cream-dark px-5 py-24 sm:px-10 sm:py-32">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-20">
          <Reveal className="lg:col-span-4">
            <span className="eyebrow eyebrow-dark mb-6 block">Domande frequenti</span>
            <h2 className="font-display text-4xl leading-[0.95] tracking-tighter text-brown-950 sm:text-5xl">
              Prima di
              <span className="text-gold-deep italic"> passare</span>
            </h2>
            <p className="mt-6 text-sm leading-relaxed text-brown-900/65">
              Non trovi la risposta? Chiamaci: al banco rispondiamo volentieri.
            </p>
          </Reveal>
          <Reveal delay={0.1} className="lg:col-span-8">
            <div className="divide-y divide-brown-900/10 border-y border-brown-900/10">
              {faqs.map((f) => (
                <details key={f.question} className="group py-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-left [&::-webkit-details-marker]:hidden">
                    <span className="font-display text-xl leading-snug tracking-tight text-brown-950 sm:text-2xl">
                      {f.question}
                    </span>
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brown-950/15 text-brown-950 transition-colors duration-500 group-open:bg-brown-950 group-open:text-cream">
                      <span className="absolute h-[1.5px] w-3.5 bg-current" />
                      <span className="absolute h-3.5 w-[1.5px] bg-current transition-transform duration-500 group-open:rotate-90" />
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-6 text-base leading-relaxed font-light text-brown-900/75">
                    {f.answer}
                  </p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Reservations funnel ────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#1c1512] px-5 py-24 sm:px-10 sm:py-32">
        <div className="bg-noise absolute inset-0 opacity-10" />
        <div className="parallax-orb absolute -bottom-52 -left-40 h-[44rem] w-[44rem] opacity-10" />
        <Reveal className="relative mx-auto flex max-w-7xl flex-col items-center gap-10 text-center">
          <span className="eyebrow block">Ospitalità Taccalite</span>
          <h2 className="font-display max-w-3xl text-4xl leading-[0.95] tracking-tighter text-cream sm:text-6xl">
            Siediti al banco:
            <span className="text-gold italic"> ti apparecchiamo noi.</span>
          </h2>
          <p className="max-w-xl text-lg leading-relaxed font-light text-cream/75">
            Taglieri di salumi e formaggi, porchetta calda e i consigli di chi la prepara da tre
            generazioni. Prenota il tuo tavolo: ti richiamiamo noi per confermare.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <PillButton href="/prenotazioni" tone="gold">
              Prenota un tavolo
            </PillButton>
            <PillButton href="/porchetta" tone="ghost">
              Scopri la porchetta
            </PillButton>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
