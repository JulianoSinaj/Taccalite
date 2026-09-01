import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Bus,
  Car,
  Clock,
  Footprints,
  Flame,
  History,
  Mail,
  Map,
  MapPin,
  Mountain,
  Navigation,
  Phone,
  ThumbsUp,
} from "lucide-react";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import PageHero from "@/components/site/PageHero";
import CTA from "@/components/site/CTA";
import ParallaxMedia from "@/components/site/ParallaxMedia";
import { PhotoCredit } from "@/components/site/PhotoCredit";
import ProductTile from "@/components/site/ProductTile";
import MedallionBadge from "@/components/MedallionBadge";
import PillButton from "@/components/PillButton";
import JsonLd from "@/components/JsonLd";
import WeekBars, { WeekBarsPending, weekIsDrawable } from "@/components/site/sedi/WeekBars";
import {
  CompassRose,
  CornerTicks,
  GhostNumeral,
  LeaderRow,
  SectionMark,
} from "@/components/site/sedi/Ornaments";
import { categoryAccent, plateEngraving } from "@/lib/categories";
import { directionsFor } from "@/lib/directions";
import { shopSchema, breadcrumbSchema, productSchema } from "@/lib/seo";
import { getShopBySlug, getShops, getProductsByShop } from "@/lib/db/queries";
import { clockNow, shopIsOpenNow, shopHoursRows, shopWeekGrid, type OpenState } from "@/lib/hours";

export const dynamic = "force-dynamic";

/** Live open/closed pill. `tone` picks the ground it is printed on. */
function OpenBadge({ state, tone = "cream" }: { state: OpenState | null; tone?: "cream" | "ink" }) {
  if (!state) return null;
  const detail = state.nextChange
    ? state.open
      ? ` · chiude ${state.nextChange}`
      : ` · apre ${state.nextChange}`
    : "";
  const dark = tone === "cream";
  if (state.open) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold tracking-widest uppercase ${
          dark ? "bg-green-500/15 text-green-300" : "bg-ok-soft text-ok-soft-fg"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dark ? "bg-green-400" : "bg-ok"}`} />
        Aperto ora{detail}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold tracking-widest uppercase ${
        dark ? "bg-cream/10 text-cream/60" : "bg-paper-deep text-taupe"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dark ? "bg-cream/40" : "bg-tan"}`} />
      Chiuso{detail}
    </span>
  );
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop) return {};
  return {
    title: shop.name,
    description: shop.tagline,
  };
}

const shopContent: Record<
  string,
  {
    heroLead: string;
    heroItalic: string;
    storyImage: string;
    storyImageAlt: string;
    /** The one sentence set large, in the shop's own voice. */
    pullQuote: string;
    features: { icon: "mountain" | "thumbs" | "map" | "history" | "flame"; title: string; caption: string }[];
  }
> = {
  centro: {
    heroLead: "Il paradiso",
    heroItalic: "dei formaggi",
    // The tasting room rather than a shelf of pasta: this page opens on "il
    // paradiso dei formaggi", and the forms stacked along the top shelves say
    // that where the pasta did not. Placed here because Centro is the shop
    // whose highlights list "degustazioni in negozio" — if the aperitivo room
    // is actually at Mercato del Piano, this and `carni` should swap.
    storyImage: "/images/bottega-angolo-aperitivo.jpg",
    storyImageAlt:
      "La sala dell'aperitivo in bottega, tra gli scaffali dei vini e le forme di formaggio",
    pullQuote:
      "Una forma si sceglie con le mani e con il naso: qui le assaggiamo prima noi, una a una.",
    features: [
      { icon: "mountain", title: "Formaggio di fossa", caption: "Stagionature naturali" },
      { icon: "thumbs", title: "Selezionati a mano", caption: "Controllo qualità" },
      { icon: "map", title: "Da tutta Italia", caption: "Piccoli produttori" },
      { icon: "history", title: "Tradizione garantita", caption: "Dal 1946" },
    ],
  },
  carni: {
    heroLead: "Il cuore della",
    heroItalic: "tradizione norcina",
    storyImage: "/images/banco-carni-bovino.jpg",
    storyImageAlt: "Il banco delle carni al Mercato del Piano, con i cartellini scritti a mano",
    pullQuote:
      "Il mercato apre presto: alle sette il banco è già pronto, e la porchetta esce dal forno il sabato.",
    features: [
      { icon: "flame", title: "Porchetta del sabato", caption: "Calda dal forno" },
      { icon: "thumbs", title: "Razza marchigiana", caption: "Tagli selezionati" },
      { icon: "map", title: "100% marchigiano", caption: "Salumi di produzione propria" },
      { icon: "history", title: "Tradizione garantita", caption: "Dal 1946" },
    ],
  },
};

const featureIcons = {
  mountain: Mountain,
  thumbs: ThumbsUp,
  map: Map,
  history: History,
  flame: Flame,
};

function telHref(phone: string) {
  return `tel:${phone.replace(/\s/g, "")}`;
}
function ordinal(i: number) {
  return String(i + 1).padStart(2, "0");
}

export default async function ShopDetailPage({ params }: Params) {
  const { slug } = await params;
  const [shop, allShops, shopProducts] = await Promise.all([
    getShopBySlug(slug),
    getShops(),
    getProductsByShop(slug),
  ]);
  if (!shop) notFound();

  const content = shopContent[shop.slug] ?? {
    heroLead: "La nostra",
    heroItalic: "bottega di famiglia",
    storyImage: shop.image,
    storyImageAlt: shop.name,
    pullQuote: shop.tagline,
    features: [
      { icon: "thumbs" as const, title: "Selezione accurata", caption: "Qualità garantita" },
      { icon: "map" as const, title: "Territorio marchigiano", caption: "Produttori locali" },
      { icon: "history" as const, title: "Tradizione", caption: "Dal 1946" },
      { icon: "flame" as const, title: "Specialità della casa", caption: "Artigianali" },
    ],
  };

  const otherShop = allShops.find((s) => s.slug !== slug);
  const index = Math.max(0, allShops.findIndex((s) => s.slug === slug));
  const openState = shopIsOpenNow(shop);
  const hoursRows = shopHoursRows(shop);
  const week = shopWeekGrid(shop);
  const weekDrawable = weekIsDrawable(week);
  const { day: todayIso, minutes: nowMinutes } = clockNow();
  const todayRow = week?.find((d) => d.day === todayIso) ?? null;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `Norcineria Taccalite, ${shop.address}`
  )}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `Norcineria Taccalite, ${shop.address}`
  )}`;
  // The counter's own colour — saffron for the cheese bench, salame red for the
  // meat one — carried through every plate on the page as `--acc`.
  const accent = categoryAccent(shop.specialty);
  const directions = directionsFor(shop.slug);

  return (
    <div style={{ "--acc": accent } as CSSProperties}>
      <JsonLd
        schema={[
          shopSchema(shop),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Sedi", path: "/sedi" },
            { name: shop.name, path: `/sedi/${shop.slug}` },
          ]),
          ...shopProducts.map(productSchema),
        ]}
      />

      {/* ── Hero ─────────────────────────────────────────────────────────
          On paper, like every other opening band on the site: the photograph
          is a framed insert with the shop's card printed under it, not the
          near-black slab this page used to open with — which put the fixed
          white header on a dark ground and read as a grey bar over the page. */}
      <PageHero
        eyebrow={`Bottega ${ordinal(index)} · ${shop.specialty}`}
        trail={
          <nav
            aria-label="Percorso"
            className="flex flex-wrap items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.2em] text-taupe uppercase"
          >
            <Link href="/" className="tap transition-colors hover:text-brown-950">
              Home
            </Link>
            <span aria-hidden className="text-rule-strong">
              /
            </span>
            <Link href="/sedi" className="tap transition-colors hover:text-brown-950">
              Sedi
            </Link>
            <span aria-hidden className="text-rule-strong">
              /
            </span>
            <span className="text-brown-950">{shop.name}</span>
          </nav>
        }
        title={[
          content.heroLead,
          <span key="2" className="wonk text-gold-deep">
            {content.heroItalic}
          </span>,
        ]}
        lede={shop.tagline}
        aside={
          <Reveal delay={0.15}>
            <div className="relative border border-rule-strong bg-paper">
              <CornerTicks />
              <div className="m-1.5 border border-rule">
                <ParallaxMedia className="aspect-[4/3]" distance={40}>
                  <Image
                    src={shop.image}
                    alt={shop.imageLabel || shop.name}
                    fill
                    preload
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 42vw"
                  />
                  <PhotoCredit src={shop.image} />
                </ParallaxMedia>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-5 py-4">
                  <span className="text-[0.625rem] font-semibold tracking-[0.22em] text-taupe uppercase">
                    {shop.imageLabel || shop.name}
                  </span>
                  <OpenBadge state={openState} tone="ink" />
                </div>

                <dl className="border-t border-rule px-5 pt-1 pb-3">
                  <LeaderRow
                    label="Oggi"
                    value={
                      todayRow == null || todayRow.ranges == null
                        ? "chiamaci"
                        : todayRow.ranges.length === 0
                          ? "chiuso"
                          : todayRow.ranges
                              .map(
                                (r) =>
                                  `${Math.floor(r.start / 60)}:${String(r.start % 60).padStart(2, "0")}–${Math.floor(r.end / 60)}:${String(r.end % 60).padStart(2, "0")}`
                              )
                              .join(", ")
                    }
                    emphasis
                  />
                  <LeaderRow label="Indirizzo" value={shop.address} />
                  <LeaderRow
                    label="Telefono"
                    value={
                      <a href={telHref(shop.phone)} className="tap hover:text-gold-deep">
                        {shop.phone}
                      </a>
                    }
                  />
                </dl>
              </div>
            </div>
          </Reveal>
        }
      >
        <div className="mt-9 flex flex-wrap gap-3">
          <CTA href={directionsUrl} tone="primary">
            Come arrivare
          </CTA>
          <CTA href="/prenotazioni" tone="outline">
            Prenota un tavolo
          </CTA>
        </div>
      </PageHero>

      {/* ── The card: hours drawn, contacts, address ────────────────────── */}
      <section className="relative overflow-hidden bg-brown-950 px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
        <div aria-hidden className="ember absolute inset-0 opacity-80" />
        <div aria-hidden className="bg-noise absolute inset-0 opacity-[0.08]" />

        <div className="relative mx-auto max-w-[88rem]">
          <SectionMark n="01" tone="cream" as="h2" className="mb-8">
            La scheda della bottega
          </SectionMark>

          <RevealStagger className="grid grid-cols-1 gap-px border border-cream/10 bg-cream/10 md:grid-cols-3">
            {/* Orari */}
            <RevealStaggerItem className="relative bg-brown-950 p-7 sm:p-9">
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full border border-gold/40 text-gold">
                  <Clock className="size-4" />
                </span>
                <h3 className="text-[0.6875rem] font-bold tracking-[0.2em] text-cream uppercase">
                  Orari di apertura
                </h3>
              </div>

              {/* Always one or the other, so the rule under it always has a
                  chart above it — and a bottega whose hours are not yet fixed
                  keeps the same card as the one whose are. */}
              {weekDrawable ? (
                <WeekBars week={week} today={todayIso} nowMinutes={nowMinutes} tone="dark" />
              ) : (
                <WeekBarsPending today={todayIso} tone="dark" />
              )}

              {hoursRows.length > 0 && (
                <dl className="mt-7 border-t border-cream/10 pt-2">
                  {hoursRows.map((h) => (
                    <LeaderRow key={h.label} tone="cream" label={h.label} value={h.value} />
                  ))}
                </dl>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <OpenBadge state={openState} />
                {/* The stand-in panel above already says this, and better. */}
                {!shop.hoursConfirmed && weekDrawable && (
                  <p className="text-xs text-cream/55">Orari da confermare in negozio.</p>
                )}
              </div>
            </RevealStaggerItem>

            {/* Contatti */}
            <RevealStaggerItem className="relative bg-brown-950 p-7 sm:p-9">
              <div className="mb-6 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full border border-gold/40 text-gold">
                  <Phone className="size-4" />
                </span>
                <h3 className="text-[0.6875rem] font-bold tracking-[0.2em] text-cream uppercase">
                  Contatti diretti
                </h3>
              </div>

              <a
                href={telHref(shop.phone)}
                className="tap font-display block text-3xl leading-tight font-semibold tracking-[-0.02em] text-cream tabular-nums transition-colors hover:text-gold sm:text-4xl"
              >
                {shop.phone}
              </a>
              <p className="mt-3 text-sm leading-relaxed text-cream/60">
                Al banco rispondiamo volentieri: ordini speciali, tagli su misura, consigli per
                una cena.
              </p>

              <a
                href={`mailto:${shop.email}`}
                className="tap mt-6 inline-flex items-center gap-2.5 border-b border-gold/40 pb-1 text-sm break-all text-cream/85 transition-colors hover:text-gold"
              >
                <Mail className="size-4 shrink-0 text-gold" />
                {shop.email}
              </a>

              <div className="mt-8 flex flex-wrap gap-3">
                <PillButton href="/prenotazioni" tone="gold">
                  Prenota un tavolo
                </PillButton>
                <PillButton href="/contatti" tone="ghost">
                  Scrivici
                </PillButton>
              </div>

              {openState?.nextChange && (
                <p className="mt-8 flex items-start gap-2.5 border-t border-cream/10 pt-5 text-xs leading-relaxed text-cream/60">
                  <Clock className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden />
                  {openState.open
                    ? `Oggi al telefono fino alle ${openState.nextChange}.`
                    : `Oggi ricominciamo a rispondere alle ${openState.nextChange}.`}
                </p>
              )}
            </RevealStaggerItem>

            {/* Indirizzo */}
            <RevealStaggerItem className="relative overflow-hidden [contain:paint] bg-brown-950 p-7 sm:p-9">
              <CompassRose className="pointer-events-none absolute -right-6 -bottom-6 size-40 text-cream/10" />
              <div className="relative">
                <div className="mb-6 flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full border border-gold/40 text-gold">
                    <MapPin className="size-4" />
                  </span>
                  <h3 className="text-[0.6875rem] font-bold tracking-[0.2em] text-cream uppercase">
                    Dove siamo
                  </h3>
                </div>

                <p className="font-display text-2xl leading-tight font-semibold text-cream sm:text-3xl">
                  {shop.address}
                </p>
                <p className="mt-2 text-sm text-cream/60">Ancona · Marche · Italia</p>

                <div className="mt-8 flex flex-col gap-3">
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-magnetic
                    className="inline-flex items-center gap-3 self-start rounded-full bg-gold px-6 py-3 text-sm font-semibold text-on-gold transition-all duration-500 hover:-translate-y-0.5"
                  >
                    <Navigation className="size-4" />
                    Avvia le indicazioni
                  </a>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tap inline-flex items-center gap-2 self-start text-[0.6875rem] font-bold tracking-[0.18em] text-cream/60 uppercase transition-colors hover:text-gold"
                  >
                    Apri in Google Maps
                    <ArrowRight className="size-3.5" />
                  </a>
                </div>

                <dl className="mt-8 space-y-4 border-t border-cream/10 pt-6">
                  {[
                    { icon: Footprints, label: "A piedi", text: directions.short.walk },
                    { icon: Car, label: "In auto", text: directions.short.car },
                    { icon: Bus, label: "In bus", text: directions.short.transit },
                  ].map(({ icon: Icon, label, text }) => (
                    <div key={label} className="flex items-start gap-3.5">
                      <Icon className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                      <div className="min-w-0">
                        <dt className="text-[0.625rem] font-bold tracking-[0.18em] text-cream/50 uppercase">
                          {label}
                        </dt>
                        <dd className="mt-1 text-[0.8125rem] leading-relaxed text-cream/75">
                          {text}
                        </dd>
                      </div>
                    </div>
                  ))}
                </dl>

                {directions.note && (
                  <p className="mt-6 border-t border-cream/10 pt-4 text-xs leading-relaxed text-cream/55">
                    {directions.note}
                  </p>
                )}
              </div>
            </RevealStaggerItem>
          </RevealStagger>
        </div>
      </section>

      {/* ── Chi siamo ──────────────────────────────────────────────────── */}
      <section className="bg-paper px-5 py-12 text-brown-950 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <Reveal className="mb-12">
            {/* The band's title is a pull-quote, which is not a heading — so
                the mark carries the heading itself rather than leaving the
                outline with a hole between the hero and the plates. */}
            <SectionMark n="02" as="h2" className="mb-6">
              Dedizione e qualità
            </SectionMark>
            <blockquote className="font-display display-md max-w-4xl font-semibold text-brown-950">
              <span className="wonk text-gold-deep">&ldquo;</span>
              {content.pullQuote}
              <span className="wonk text-gold-deep">&rdquo;</span>
            </blockquote>
          </Reveal>

          <div className="flex flex-col items-start gap-14 lg:flex-row lg:gap-20">
            <Reveal className="w-full space-y-10 lg:w-1/2">
              <p className="max-w-xl text-lg leading-relaxed text-brown-700">{shop.description}</p>

              {/* The highlights as a ledger: numbered, ruled, one per line. */}
              <ul className="border-t border-rule">
                {shop.highlights.map((h, i) => (
                  <li
                    key={h}
                    className="group relative flex items-start gap-5 border-b border-rule py-5"
                  >
                    <span className="font-display w-6 shrink-0 pt-0.5 text-sm font-semibold text-brown-950/30 tabular-nums">
                      {ordinal(i)}
                    </span>
                    <span className="text-[0.9375rem] leading-relaxed text-brown-700">{h}</span>
                    <span
                      aria-hidden
                      className="rule-draw absolute inset-x-0 bottom-[-1px] block h-px"
                    />
                  </li>
                ))}
              </ul>

              <div className="border-y border-rule">
                <dl className="grid grid-cols-2">
                  {[
                    { k: "1946", v: "dal" },
                    { k: "3", v: "generazioni" },
                  ].map((cell, i) => (
                    <div key={cell.v} className={`py-6 ${i > 0 ? "border-l border-rule pl-5" : "pr-5"}`}>
                      <dt className="font-display wonk text-3xl leading-none font-bold text-gold-deep sm:text-4xl">
                        {cell.k}
                      </dt>
                      <dd className="mt-2 text-[0.625rem] font-semibold tracking-[0.2em] text-taupe uppercase">
                        {cell.v}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="flex items-center gap-3 border-t border-rule py-4 text-[0.625rem] font-semibold tracking-[0.2em] text-taupe uppercase">
                  <span aria-hidden className="h-px w-8 bg-gold" />
                  Il banco · {shop.specialty}
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.15} className="w-full lg:w-1/2">
              <div className="relative">
                <div className="relative border border-rule-strong bg-paper p-1.5">
                  <CornerTicks />
                  <ParallaxMedia className="aspect-[4/5]" distance={56}>
                    <Image
                      src={content.storyImage}
                      alt={content.storyImageAlt}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                  </ParallaxMedia>
                </div>
                <p className="mt-3 flex items-center gap-3 text-[0.625rem] font-semibold tracking-[0.2em] text-taupe uppercase">
                  <span aria-hidden className="h-px w-8 bg-gold" />
                  {content.storyImageAlt}
                </p>
                {/* The house mark, struck half off the frame. */}
                <MedallionBadge className="absolute -top-8 -left-8 hidden size-28 lg:block" />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Perché sceglierci — engraved plates ────────────────────────── */}
      <section className="bg-paper-warm px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <Reveal className="mb-12 max-w-3xl">
            <SectionMark n="03" className="mb-6">
              Perché sceglierci
            </SectionMark>
            <h2 className="font-display display-lg font-semibold text-brown-950">
              Quattro cose che
              <span className="wonk text-gold-deep"> trovi solo qui</span>
            </h2>
          </Reveal>

          <RevealStagger className="grid grid-cols-2 gap-5 sm:gap-6 lg:grid-cols-4">
            {content.features.map((feature) => {
              const Icon = featureIcons[feature.icon];
              return (
                <RevealStaggerItem key={feature.title}>
                  <div className="group relative aspect-square overflow-hidden">
                    {/* The plate: the shop's accent, struck as a printed label
                        rather than as another photo we do not have. */}
                    <span
                      aria-hidden
                      className={`plate absolute inset-0 block ${plateEngraving(`${shop.slug}-${feature.title}`)}`}
                    />
                    <div className="relative flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
                      {/* The glyph carries the feature as much as the caption
                          does, so it is a meaningful graphic and owes 3:1. At
                          85% the lighter accents sat at 3.5 — fine — but the
                          ring around it was at 45%, well under. Both at full
                          strength now; the ring reads as a hairline either way. */}
                      <span className="flex size-12 items-center justify-center rounded-full border border-[var(--acc)]/60 bg-paper/70 text-[var(--acc)] transition-transform duration-700 group-hover:-translate-y-1">
                        <Icon className="size-5" />
                      </span>
                      <h3 className="font-display text-lg leading-tight font-semibold text-brown-950 sm:text-xl">
                        {feature.title}
                      </h3>
                      {/* Full strength, not 72%: this is 9px type, and the
                          softening put every accent between 2.8 and 4.3:1 on
                          the plate under it. The accents are already reserved
                          for small type at full strength — the alpha was
                          undoing the one case the rule exists for. */}
                      <p className="text-[0.5625rem] font-semibold tracking-[0.2em] text-[var(--acc)] uppercase sm:text-[0.625rem]">
                        {feature.caption}
                      </p>
                    </div>
                  </div>
                </RevealStaggerItem>
              );
            })}
          </RevealStagger>
        </div>
      </section>

      {/* ── Prodotti ───────────────────────────────────────────────────── */}
      {shopProducts.length > 0 && (
        <section className="bg-paper px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto max-w-[88rem]">
            <Reveal className="mb-12 flex flex-col gap-6 border-b border-rule pb-8 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <SectionMark n="04" className="mb-6">
                  Da questo banco
                </SectionMark>
                <h2 className="font-display display-lg font-semibold text-brown-950">
                  I tesori della
                  <span className="wonk text-gold-deep"> dispensa</span>
                </h2>
              </div>
              <div className="flex items-end gap-8">
                <p className="text-sm leading-relaxed text-brown-700">
                  <span className="font-display block text-3xl font-semibold text-brown-950 tabular-nums">
                    {String(shopProducts.length).padStart(2, "0")}
                  </span>
                  {shopProducts.length === 1 ? "prodotto in vendita" : "prodotti in vendita"}
                </p>
                <Link
                  href="/negozio"
                  className="underline-draw tap inline-flex items-center gap-2 pb-1 text-sm font-semibold text-brown-950"
                >
                  Tutto l&apos;e-shop
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </Reveal>

            {/* ProductTile carries the plate fallback, the price and the buy
                control — a bespoke card here fed `next/image` a src of "" for
                every product without a photo, which is most of them. */}
            <RevealStagger
              className={`grid grid-cols-2 gap-x-6 gap-y-12 sm:gap-x-7 ${
                shopProducts.length > 2 ? "lg:grid-cols-4" : "lg:mx-auto lg:max-w-3xl"
              }`}
            >
              {shopProducts.map((product) => (
                <RevealStaggerItem key={product.slug}>
                  <ProductTile
                    product={{
                      slug: product.slug,
                      name: product.name,
                      category: product.category,
                      image: product.image,
                      imageLabel: product.imageLabel,
                      priceCents: product.priceCents,
                      unit: product.unit,
                      stock: product.stock,
                      purchasable: product.purchasable,
                      origin: product.origin,
                    }}
                  />
                </RevealStaggerItem>
              ))}
            </RevealStagger>
          </div>
        </section>
      )}

      {/* ── Vieni a trovarci ───────────────────────────────────────────── */}
      <section className="bg-paper-warm px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <Reveal className="mb-12 max-w-3xl">
            <SectionMark n="05" className="mb-6">
              Vieni a trovarci
            </SectionMark>
            <h2 className="font-display display-lg font-semibold text-brown-950">
              Il banco è qui,
              <span className="wonk text-gold-deep"> ti aspettiamo</span>
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
            <Reveal className="lg:col-span-7">
              <div className="relative h-full min-h-[22rem] border border-rule-strong bg-paper p-1.5">
                <CornerTicks />
                <div className="relative h-full min-h-[21rem] overflow-hidden">
                  <Image
                    src={shop.image}
                    alt={shop.imageLabel || shop.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 58vw"
                  />
                  <PhotoCredit src={shop.image} />
                  <div className="absolute inset-0 bg-gradient-to-t from-brown-950/85 via-brown-950/25 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-7 sm:p-9">
                    <GhostNumeral
                      n={ordinal(index)}
                      className="absolute top-0 right-7 text-[4rem] text-cream/15 tabular-nums sm:right-9 sm:text-[5rem]"
                    />
                    <p className="font-display text-3xl leading-tight font-semibold text-cream sm:text-4xl">
                      {shop.name}
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-cream/75">
                      <MapPin className="size-4 text-gold" />
                      {shop.address}
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.15} className="lg:col-span-5">
              <div className="relative h-full border border-rule bg-paper p-8 sm:p-10">
                <CornerTicks />
                <h3 className="font-display text-3xl leading-tight font-semibold text-brown-950 sm:text-[2.25rem]">
                  Una degustazione,
                  <span className="wonk text-gold-deep"> al banco</span>
                </h3>
                <p className="mt-5 text-[0.9375rem] leading-relaxed text-brown-700">
                  Il nostro banco è a tua disposizione per consigli, assaggi e ordini speciali.
                  Chiamaci o prenota un tavolo per un&apos;esperienza guidata.
                </p>

                <dl className="mt-7 border-y border-rule">
                  <LeaderRow label="Telefono" value={shop.phone} />
                  <LeaderRow label="Specialità" value={shop.specialty} />
                  <LeaderRow
                    label="Oggi"
                    value={
                      openState ? (openState.open ? "aperto adesso" : "chiuso adesso") : "chiamaci"
                    }
                    emphasis
                  />
                </dl>

                <div className="mt-8 space-y-3">
                  <Link
                    href="/prenotazioni"
                    data-magnetic
                    className="inline-flex w-full items-center justify-center rounded-full bg-gold px-8 py-4 text-sm font-semibold text-on-gold shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-all duration-500 hover:-translate-y-1 hover:bg-gold-dark"
                  >
                    Prenota un tavolo
                  </Link>
                  <a
                    href={telHref(shop.phone)}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-rule-strong px-8 py-4 text-sm font-semibold text-brown-950 transition-colors hover:bg-brown-950 hover:text-cream"
                  >
                    <Phone className="size-4" />
                    {shop.phone}
                  </a>
                  <a
                    href={`mailto:${shop.email}`}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-rule-strong px-8 py-4 text-sm font-semibold break-all text-brown-950 transition-colors hover:bg-brown-950 hover:text-cream"
                  >
                    <Mail className="size-4" />
                    Scrivici
                  </a>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── The other bottega ──────────────────────────────────────────── */}
      {otherShop && (
        <section className="relative overflow-hidden bg-brown-950 px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
          <div aria-hidden className="ember absolute inset-0 opacity-70" />
          <div aria-hidden className="bg-noise absolute inset-0 opacity-[0.07]" />
          <Reveal className="relative mx-auto max-w-[88rem]">
            <SectionMark n="06" tone="cream" className="mb-8">
              L&apos;altra bottega
            </SectionMark>
            <Link
              href={`/sedi/${otherShop.slug}`}
              className="group relative block h-96 overflow-hidden border border-cream/15"
            >
              <Image
                src={otherShop.image}
                alt={otherShop.imageLabel || otherShop.name}
                fill
                className="object-cover transition-transform duration-[2s] group-hover:scale-105"
                sizes="100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-brown-950 via-brown-950/70 to-transparent" />
              <CornerTicks tone="cream" />
              <div className="relative flex h-full max-w-2xl flex-col justify-center gap-5 p-8 sm:p-14">
                <span className="eyebrow">{otherShop.specialty}</span>
                <h3 className="font-display text-3xl leading-[1.02] font-semibold tracking-[-0.028em] text-cream sm:text-5xl">
                  {otherShop.name}
                </h3>
                <p className="max-w-md text-[0.9375rem] leading-relaxed text-cream/70">
                  {otherShop.tagline}
                </p>
                <p className="flex items-center gap-2 text-[0.8125rem] text-cream/60">
                  <MapPin className="size-3.5 text-gold" />
                  {otherShop.address}
                </p>
                <span className="mt-2 inline-flex w-fit items-center gap-3 border-b border-gold/50 pb-1 text-[0.6875rem] font-semibold tracking-[0.2em] text-gold uppercase transition-[gap] duration-500 group-hover:gap-5">
                  Visita la bottega
                  <ArrowRight className="size-3.5" />
                </span>
              </div>
            </Link>
          </Reveal>
        </section>
      )}
    </div>
  );
}
