import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin, Phone } from "lucide-react";
import { shopIsOpenNow } from "@/lib/hours";
import type { getShops } from "@/lib/db/queries";

type Shop = Awaited<ReturnType<typeof getShops>>[number];

/** Which end of town this bottega sits in — the split the brief asked for. */
const placement: Record<string, string> = {
  centro: "In centro",
  carni: "Al Mercato del Piano",
};

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export default function DueBotteghe({ shops }: { shops: Shop[] }) {
  return (
    <section className="bg-paper">
      <div className="mx-auto max-w-[88rem] px-5 pt-12 pb-10 sm:px-8 sm:pt-20 lg:px-12">
        <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
          <span aria-hidden className="h-px w-10 bg-gold" />
          Le sedi
        </p>
        <div className="mt-7 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <h2 className="font-display display-lg max-w-2xl font-semibold text-brown-950">
            Due botteghe, <span className="wonk text-gold-deep">una sola famiglia</span>
          </h2>
          <p className="max-w-sm text-base leading-relaxed text-brown-700">
            Una in piazza, una al mercato. Stessa cura, banchi diversi: scegli quella
            più vicina a te.
          </p>
        </div>
      </div>

      {/* Full-bleed split. On a wide screen the hovered half takes the space —
          the panels are siblings in a flex row, so one growing is the other
          yielding, which is the whole gesture. */}
      <div className="flex flex-col lg:h-[78vh] lg:min-h-[34rem] lg:flex-row">
        {shops.map((shop) => {
          const open = shopIsOpenNow(shop);
          return (
            <Link
              key={shop.slug}
              href={`/sedi/${shop.slug}`}
              className="group relative flex min-h-[26rem] flex-1 items-end overflow-hidden transition-[flex-grow] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none lg:hover:grow-[1.35] lg:focus-visible:grow-[1.35]"
            >
              <Image
                src={shop.image || "/images/salumi-appesi-stagionatura.jpg"}
                alt={shop.imageLabel || shop.name}
                fill
                sizes="(max-width: 1024px) 100vw, 55vw"
                className="object-cover transition-transform duration-[1.6s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
              />
              {/* Warm scrim, lifted on hover. It is doing double duty: it makes
                  white type legible and it evens out photos shot years apart. */}
              <div className="absolute inset-0 bg-gradient-to-t from-brown-950/92 via-brown-950/55 to-brown-950/25 transition-opacity duration-700 group-hover:opacity-85" />
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-px bg-cream/10 lg:inset-y-0 lg:right-0 lg:left-auto lg:h-auto lg:w-px"
              />

              <div className="relative w-full p-8 sm:p-12 lg:p-14">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[0.625rem] font-semibold tracking-[0.24em] text-gold uppercase">
                    {placement[shop.slug] ?? shop.specialty}
                  </span>
                  {open && (
                    <span className="inline-flex items-center gap-2 rounded-full bg-cream/12 px-3 py-1 text-[0.625rem] font-semibold tracking-[0.14em] text-cream uppercase backdrop-blur-sm">
                      <span
                        aria-hidden
                        className={`size-1.5 rounded-full ${open.open ? "bg-ok" : "bg-tan"}`}
                      />
                      {open.open ? "Aperto adesso" : "Chiuso adesso"}
                    </span>
                  )}
                </div>

                <h3 className="font-display mt-5 text-[2rem] leading-[1.03] font-semibold tracking-[-0.03em] text-cream sm:text-[2.75rem]">
                  {shop.name}
                </h3>
                <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-cream/70">
                  {shop.tagline}
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-2 text-[0.8125rem] text-cream/65">
                  <span className="flex items-center gap-2.5">
                    <MapPin className="size-3.5 text-cream/40" aria-hidden />
                    {shop.address}
                  </span>
                  {shop.phone && (
                    <span className="flex items-center gap-2.5">
                      <Phone className="size-3.5 text-cream/40" aria-hidden />
                      {shop.phone}
                    </span>
                  )}
                </div>

                <span className="mt-8 inline-flex items-center gap-3 border-b border-gold/50 pb-1 text-[0.6875rem] font-semibold tracking-[0.2em] text-gold uppercase transition-[gap] duration-500 group-hover:gap-5">
                  Scopri di più
                  <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* The phone numbers again, tappable, outside the photo — a link inside a
          link is invalid, so they can't live in the panels above.

          This used to be a thin line of grey text floating in white with a
          section's worth of empty page under it, which read as a mistake. It is
          a band now: same information, given the weight a phone number deserves
          on the page of a shop people actually ring. */}
      <div className="border-b border-rule bg-paper-warm">
        <div className="mx-auto flex max-w-[88rem] flex-col gap-3.5 px-5 py-6 sm:flex-row sm:items-center sm:gap-10 sm:px-8 sm:py-7 lg:px-12">
          <p className="flex shrink-0 items-center gap-3.5 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
            <span aria-hidden className="h-px w-8 bg-gold" />
            Chiamaci
          </p>
          {/* Rows with a box of their own on a phone, an inline pair above it.
              As bare text these were 26px-tall targets, and a `tel:` link is the
              single most valuable thing on this page to somebody holding a
              phone — it is the one action the device does better than the
              desktop does. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-10 sm:gap-y-3">
            {shops.map((shop) =>
              shop.phone ? (
                <a
                  key={shop.slug}
                  href={telHref(shop.phone)}
                  className="group flex items-baseline gap-3 border border-rule bg-paper px-4 py-3 text-[0.8125rem] text-taupe transition-colors hover:text-brown-950 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
                >
                  <Phone
                    className="size-3.5 shrink-0 translate-y-0.5 text-gold-deep"
                    aria-hidden
                  />
                  <span className="font-medium text-brown-950">{shop.name}</span>
                  <span className="font-display text-[1.0625rem] font-semibold tracking-[-0.01em] text-brown-950 tabular-nums transition-colors group-hover:text-gold-deep">
                    {shop.phone}
                  </span>
                </a>
              ) : null
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
