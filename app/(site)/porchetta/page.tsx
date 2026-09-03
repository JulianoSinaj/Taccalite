import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronDown, Phone, ShoppingBag } from "lucide-react";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import JsonLd from "@/components/JsonLd";
import PageHero from "@/components/site/PageHero";
import CTA from "@/components/site/CTA";
import Faq from "@/components/site/Faq";
import ProductPlate from "@/components/site/ProductPlate";
import { PhotoCredit } from "@/components/site/PhotoCredit";
import AddToCartButton from "@/components/store/AddToCartButton";
import PorchettaConfigurator, {
  type ConfiguratorDay,
  type ConfiguratorShop,
} from "@/components/site/porchetta/PorchettaConfigurator";
import { LeaderRow, SectionMark } from "@/components/site/sedi/Ornaments";
import { porchettaAvailability, porchettaPickupDays, weekdayNameIt } from "@/lib/reservations";
import { siteRecords } from "@/lib/site-content";
import { getClosures, getProductBySlug, getSetting, getShops } from "@/lib/db/queries";
import { closureFor, closureMessage } from "@/lib/closures";
import { categoryAccent } from "@/lib/categories";
import { formatEuro, formatKg } from "@/lib/format";
import { breadcrumbSchema, faqSchema } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "La Porchetta — prenota la tua per sabato",
  description:
    "La porchetta artigianale Taccalite: la ricetta di famiglia, cotta lentamente ogni sabato ad Ancona. Scegli quanta, in quale bottega e per quale sabato, e prenotala online.",
};

/**
 * The horizontal dissolve on the hero photograph — see the note at its call
 * site. Declared once because `mask-image` and its `-webkit-` twin have to stay
 * identical, and a smoothstep written out twice is a smoothstep that will one
 * day be edited once.
 */
const MASK =
  "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.04) 6%, rgba(0,0,0,0.16) 11%, rgba(0,0,0,0.32) 16%, rgba(0,0,0,0.50) 22%, rgba(0,0,0,0.68) 27%, rgba(0,0,0,0.84) 33%, rgba(0,0,0,0.96) 38%, #000 44%)";

/** The e-shop product this page prices from and sells through. */
const PRODUCT_SLUG = "porchetta-artigianale";

/** "29 ago" — the day chips are too narrow for the month in full. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(".", "");
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export default async function PorchettaPage() {
  // Everything the sheet needs, in one round: the next pickup day for the strip
  // at the top, the next four for the chips, the shops that roast, the days
  // they are shut, the product the price comes from, and the copy the shop can
  // edit in the gestionale. All reads are best-effort: the page still renders
  // if nothing is configured.
  const [
    availability,
    pickupDays,
    shops,
    closures,
    product,
    steps,
    gallery,
    pickupDayKey,
    cutoffDayKey,
    porchettaEnabled,
    storeEnabled,
  ] = await Promise.all([
    porchettaAvailability(),
    porchettaPickupDays(4),
    getShops(),
    getClosures(),
    getProductBySlug(PRODUCT_SLUG),
    siteRecords("porchetta.steps"),
    siteRecords("porchetta.gallery"),
    getSetting<string>("porchetta.day", "saturday"),
    getSetting<string>("porchetta.cutoffDay", "friday"),
    getSetting<boolean>("porchetta.enabled", true),
    getSetting<boolean>("store.enabled", true),
  ]);

  const { pickupLabel, shops: shopAvailability, hasCapacity, allFull } = availability;
  // With one roasting shop the strip reads as it always did; with more, each gets
  // its own figure rather than being averaged into a number true of neither.
  const capped = shopAvailability.filter((s) => s.capacityKg > 0);

  // The strip at the top and the chips in the form are two reads of the same
  // calendar, so the deadline shown beside the date has to be *that* batch's —
  // matched on the ISO rather than assumed to be the first of the list.
  const nextDay =
    pickupDays.find((d) => d.pickupIso === availability.pickupIso) ?? pickupDays[0];

  const pickupDayName = weekdayNameIt(pickupDayKey, "sabato");
  const cutoffDayName = weekdayNameIt(cutoffDayKey, "venerdì");

  const roasting = shops.filter((s) => s.porchettaEnabled);
  const bookingOpen = porchettaEnabled && roasting.length > 0 && pickupDays.length > 0;

  // The product is what makes the price a fact rather than a sentence. When it
  // is not on sale the sheet simply says "alla pesata" and the e-shop panel is
  // left out — nothing on this page invents a number.
  const onSale =
    !!product && product.active && product.purchasable && product.priceCents != null && storeEnabled;
  const pricePerKgCents = onSale ? product.priceCents : null;

  const configuratorShops: ConfiguratorShop[] = roasting.map((s) => ({
    slug: s.slug,
    name: s.name,
    specialty: s.specialty,
    address: s.address,
    phone: s.phone,
  }));

  const configuratorDays: ConfiguratorDay[] = pickupDays.map((d) => {
    const slots: ConfiguratorDay["shops"] = {};
    for (const s of roasting) {
      const row = d.shops.find((r) => r.slug === s.slug);
      const closure = closureFor(closures, s.slug, d.pickupIso, "reservations");
      slots[s.slug] = {
        capacityKg: row?.capacityKg ?? 0,
        remainingKg: row?.remainingKg ?? 0,
        isFull: row?.isFull ?? false,
        closed: closure ? closureMessage(closure, d.pickupIso) : null,
      };
    }
    return {
      iso: d.pickupIso,
      label: d.pickupLabel,
      short: shortDate(d.pickupIso),
      cutoffLabel: d.cutoffLabel,
      bookable: d.bookable,
      shops: slots,
    };
  });

  // The ledger. Every line is read off data the gestionale controls, so it
  // cannot say something the booking form would then refuse.
  const capacityLine = (() => {
    const withCap = roasting
      .map((s) => ({ name: s.name, cap: shopAvailability.find((r) => r.slug === s.slug)?.capacityKg ?? 0 }))
      .filter((s) => s.cap > 0);
    if (withCap.length === 0) return null;
    const same = withCap.every((s) => s.cap === withCap[0].cap);
    return same
      ? `${formatKg(withCap[0].cap)} kg per bottega, a sfornata`
      : withCap.map((s) => `${s.name} ${formatKg(s.cap)} kg`).join(" · ");
  })();

  const facts: { label: string; value: string }[] = [
    { label: "Quando", value: `${cap(pickupDayName)} mattina, calda dal forno` },
    { label: "Dove", value: roasting.map((s) => s.name).join(" · ") || "Nelle nostre botteghe" },
    { label: "Prezzo", value: onSale ? `${formatEuro(product.priceCents!)} al kg, alla pesata` : "Al banco, alla pesata" },
    { label: "Quantità", value: "Da mezzo chilo, a passi di mezzo chilo" },
    { label: "Prenotazioni", value: `Online o per telefono, entro ${cutoffDayName}` },
    ...(capacityLine ? [{ label: "Disponibilità", value: capacityLine }] : []),
    { label: "Pagamento", value: "Al ritiro, sul peso effettivo" },
  ];

  const howItWorks = [
    {
      title: "Scegli e prenota",
      text: `Quantità, bottega e ${pickupDayName}: due minuti dal telefono, entro ${cutoffDayName}.`,
    },
    {
      title: "Ti richiamiamo",
      text: "Confermiamo noi quantità e orario di ritiro. Nessun pagamento anticipato.",
    },
    {
      title: "Ritirala calda",
      text: `${cap(pickupDayName)} mattina, al banco: la pesiamo davanti a te e paghi quello che porti via.`,
    },
  ];

  const faq = [
    {
      question: "Quando è pronta la porchetta?",
      answer: `Ogni ${pickupDayName} mattina, calda dal forno, nelle botteghe Taccalite ad Ancona.`,
    },
    {
      question: "Entro quando devo prenotare?",
      answer: `Entro ${cutoffDayName}, online da questa pagina o per telefono. Ti richiamiamo per confermare.`,
    },
    {
      question: "Quanta ne posso prenotare?",
      answer: "Da mezzo chilo in su, a passi di mezzo chilo. Si paga al ritiro, sul peso effettivo.",
    },
    ...(onSale
      ? [
          {
            question: "Quanto costa?",
            answer: `${formatEuro(product.priceCents!)} al chilo. Il prezzo definitivo si fa alla pesata.`,
          },
        ]
      : []),
  ];

  return (
    <div>
      <JsonLd
        schema={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "La porchetta", path: "/porchetta" },
          ]),
          faqSchema(faq),
        ]}
      />

      {/* Hero.
          Twice now this band has been a photograph: first full-bleed under a
          near-black wash — the only dark opening left on the site — and then
          not at all, a 360px square in the right-hand column. This is the third
          shape and it is trying to keep what each of the other two was right
          about. The picture is large and unframed, the way the first one was;
          the page stays paper and the type stays black on cream, the way the
          second one insisted. The photograph is the ground, not a slab over it.

          The honesty problem the near-black version had is still here, though,
          and it is now bigger: this is Wikimedia's porchetta, not ours. The
          credit under it is what the licence asks; a Saturday morning and a
          phone is what actually fixes it. */}
      <PageHero
        eyebrow="Specialità della casa"
        title={[
          "La porchetta:",
          <span key="2" className="wonk text-gold-deep">
            la ricetta di famiglia
          </span>,
        ]}
        lede={`Cottura lenta, erbe delle Marche, e il ${pickupDayName} mattina fuori dal forno. Scegli quanta ne vuoi, in quale bottega e per quale ${pickupDayName}: al resto pensiamo noi.`}
        media={
          // Not `aria-hidden`: the photograph is decorative and carries an
          // empty `alt`, but keeping the panel in the accessibility tree costs
          // nothing and leaves somewhere for a credit to live if the picture is
          // ever swapped for one whose licence requires it. This one's does
          // not — Pexels License, Cleo Vergara, free for commercial use with no
          // attribution, which is also why `PhotoCredit` is not called here.
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[50%] lg:block xl:w-[54%]">
            {/* The picture, and no frame around it.

                Two photographs have been wrong in this slot. First a 360px
                square of `lonza-suino-brado.jpg` — a vacuum-packed loin under
                the counter's magenta light — which was not porchetta at all, on
                a page whose whole promise is crackling out of the oven. Then
                Wikimedia's `porchetta-al-forno.jpg`, which was at least the
                right dish but is flatly lit against a black cloth, and came
                with a CC BY-SA credit that had to be printed over the corner.

                This one is lit, warm, and shows the spiral of the roll, which
                is the part that makes someone want to eat it. It is also
                CC0-equivalent, so the corner is clean.

                `object-left` puts the two cut slices in the right-hand half of
                the panel — which matters, because the left of this panel is
                masked away (below) and anything composed there would be thrown
                out.

                The panel narrows at `lg`. `display-xl` sets at `8.5vw` up to a
                `8rem` cap, so the headline's right edge tracks the viewport at
                a fixed fraction until about 1400px and then stops — meaning the
                gap between the last glyph and the panel is at its tightest
                exactly at `lg`, where a flat 54% left three pixels of it. The
                mask would have covered that, but three pixels is not a margin,
                it is a coincidence waiting to be broken by a longer word. */}
            <Image
              src="/images/porchetta-affettata-tagliere.jpg"
              alt=""
              fill
              sizes="(min-width: 1280px) 54vw, (min-width: 1024px) 50vw, 1px"
              loading="eager"
              fetchPriority="high"
              className="object-cover object-left"
              style={{
                // The edge that was a line, and then was too white.
                //
                // A paper-coloured `div` laid over the photograph faded it out
                // *to a flat colour* — and the page is not a flat colour, it is
                // stock with `--paper-grain` multiplied over it. So the wash read
                // as a panel of untextured cream on textured cream: the same
                // seam, only softer. Masking removes the pixels instead of
                // covering them, so what shows through is the real page.
                //
                // The shape of the ramp then matters more than its length, for
                // two reasons that pull against each other.
                //
                // Smoothness: the first version went `0 → 0.55 → 1` at three
                // stops, which is two straight runs at different slopes meeting
                // at 26%. That join is a crease, and no amount of extra length
                // hides it. This is a smoothstep — nine stops off `3t²-2t³` —
                // so the slope is zero at both ends and there is no join to see.
                //
                // Whiteness: over cream, alpha is what makes a photograph pale.
                // At a=0.5 this picture composites to roughly (196,177,164) —
                // milk. So the fade should cross the middle of its range as
                // quickly as it can and linger only at the ends, where it is
                // imperceptible. A smoothstep does exactly that: steepest at
                // 0.5, flat at 0 and 1. The pale band is now about an eighth of
                // the panel rather than a fifth of it, and full strength arrives
                // at 44% instead of 46% of a panel that is itself wider — which
                // is the rest of the answer, since the cure for a washed edge is
                // mostly more photograph behind it.
                maskImage: MASK,
                WebkitMaskImage: MASK,
              }}
            />

            {/* The one wash that stays, and only at the top. The fixed header is
                translucent paper with grain in it, and a photograph read through
                that grain looks like a printing fault — so the picture starts
                below the chrome rather than under it. Flat cream is the right
                paint here precisely because the header is flat cream too.

                The bottom is left hard on purpose: it is where this band hands
                over to the sfornata strip, and a straight rule there is the same
                join every other section of the site makes. */}
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-paper via-paper/85 to-transparent" />
          </div>
        }
      >
        <div className="mt-8 flex flex-wrap items-center gap-3 sm:mt-10">
          <CTA href="#prenota" tone="gold">
            Prenota per {pickupDayName}
          </CTA>
          {onSale && (
            <CTA href={`/negozio/${product.slug}`} tone="outline">
              Ordina dall&apos;e-shop
            </CTA>
          )}
        </div>
      </PageHero>

      {/* Disponibilità — the roasting docket.

          This band was a card: a gold-hairline box on a warm fill, with a gold
          pill on the right. Three things were wrong with it. It floated, on a
          page whose whole idiom is ruled paper rather than cards. Its pill
          repeated the hero's "Prenota per sabato" — the same words, the same
          colour, the same anchor, two hundred pixels apart — so the eye met two
          identical gold buttons and had to work out that they were one offer.
          And it buried its own point: the kilos left in each bottega are the
          only live numbers on the page, and they were set smaller than
          everything around them, in a bulleted list, under a date.

          So: no box, two hairlines. The date is the heading it always was, the
          deadline sits under it where a deadline belongs, and the capacity is
          promoted to the right-hand half and given a measure — a quantity is
          easier to read as a length than as a sentence. The action steps down
          to an outline, because the gold one is still on screen above it. */}
      <section className="px-5 pb-16 sm:px-8 lg:px-12">
        <Reveal className="mx-auto max-w-[88rem] border-y border-rule-strong py-8 sm:py-10">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-12">
            <div className="lg:col-span-5">
              <p className="eyebrow font-semibold text-gold-deep uppercase">Prossima sfornata</p>
              <p className="font-display mt-4 text-[1.75rem] leading-[1.05] font-semibold text-brown-950 sm:text-[2.125rem]">
                {pickupLabel}
                {hasCapacity && allFull && (
                  <span className="wonk block text-gold-deep">Al completo — lista d&apos;attesa</span>
                )}
              </p>
              {/* The deadline, which used to live only in the ledger four bands
                  down. It is the fact that decides whether a visitor acts now or
                  closes the tab, so it belongs against the date it applies to. */}
              {nextDay?.bookable && (
                <p className="mt-3 text-sm text-brown-700">
                  Prenotazioni entro <span className="font-semibold text-brown-950">{nextDay.cutoffLabel}</span>
                </p>
              )}
            </div>

            {capped.length > 0 && (
              <div className="lg:col-span-4">
                <ul className="space-y-4">
                  {capped.map((s) => {
                    // Remaining, not booked: the bar shrinks as the batch sells,
                    // which is the direction a reader expects a "what is left"
                    // gauge to move. Clamped, because a hand-edited capacity in
                    // the gestionale can legitimately sit below what is already
                    // on the books.
                    const pct = Math.max(0, Math.min(100, (s.remainingKg / s.capacityKg) * 100));
                    return (
                      <li key={s.slug}>
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="text-sm font-semibold text-brown-950">{s.name}</span>
                          <span className="text-sm text-brown-700 tabular-nums">
                            {s.isFull ? (
                              <span className="text-gold-deep">al completo</span>
                            ) : (
                              <>
                                <span className="font-bold text-gold-deep">
                                  {formatKg(s.remainingKg)} kg
                                </span>{" "}
                                <span className="text-taupe">su {formatKg(s.capacityKg)}</span>
                              </>
                            )}
                          </span>
                        </div>
                        {/* Decorative: the figures above already say it in words,
                            and a progressbar role here would have a screen reader
                            read every batch twice. */}
                        <div aria-hidden className="mt-2 h-[3px] w-full bg-rule">
                          <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="lg:col-span-3 lg:col-start-10 lg:justify-self-end">
              <CTA href="#prenota" tone="outline">
                Prenota la porchetta
              </CTA>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Prenota — the order sheet. The one band on the page that does
          something; everything under it explains why it is worth doing. */}
      <section id="prenota" className="scroll-mt-24 bg-paper-warm px-5 py-16 sm:px-8 sm:py-24 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <Reveal className="mb-12 grid gap-6 sm:mb-16 lg:grid-cols-12 lg:items-end lg:gap-12">
            <div className="lg:col-span-8">
              <span className="eyebrow eyebrow-dark mb-5 block">Prenota la porchetta</span>
              <h2 className="font-display display-lg font-semibold text-brown-950">
                Componi la tua, <span className="wonk text-gold-deep">la teniamo da parte</span>
              </h2>
            </div>
            <p className="text-[0.9375rem] leading-relaxed text-brown-700 lg:col-span-4 lg:pb-2">
              Quanta, dove e quale {pickupDayName}. Le quantità sono in mezzi chili, la
              disponibilità è quella vera di ogni bottega, e il prezzo si fa alla pesata.
            </p>
          </Reveal>

          {bookingOpen ? (
            <Reveal delay={0.1}>
              <PorchettaConfigurator
                shops={configuratorShops}
                days={configuratorDays}
                pricePerKgCents={pricePerKgCents}
                pickupDayName={pickupDayName}
              />
            </Reveal>
          ) : (
            <Reveal className="mx-auto max-w-2xl border border-rule bg-paper p-8 text-center sm:p-12">
              <h3 className="font-display display-md font-semibold text-brown-950">
                Prenotazioni momentaneamente sospese
              </h3>
              <p className="mt-4 text-brown-700">
                In questo periodo la porchetta non si prenota online. Chiamaci in bottega: se è in
                forno, te la teniamo da parte.
              </p>
              {shops.filter((s) => s.phone).length > 0 && (
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  {shops
                    .filter((s) => s.phone)
                    .map((s) => (
                      <a
                        key={s.slug}
                        href={telHref(s.phone)}
                        className="inline-flex items-center gap-2.5 rounded-full border border-rule-strong px-6 py-3 text-sm font-semibold text-brown-950 transition-colors hover:bg-brown-950 hover:text-cream"
                      >
                        <Phone className="size-4 text-gold-deep" aria-hidden />
                        {s.name} · {s.phone}
                      </a>
                    ))}
                </div>
              )}
            </Reveal>
          )}

          {/* The other way in: the e-shop sells the same porchetta by the kilo,
              with pickup or shipping like anything else on the shelf. One strip,
              so a visitor who wants a cart rather than a callback is not sent
              off to search for it. */}
          {onSale && (
            <Reveal delay={0.15} className="mt-12 sm:mt-16">
              <div
                className="grid items-center gap-8 border border-rule bg-paper p-6 sm:p-8 lg:grid-cols-12 lg:gap-10"
                style={{ "--acc": categoryAccent(product.category) } as React.CSSProperties}
              >
              <div className="relative aspect-square overflow-hidden bg-paper-deep lg:col-span-2">
                {product.image ? (
                  <Image
                    src={product.image}
                    alt={product.imageLabel || product.name}
                    fill
                    sizes="(max-width: 1024px) 100vw, 16vw"
                    className="object-cover"
                  />
                ) : (
                  <ProductPlate name={product.name} category={product.category} seed={product.slug} size="sm" />
                )}
              </div>
              <div className="lg:col-span-6">
                <p className="flex items-center gap-2 text-[0.625rem] font-semibold tracking-[0.22em] text-[var(--acc)] uppercase">
                  <span aria-hidden className="size-[5px] rotate-45 bg-[var(--acc)]" />
                  Dall&apos;e-shop
                </p>
                <h3 className="font-display mt-2 text-[1.5rem] leading-tight font-semibold tracking-[-0.02em] text-brown-950">
                  Preferisci il carrello?
                </h3>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-brown-700">
                  La stessa porchetta, al chilo, con ritiro in bottega o spedizione. Comoda se la
                  vuoi insieme al resto della spesa.
                </p>
                <Link
                  href={`/negozio/${product.slug}`}
                  className="tap mt-4 inline-flex items-center gap-2 text-sm font-semibold text-gold-deep underline-draw"
                >
                  Scheda prodotto
                  <ArrowRight className="size-4" />
                </Link>
              </div>
              <div className="lg:col-span-4">
                <p className="ticket inline-block bg-[color-mix(in_oklab,var(--acc)_11%,var(--paper-warm))] px-3 py-1.5 text-lg font-semibold text-brown-950 tabular-nums">
                  {formatEuro(product.priceCents!)}
                  {product.unit && <span className="font-normal text-taupe"> / {product.unit}</span>}
                </p>
                <AddToCartButton
                  product={{
                    slug: product.slug,
                    name: product.name,
                    priceCents: product.priceCents!,
                    unit: product.unit,
                    image: product.image,
                  }}
                  stock={product.stock}
                  withQuantity
                />
              </div>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* In breve — the ledger and the three steps. Replaces the two cards that
          used to say "every Saturday" and "book by Friday" in prose: the same
          facts, read off the settings, with the ones the cards left out. */}
      <section className="bg-paper px-5 py-16 sm:px-8 sm:py-24 lg:px-12">
        <div className="mx-auto grid max-w-[88rem] gap-14 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <SectionMark n="I">Le cose da sapere</SectionMark>
            <h2 className="font-display display-md mt-6 font-semibold text-brown-950">
              In breve
            </h2>
            <div className="mt-8 border-t border-rule">
              {facts.map((f) => (
                <LeaderRow key={f.label} label={f.label} value={f.value} className="border-b border-rule" />
              ))}
            </div>
          </Reveal>

          <div className="lg:col-span-7">
            <Reveal>
              <SectionMark n="II">Come funziona</SectionMark>
              <h2 className="font-display display-md mt-6 font-semibold text-brown-950">
                Tre passaggi, nessun anticipo
              </h2>
            </Reveal>
            <RevealStagger className="mt-8 grid gap-px border border-rule bg-rule sm:grid-cols-3">
              {howItWorks.map((step, i) => (
                <RevealStaggerItem key={step.title} className="flex flex-col bg-paper p-6 sm:p-7">
                  <span className="font-display text-4xl leading-none font-semibold tracking-[-0.03em] text-rule-strong tabular-nums">
                    0{i + 1}
                  </span>
                  <h3 className="font-display mt-6 text-[1.25rem] leading-tight font-semibold tracking-[-0.02em] text-brown-950">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-brown-700">{step.text}</p>
                </RevealStaggerItem>
              ))}
            </RevealStagger>
            <Reveal className="mt-8 flex flex-wrap items-center gap-3">
              <CTA href="#prenota" tone="primary">
                Prenota ora
              </CTA>
              <CTA href="/sedi" tone="outline">
                Orari e indirizzi
              </CTA>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Eredità */}
      <section className="relative overflow-hidden bg-brown-900 px-5 py-16 sm:px-8 sm:py-24">
        <div aria-hidden className="ember absolute inset-0" />
        <div className="relative mx-auto grid max-w-[88rem] grid-cols-1 items-center gap-16 lg:grid-cols-2 lg:gap-24">
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
                <p className="text-[11px] font-bold tracking-widest text-cream/65 uppercase">
                  Nel forno, per ore
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-display text-4xl font-bold wonk text-gold">100% locale</p>
                <p className="text-[11px] font-bold tracking-widest text-cream/65 uppercase">
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
                src="/images/spiedini-verdure-banco.jpg"
                alt="Spiedini di carne, zucchine e peperoni preparati a mano al banco"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 480px"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Processo */}
      <section id="processo" className="scroll-mt-24 bg-cream px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-[88rem]">
          <Reveal className="mb-16 text-center sm:mb-24">
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
                  {/* The step images are shop-editable, so any of them can end
                      up pointing at a photo that is not ours. Renders nothing
                      for the bottega photography. */}
                  <PhotoCredit src={step.image} />
                </div>
                <h3 className="font-display mb-4 text-[1.5rem] leading-tight font-semibold tracking-[-0.02em] text-brown-950">
                  {step.title}
                </h3>
                <p className="leading-relaxed text-brown-700">{step.text}</p>
              </RevealStaggerItem>
            ))}
          </RevealStagger>
        </div>
      </section>

      {/* Il sapore perfetto */}
      <section className="relative overflow-hidden bg-brown-950 px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-[88rem]">
          <Reveal>
            <div className="cinematic-shadow group relative h-[480px] overflow-hidden sm:h-[600px]">
              {/* The band promises three things — crosta croccante, carne
                  morbida, erbe — and used to show `salumi-appesi-stagionatura`:
                  culatte and capocolli on their hooks. That is the bottega, but
                  it is not porchetta, and it is the one photograph on this page
                  that answers none of the sentence beside it. A whole roast
                  tied on the board, cut open at one end, says all three at once.

                  Stand-in from Wikimedia Commons until one of ours is
                  photographed, like `porchetta-al-forno.jpg` above it. The CC BY
                  credit is keyed off the `src` in `PhotoCredit`, so it travels
                  with the file rather than with this component. */}
              <Image
                src="/images/porchetta-crosta-croccante.jpg"
                alt="Porchetta intera legata sul tagliere, la crosta dorata e il taglio che scopre la carne"
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
              {/* Bottom-right, so it never lands on the copy in the corner
                  opposite. */}
              <PhotoCredit src="/images/porchetta-crosta-croccante.jpg" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Galleria */}
      <section className="bg-paper px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-[88rem]">
          <Reveal className="mb-12 space-y-6 sm:mb-16">
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

      {/* Domande frequenti.
          These four answers already existed on this page — but only inside
          `faqSchema`, which is a note to a search engine and invisible to the
          person standing on the page with exactly those questions. Declaring
          an FAQPage for text nobody can read is also the one thing Google asks
          you not to do, so the markup and the band now say the same thing. */}
      <Faq
        items={faq}
        className="bg-paper-warm"
        eyebrow="Domande frequenti"
        title={
          <>
            Prima di <span className="wonk text-gold-deep">prenotare</span>
          </>
        }
        intro={`Il resto ve lo diciamo volentieri al telefono: la porchetta si prenota anche così, entro ${cutoffDayName}.`}
        aside={
          <div className="space-y-2">
            {roasting.map((shop) =>
              shop.phone ? (
                <a
                  key={shop.slug}
                  href={telHref(shop.phone)}
                  className="group flex items-baseline gap-3 border-b border-rule py-3 text-[0.8125rem] text-taupe transition-colors hover:text-brown-950"
                >
                  <Phone className="size-3.5 shrink-0 translate-y-0.5 text-gold-deep" aria-hidden />
                  <span className="font-medium text-brown-950">{shop.name}</span>
                  <span className="font-display ml-auto text-[1.0625rem] font-semibold tracking-[-0.01em] text-brown-950 tabular-nums transition-colors group-hover:text-gold-deep">
                    {shop.phone}
                  </span>
                </a>
              ) : null
            )}
          </div>
        }
      />

      {/* CTA finale */}
      <section className="bg-paper-warm py-16 sm:py-28">
        <Reveal className="mx-auto max-w-4xl px-8 text-center">
          <h2 className="font-display display-lg mb-12 font-semibold text-brown-950">
            Pronto ad <span className="wonk text-gold-deep">assaggiarla?</span>
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <CTA href="#prenota" tone="gold">
              Prenota per {pickupDayName}
            </CTA>
            {onSale ? (
              <CTA href={`/negozio/${product.slug}`} tone="outline">
                <ShoppingBag className="size-4" />
                Ordina online
              </CTA>
            ) : (
              <CTA href="/sedi" tone="outline">
                Visita le botteghe
              </CTA>
            )}
          </div>
        </Reveal>
      </section>
    </div>
  );
}
