import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Bus,
  Car,
  Check,
  Clock,
  Footprints,
  MapPin,
  Phone,
  ShoppingBag,
  Flame,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import PageHero from "@/components/site/PageHero";
import CTA from "@/components/site/CTA";
import PillButton from "@/components/PillButton";
import JsonLd from "@/components/JsonLd";
import ShopLocator, { OpenPill, type LocatorShop } from "@/components/ShopLocator";
import WeekBars from "@/components/site/sedi/WeekBars";
import {
  CompassRose,
  CornerTicks,
  GhostNumeral,
  LeaderRow,
  SectionMark,
} from "@/components/site/sedi/Ornaments";
import { directionsFor } from "@/lib/directions";
import { getShops } from "@/lib/db/queries";
import { clockNow, isOpenNow, shopWeekGrid, todayRowIndex, type WeekDayRanges } from "@/lib/hours";
import { shopSchema, breadcrumbSchema, faqSchema } from "@/lib/seo";
import type { ShopRow } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sedi — Dove trovarci ad Ancona",
  description:
    "Indirizzi, orari, mappa e indicazioni delle due botteghe Taccalite ad Ancona: i grandi formaggi in Piazza Kennedy, carni e salumi al Mercato Coperto del Piano.",
};

/**
 * What each bottega actually does, as a comparison rather than as prose.
 *
 * Every row reads a real per-shop switch, so the matrix cannot drift from what
 * the gestionale allows — with the one deliberate exception of the shipping row,
 * which is a property of the e-shop and true of the house rather than of a
 * counter (hence the footnote under the table).
 */
const services: {
  label: string;
  note: string;
  icon: typeof ShoppingBag;
  has: (shop: ShopRow) => boolean;
}[] = [
  {
    label: "Ritiro in bottega",
    note: "Ordini dall'e-shop, ritiri al banco. Gratis.",
    icon: ShoppingBag,
    has: (s) => s.storeEnabled,
  },
  {
    label: "Porchetta del sabato",
    note: "Calda dal forno, su prenotazione entro il venerdì.",
    icon: Flame,
    has: (s) => s.porchettaEnabled,
  },
  {
    label: "Tavolo e degustazioni",
    note: "Taglieri di salumi e formaggi al banco, su prenotazione.",
    icon: UtensilsCrossed,
    has: (s) => s.reservationsEnabled,
  },
  {
    label: "Spedizione a casa",
    note: "In tutta Italia, dall'e-shop.",
    icon: Truck,
    has: () => true,
  },
];

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
/** "Taccalite Mercato del Piano" → "Mercato del Piano". Column heads are narrow. */
function shortName(name: string) {
  return name.replace(/^\s*(norcineria\s+)?taccalite\s+/i, "").trim() || name;
}
/** "Piazza d'Armi, 59 — Ancona" → "Piazza d'Armi". The pin, without the city. */
function placeOf(address: string) {
  return address.split(/[,—–-]/)[0].trim();
}
function ordinal(i: number) {
  return String(i + 1).padStart(2, "0");
}

export default async function NegoziPage() {
  const shops = await getShops();
  const now = new Date();
  const { day: todayIso, minutes: nowMinutes } = clockNow(now);

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
  // The week, resolved to numbers once, so the chart in the hours band and the
  // one in each shop card are drawn from the same reading of the data.
  const weekBySlug = new Map<string, WeekDayRanges[] | null>(
    shops.map((s) => [s.slug, shopWeekGrid(s)])
  );

  // Whether the matrix below actually distinguishes the two counters. The
  // headline is written from the answer rather than asserted: today both
  // botteghe carry every service, and "servizi diversi" over a table of four
  // identical rows is the page contradicting itself.
  const servicesDiffer = services.some((service) =>
    shops.some((s) => service.has(s) !== service.has(shops[0]))
  );

  const porchettaShops = shops.filter((s) => s.porchettaEnabled);
  const tableShops = shops.filter((s) => s.reservationsEnabled);
  const pickupShops = shops.filter((s) => s.storeEnabled);

  // The travelling ribbon under the hero: where the botteghe stand, the city,
  // the year — the shop's own words, nothing invented. The *places* rather than
  // the shop names, because the market bottega is named after the place it
  // stands in and the ribbon would have said it twice.
  const ribbon = [
    ...new Set(shops.map((s) => placeOf(s.address) || shortName(s.name))),
    "Ancona",
    "Dal 1946",
  ];

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
            { name: "Sedi", path: "/sedi" },
          ]),
          faqSchema(faqs),
        ]}
      />

      {/* ── Hero: headline + the register of the two botteghe ────────────── */}
      <PageHero
        eyebrow="Dove trovarci · Ancona"
        title={[
          "Due botteghe,",
          <span key="2" className="wonk text-gold-deep">
            un&apos;anima sola
          </span>,
        ]}
        lede="Il banco dei grandi formaggi in Piazza Kennedy e quello delle carni al Mercato Coperto del Piano. Qui trovi orari, mappa e indicazioni: scegli la bottega più vicina e vieni ad assaggiare."
        aside={
          /* The register: today's hours and an open/closed pill per shop,
             computed server-side so it is true at the moment of the request.
             Framed like a filled-in card — crop marks, a double rule, an index
             numeral per line — rather than as a floating list. */
          <Reveal delay={0.15}>
            <div className="relative border border-rule-strong bg-paper">
              <CornerTicks />
              <div className="relative m-1.5 border border-rule">
                <div className="relative aspect-[16/10]">
                  <Image
                    src="/images/coppa-finocchio-bottega.jpg"
                    alt="Coppa artigianale con finocchio, aglio e semi di finocchio sul banco della bottega"
                    fill
                    preload
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 40vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brown-950/90 via-brown-950/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5">
                    <span className="text-[0.625rem] font-semibold tracking-[0.24em] text-gold uppercase">
                      Adesso, in bottega
                    </span>
                    <span className="font-display text-[0.625rem] font-semibold tracking-[0.2em] text-cream/60 uppercase tabular-nums">
                      Reg. {ordinal(0)}–{ordinal(shops.length - 1)}
                    </span>
                  </div>
                </div>

                <ul className="divide-y divide-rule">
                  {locatorShops.map((shop, i) => (
                    <li key={shop.slug} className="flex items-center gap-4 px-5 py-5">
                      <span className="font-display text-2xl leading-none font-semibold text-brown-950/15 tabular-nums">
                        {ordinal(i)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-xl leading-tight font-semibold text-brown-950">
                          {shop.name}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-[0.8125rem] text-taupe">
                          <Clock className="size-3.5 shrink-0 text-gold-deep" />
                          {shop.today ? shop.today.value : "Chiamaci per gli orari"}
                        </p>
                      </div>
                      {shop.open ? (
                        <OpenPill
                          state={shop.open}
                          className={
                            shop.open.open
                              ? "bg-ok-soft text-ok-soft-fg"
                              : "bg-paper-warm text-taupe"
                          }
                        />
                      ) : (
                        <a
                          href={telHref(shop.phone)}
                          className="tap inline-flex items-center gap-1.5 rounded-full bg-paper-warm px-3 py-2 text-[0.625rem] font-semibold tracking-[0.16em] text-taupe uppercase transition-colors hover:text-brown-950"
                        >
                          <Phone className="size-3" />
                          Chiama
                        </a>
                      )}
                    </li>
                  ))}
                </ul>

                <p className="flex items-center gap-2.5 border-t border-rule bg-paper-warm px-5 py-3 text-[0.6875rem] leading-tight text-taupe">
                  <span aria-hidden className="size-1.5 rounded-full bg-ok" />
                  Stato aperto/chiuso calcolato adesso, dagli orari del gestionale.
                </p>
              </div>
            </div>
          </Reveal>
        }
      >
        <div className="mt-10 flex flex-wrap gap-3">
          <CTA href="#mappa" tone="primary">
            Apri la mappa
          </CTA>
          <CTA href="#orari" tone="outline">
            Vedi gli orari
          </CTA>
        </div>

        {/* The three facts the page is an answer to, struck as a rail. */}
        <dl className="mt-10 grid max-w-xl grid-cols-3 border-y border-rule">
          {[
            { k: shops.length === 1 ? "Una" : "Due", v: "botteghe" },
            { k: "Ancona", v: "Marche" },
            { k: "1946", v: "dal" },
          ].map((cell, i) => (
            <div
              key={cell.v}
              className={`py-5 ${i > 0 ? "border-l border-rule pl-5" : "pr-5"}`}
            >
              <dt className="font-display text-2xl leading-none font-semibold text-brown-950 sm:text-[1.75rem]">
                {cell.k}
              </dt>
              <dd className="mt-2 text-[0.625rem] font-semibold tracking-[0.2em] text-taupe uppercase">
                {cell.v}
              </dd>
            </div>
          ))}
        </dl>
      </PageHero>

      {/* ── Ribbon: the addresses, travelling ───────────────────────────── */}
      <section aria-hidden className="relative overflow-hidden bg-brown-950 py-5 sm:py-6">
        <div className="ember absolute inset-0 opacity-70" />
        <div className="bg-noise absolute inset-0 opacity-[0.07]" />
        <div
          className="relative overflow-hidden"
          style={{
            maskImage: "linear-gradient(to right, transparent, #000 7%, #000 93%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, #000 7%, #000 93%, transparent)",
          }}
        >
          <ul
            className="marquee-track flex w-max items-center gap-10 sm:gap-16"
            style={{ ["--marquee-duration" as string]: `${Math.max(30, ribbon.length * 6)}s` }}
          >
            {[...ribbon, ...ribbon].map((word, i) => (
              <li key={`${word}-${i}`} className="flex shrink-0 items-center gap-10 sm:gap-16">
                <span className="font-display text-[1.25rem] leading-none font-semibold tracking-[-0.01em] whitespace-nowrap text-cream/55 select-none sm:text-[1.75rem]">
                  {word}
                </span>
                <span aria-hidden className="size-1 shrink-0 rotate-45 bg-gold/70" />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Map + locator ──────────────────────────────────────────────── */}
      <section id="mappa" className="scroll-mt-24 bg-paper px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <Reveal className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <SectionMark n="01" className="mb-6">
                La mappa
              </SectionMark>
              {/* Each phrase is unbreakable; the heading itself is not. Held
                  together with `nowrap` on the whole h2, the line could not
                  break anywhere at all — at 390px that pushed 118px past the
                  viewport and gave the whole page a horizontal scroll. Keeping
                  the rule on the parts gets the same one-line headline wherever
                  there is room, and a clean break between the two phrases
                  wherever there is not. */}
              <h2 className="font-display display-lg font-semibold text-brown-950">
                <span className="whitespace-nowrap">Scegli la bottega,</span>{" "}
                <span className="wonk whitespace-nowrap text-gold-deep">ti portiamo lì.</span>
              </h2>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-brown-700">
                Tocca una bottega per vederla sulla mappa e avviare le indicazioni dal punto in
                cui ti trovi.
              </p>
            </div>
            <CompassRose className="hidden size-24 shrink-0 text-brown-950/35 md:block" />
          </Reveal>

          {/* The locator, mounted like a plate: crop marks at the trim, the
              coordinates printed along the foot. */}
          <Reveal delay={0.1} className="relative border border-rule bg-paper-warm p-3 sm:p-5">
            <CornerTicks />
            <ShopLocator shops={locatorShops} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-rule pt-3 text-[0.625rem] font-semibold tracking-[0.18em] text-taupe uppercase">
              <span>43°37&apos;N · 13°30&apos;E — Ancona, Marche</span>
              <span className="flex items-center gap-2">
                <MapPin className="size-3 text-gold-deep" />
                {shops.length} {shops.length === 1 ? "bottega" : "botteghe"} · un&apos;unica
                famiglia
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── What each counter does ─────────────────────────────────────── */}
      <section id="servizi" className="scroll-mt-24 bg-paper-warm px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <Reveal className="mb-12 max-w-3xl">
            <SectionMark n="02" className="mb-6">
              Cosa trovi, dove
            </SectionMark>
            {/* Same shape as above — and this one carries shop-dependent text,
                so it must be free to wrap on a narrow screen. */}
            <h2 className="font-display display-lg font-semibold text-brown-950">
              <span className="whitespace-nowrap">
                {shops.length > 1 ? "Due banchi," : "Il banco,"}
              </span>{" "}
              <span className="wonk whitespace-nowrap text-gold-deep">
                {servicesDiffer ? "servizi diversi" : "gli stessi servizi"}
              </span>
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-brown-700">
              {servicesDiffer
                ? "Prima di metterti in strada, il colpo d'occhio su cosa puoi fare in ciascuna bottega."
                : "Qualunque bottega tu scelga, puoi fare le stesse cose: ritirare, prenotare un tavolo, portarti a casa la porchetta del sabato."}
            </p>
          </Reveal>

          <Reveal delay={0.1} className="relative border border-rule bg-paper">
            <CornerTicks />
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Servizi disponibili in ciascuna bottega Taccalite
              </caption>
              <thead>
                <tr className="border-b border-rule-strong">
                  <th
                    scope="col"
                    className="px-5 py-5 text-[0.625rem] font-semibold tracking-[0.2em] text-taupe uppercase sm:px-8"
                  >
                    Servizio
                  </th>
                  {shops.map((shop) => (
                    <th
                      key={shop.slug}
                      scope="col"
                      className="w-[4.5rem] border-l border-rule px-2 py-5 text-center align-bottom sm:w-40 sm:px-4"
                    >
                      <span className="font-display block text-[0.9375rem] leading-tight font-semibold text-brown-950 sm:text-lg">
                        {shortName(shop.name)}
                      </span>
                      <span className="mt-1 hidden text-[0.625rem] font-semibold tracking-[0.16em] text-taupe uppercase sm:block">
                        {shop.specialty}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services.map(({ label, note, icon: Icon }, i) => (
                  <tr key={label} className={i > 0 ? "border-t border-rule" : ""}>
                    <th scope="row" className="px-5 py-5 font-normal sm:px-8">
                      <span className="flex items-start gap-3.5">
                        <Icon className="mt-0.5 size-4 shrink-0 text-gold-deep" aria-hidden />
                        <span>
                          <span className="block text-[0.9375rem] font-semibold text-brown-950">
                            {label}
                          </span>
                          <span className="mt-1 block text-[0.8125rem] leading-relaxed text-taupe">
                            {note}
                          </span>
                        </span>
                      </span>
                    </th>
                    {shops.map((shop) => {
                      const yes = services[i].has(shop);
                      return (
                        <td
                          key={shop.slug}
                          className="border-l border-rule px-2 py-5 text-center sm:px-4"
                        >
                          {yes ? (
                            <span className="mx-auto flex size-7 items-center justify-center rounded-full bg-gold/25 text-brown-950">
                              <Check className="size-3.5" aria-hidden />
                              <span className="sr-only">Disponibile</span>
                            </span>
                          ) : (
                            <span className="mx-auto block h-px w-4 bg-rule-strong">
                              <span className="sr-only">Non disponibile</span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-rule bg-paper-warm px-5 py-4 text-[0.75rem] leading-relaxed text-taupe sm:px-8">
              La spedizione parte dall&apos;e-shop ed è unica per tutta la casa; il ritiro,
              invece, lo scegli tu al momento dell&apos;ordine.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Weekly hours, drawn and listed ─────────────────────────────── */}
      <section id="orari" className="scroll-mt-24 bg-paper px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <Reveal className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <SectionMark n="03" className="mb-6">
                Orari di apertura
              </SectionMark>
              <h2 className="font-display display-lg font-semibold text-brown-950">
                Quando siamo
                <span className="wonk text-gold-deep"> al banco</span>
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-brown-700">
              La settimana in colpo d&apos;occhio: la barra piena è il banco aperto, la riga
              sottile è adesso. Nei giorni festivi gli orari possono variare — se vieni da
              lontano, chiamaci prima di metterti in viaggio.
            </p>
          </Reveal>

          <RevealStagger className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {shops.map((shop, i) => {
              const todayIdx = todayRowIndex(shop.hours, now);
              const state = bySlug.get(shop.slug)?.open ?? null;
              const week = weekBySlug.get(shop.slug) ?? null;
              return (
                <RevealStaggerItem
                  key={shop.slug}
                  className="relative border border-rule bg-paper-warm p-6 sm:p-9"
                >
                  <CornerTicks />

                  <div className="relative flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-4">
                      <GhostNumeral
                        n={ordinal(i)}
                        className="text-[2.5rem] text-brown-950/15 tabular-nums sm:text-[3rem]"
                      />
                      <div>
                        <span className="eyebrow eyebrow-dark mb-3 block">{shop.specialty}</span>
                        <h3 className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-brown-950">
                          {shop.name}
                        </h3>
                      </div>
                    </div>
                    <OpenPill state={state} className="mt-1" />
                  </div>

                  {week && (
                    <WeekBars
                      week={week}
                      today={todayIso}
                      nowMinutes={nowMinutes}
                      className="mt-8"
                    />
                  )}

                  <dl className="mt-8 divide-y divide-rule border-y border-rule">
                    {shop.hours.length === 0 && (
                      <div className="py-4 text-sm text-brown-700">
                        Orari in aggiornamento — chiamaci per conferma.
                      </div>
                    )}
                    {shop.hours.map((row, hi) => {
                      const isToday = hi === todayIdx;
                      return (
                        <div
                          key={`${row.label}-${hi}`}
                          className={`flex items-baseline justify-between gap-4 ${
                            isToday ? "-mx-4 bg-gold/15 px-4" : ""
                          }`}
                        >
                          <dt className="flex shrink-0 items-center gap-3 py-3.5 text-sm font-semibold text-brown-950">
                            {row.label}
                            {isToday && (
                              <span className="rounded-full bg-brown-950 px-2 py-0.5 text-[11px] font-bold tracking-widest text-cream uppercase sm:text-[10px]">
                                Oggi
                              </span>
                            )}
                          </dt>
                          <span
                            aria-hidden
                            className="mb-1.5 hidden min-w-4 flex-1 self-end border-b border-dotted border-rule-strong sm:block"
                          />
                          <dd className="py-3.5 text-right text-sm text-brown-700 tabular-nums">
                            {row.value}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>

                  {!shop.hoursConfirmed && (
                    <p className="mt-4 text-xs text-taupe">Orari da confermare in negozio.</p>
                  )}

                  <div className="mt-6 flex flex-col gap-3 text-sm font-semibold text-brown-700 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
                    <a
                      href={telHref(shop.phone)}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-brown-950 px-5 py-3.5 text-cream transition-colors hover:bg-brown-800 sm:justify-start sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0 sm:text-brown-700 sm:hover:bg-transparent sm:hover:text-brown-950"
                    >
                      <Phone className="size-4 text-gold sm:text-gold-deep" />
                      {shop.phone}
                    </a>
                    <span className="inline-flex items-start gap-2">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-gold-deep" />
                      {shop.address}
                    </span>
                  </div>

                  <Link
                    href={`/sedi/${shop.slug}`}
                    className="underline-draw tap mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brown-950"
                  >
                    Scopri questa bottega
                    <ArrowRight className="size-4" />
                  </Link>
                </RevealStaggerItem>
              );
            })}
          </RevealStagger>
        </div>
      </section>

      {/* ── How to get there ───────────────────────────────────────────── */}
      <section
        id="come-arrivare"
        className="scroll-mt-24 bg-paper-warm px-5 py-12 sm:px-8 sm:py-20 lg:px-12"
      >
        <div className="mx-auto max-w-[88rem]">
          <Reveal className="mb-12 max-w-3xl">
            <SectionMark n="04" className="mb-6">
              Come arrivare
            </SectionMark>
            <h2 className="font-display display-lg font-semibold text-brown-950">
              A piedi, in auto
              <span className="wonk text-gold-deep"> o in autobus</span>
            </h2>
          </Reveal>

          <div className="space-y-6">
            {shops.map((shop, i) => {
              const d = directionsFor(shop.slug);
              const query = mapsQueryFor(shop);
              return (
                <Reveal key={shop.slug} className="relative border border-rule bg-paper p-6 sm:p-10">
                  <CornerTicks />
                  <GhostNumeral
                    n={ordinal(i)}
                    className="absolute top-2 right-6 text-[5rem] text-brown-950/[0.05] tabular-nums sm:text-[7rem]"
                  />

                  <div className="relative flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-14">
                    <div className="lg:w-[32%]">
                      <span className="eyebrow eyebrow-dark mb-3 block">{shop.specialty}</span>
                      <h3 className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-brown-950">
                        {shop.name}
                      </h3>
                      <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-brown-700">
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

                    {/* The three ways in, as an itinerary: one dotted line down
                        the margin, a struck medallion at each stop. */}
                    <dl className="relative flex-1 border-l border-dotted border-rule-strong pl-8 sm:pl-10">
                      {[
                        { icon: Footprints, label: "A piedi", text: d.walk },
                        { icon: Car, label: "In auto", text: d.car },
                        { icon: Bus, label: "Mezzi pubblici", text: d.transit },
                      ].map(({ icon: Icon, label, text }, si) => (
                        <div key={label} className={si > 0 ? "mt-7 sm:mt-8" : ""}>
                          <dt className="flex items-center gap-3 text-[0.6875rem] font-bold tracking-[0.2em] text-brown-950 uppercase">
                            <span className="absolute left-0 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-rule-strong bg-paper text-gold-deep">
                              <Icon className="size-4" />
                            </span>
                            {label}
                          </dt>
                          <dd className="mt-2.5 max-w-2xl text-[0.9375rem] leading-relaxed text-brown-700">
                            {text}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  {d.note && (
                    <p className="relative mt-8 flex items-start gap-3 border-t border-rule pt-5 text-xs leading-relaxed text-taupe">
                      <Clock className="mt-0.5 size-3.5 shrink-0 text-gold-deep" />
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
      <section id="faq" className="scroll-mt-24 bg-paper px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto grid max-w-[88rem] grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-20">
          <Reveal className="lg:col-span-4">
            <SectionMark n="05" className="mb-6">
              Domande frequenti
            </SectionMark>
            <h2 className="font-display display-lg font-semibold text-brown-950">
              Prima di
              <span className="wonk text-gold-deep"> passare</span>
            </h2>
            <p className="mt-6 text-sm leading-relaxed text-brown-700">
              Non trovi la risposta? Chiamaci: al banco rispondiamo volentieri.
            </p>
            <div className="mt-8 space-y-2">
              {shops.map((shop) => (
                <a
                  key={shop.slug}
                  href={telHref(shop.phone)}
                  className="group flex items-baseline gap-3 border-b border-rule py-3 text-[0.8125rem] text-taupe transition-colors hover:text-brown-950"
                >
                  <Phone className="size-3.5 shrink-0 translate-y-0.5 text-gold-deep" aria-hidden />
                  <span className="font-medium text-brown-950">{shortName(shop.name)}</span>
                  <span className="font-display ml-auto text-[1.0625rem] font-semibold tracking-[-0.01em] text-brown-950 tabular-nums transition-colors group-hover:text-gold-deep">
                    {shop.phone}
                  </span>
                </a>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.1} className="lg:col-span-8">
            <div className="divide-y divide-rule border-y border-rule">
              {faqs.map((f, i) => (
                <details key={f.question} className="group py-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-left [&::-webkit-details-marker]:hidden">
                    <span className="flex items-baseline gap-4">
                      <span className="font-display text-sm font-semibold text-brown-950/25 tabular-nums">
                        {ordinal(i)}
                      </span>
                      <span className="font-display text-xl leading-snug tracking-tight text-brown-950 sm:text-2xl">
                        {f.question}
                      </span>
                    </span>
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rule-strong text-brown-950 transition-colors duration-500 group-open:bg-brown-950 group-open:text-cream">
                      <span className="absolute h-[1.5px] w-3.5 bg-current" />
                      <span className="absolute h-3.5 w-[1.5px] bg-current transition-transform duration-500 group-open:rotate-90" />
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-6 pl-9 text-base leading-relaxed text-brown-700">
                    {f.answer}
                  </p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Reservations funnel ────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-brown-950 px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <div className="ember absolute inset-0 opacity-80" />
        <div className="bg-noise absolute inset-0 opacity-10" />
        <div className="parallax-orb absolute -bottom-52 -left-40 h-[44rem] w-[44rem] opacity-10" />
        <Reveal className="relative mx-auto flex max-w-[88rem] flex-col items-center gap-10 text-center">
          <SectionMark n="06" tone="cream">
            Ospitalità Taccalite
          </SectionMark>
          <h2 className="font-display max-w-3xl text-4xl leading-[0.95] tracking-[-0.028em] text-cream sm:text-6xl">
            Siediti al banco:
            <span className="wonk text-gold"> ti apparecchiamo noi.</span>
          </h2>
          <p className="max-w-xl text-lg leading-relaxed text-cream/75">
            Taglieri di salumi e formaggi, porchetta calda e i consigli di chi la prepara da tre
            generazioni. Prenota il tuo tavolo: ti richiamiamo noi per confermare.
          </p>

          {/* The register again, in one line each — the last chance to pick a
              bottega before the button. */}
          <dl className="grid w-full max-w-2xl grid-cols-1 gap-x-10 border-y border-cream/15 py-2 text-left sm:grid-cols-2">
            {shops.map((shop) => (
              <div key={shop.slug} className="border-b border-cream/10 last:border-b-0 sm:border-b-0">
                <LeaderRow
                  tone="cream"
                  label={shortName(shop.name)}
                  value={bySlug.get(shop.slug)?.today?.value ?? "chiamaci"}
                />
              </div>
            ))}
          </dl>

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
