import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Clock,
  Flame,
  History,
  Mail,
  Map,
  MapPin,
  Mountain,
  Phone,
  ThumbsUp,
} from "lucide-react";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import { shops, featuredProducts } from "@/lib/data";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return shops.map((shop) => ({ slug: shop.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const shop = shops.find((s) => s.slug === slug);
  if (!shop) return {};
  return {
    title: `${shop.name} — Norcineria Taccalite`,
    description: shop.tagline,
  };
}

const productImages: Record<string, string> = {
  "porchetta-artigianale":
    "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&q=80&w=800",
  "ciauscolo-igp":
    "https://images.unsplash.com/photo-1541529086526-db283c563270?auto=format&fit=crop&q=80&w=800",
  "pecorino-di-fossa":
    "https://images.unsplash.com/photo-1452195100486-9cc805987862?auto=format&fit=crop&q=80&w=800",
  "bistecca-marchigiana":
    "https://images.unsplash.com/photo-1615937657715-bc7b4b7962c1?auto=format&fit=crop&q=80&w=800",
};

const shopContent: Record<
  string,
  {
    heroLead: string;
    heroItalic: string;
    storyImage: string;
    storyImageAlt: string;
    features: { icon: "mountain" | "thumbs" | "map" | "history" | "flame"; title: string; caption: string }[];
  }
> = {
  centro: {
    heroLead: "Benvenuto nel nostro",
    heroItalic: "paradiso dei formaggi",
    storyImage:
      "https://images.unsplash.com/photo-1624806992066-5ffcf7ca186b?auto=format&fit=crop&q=80&w=1200",
    storyImageAlt: "Il banco dei formaggi",
    features: [
      { icon: "mountain", title: "Formaggio di fossa", caption: "Stagionature naturali" },
      { icon: "thumbs", title: "Selezionati a mano", caption: "Controllo qualità" },
      { icon: "map", title: "Da tutta Italia", caption: "Piccoli produttori" },
      { icon: "history", title: "Tradizione garantita", caption: "Dal 1946" },
    ],
  },
  carni: {
    heroLead: "Il cuore pulsante della",
    heroItalic: "tradizione norcina",
    storyImage:
      "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&q=80&w=1200",
    storyImageAlt: "La lavorazione artigianale delle carni",
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

export default async function ShopDetailPage({ params }: Params) {
  const { slug } = await params;
  const shop = shops.find((s) => s.slug === slug);
  if (!shop) notFound();

  const content = shopContent[shop.slug];
  const otherShop = shops.find((s) => s.slug !== slug);
  const shopProducts = featuredProducts.filter((p) => p.shopSlug === slug);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `Norcineria Taccalite, ${shop.address}`
  )}`;

  return (
    <div>
      {/* Hero */}
      <section className="relative flex h-[85vh] items-end overflow-hidden bg-brown-950 px-5 pb-16 sm:px-10 sm:pb-24">
        <div className="absolute inset-0">
          <Image
            src={shop.image}
            alt={shop.name}
            fill
            preload
            className="scale-110 object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-brown-950 via-brown-950/30 to-transparent" />
        </div>
        <Reveal className="relative z-10 mx-auto w-full max-w-7xl">
          <nav className="mb-6 text-[10px] font-bold tracking-[0.4em] text-gold/70 uppercase">
            <Link href="/" className="hover:text-gold">
              Home
            </Link>{" "}
            /{" "}
            <Link href="/negozi" className="hover:text-gold">
              I Negozi
            </Link>{" "}
            / {shop.name}
          </nav>
          <span className="eyebrow mb-6 block">{shop.specialty}</span>
          <h1 className="font-display mb-4 text-5xl leading-none tracking-tighter text-white sm:text-6xl md:text-8xl">
            {content.heroLead}
            <br />
            <span className="text-gold italic">{content.heroItalic}</span>
          </h1>
          <p className="max-w-2xl text-xl font-light text-cream/70">{shop.tagline}</p>
        </Reveal>
      </section>

      {/* Info band */}
      <section className="relative z-10 bg-brown-900 px-5 py-16 sm:px-10">
        <RevealStagger className="mx-auto grid max-w-7xl grid-cols-1 gap-8 md:grid-cols-3">
          <RevealStaggerItem className="rounded-[28px] border border-white/5 bg-brown-800/40 p-8">
            <Clock className="mb-6 size-8 text-gold" />
            <h3 className="mb-4 text-sm font-bold tracking-widest text-cream uppercase">
              Orari di apertura
            </h3>
            <ul className="space-y-1 text-sm leading-relaxed text-cream/75">
              {shop.hours.map((h) => (
                <li key={h.label}>
                  {h.label}: {h.value}
                </li>
              ))}
            </ul>
            {!shop.hoursConfirmed && (
              <p className="mt-3 text-xs text-cream/55">Orari da confermare in negozio.</p>
            )}
          </RevealStaggerItem>
          <RevealStaggerItem className="rounded-[28px] border border-white/5 bg-brown-800/40 p-8">
            <Phone className="mb-6 size-8 text-gold" />
            <h3 className="mb-4 text-sm font-bold tracking-widest text-cream uppercase">
              Contatti diretti
            </h3>
            <div className="space-y-2 text-sm leading-relaxed text-cream/75">
              <a href={`tel:${shop.phone.replace(/\s/g, "")}`} className="block hover:text-gold">
                T: {shop.phone}
              </a>
              <a href={`mailto:${shop.email}`} className="block break-all hover:text-gold">
                E: {shop.email}
              </a>
            </div>
          </RevealStaggerItem>
          <RevealStaggerItem className="rounded-[28px] border border-white/5 bg-brown-800/40 p-8">
            <MapPin className="mb-6 size-8 text-gold" />
            <h3 className="mb-4 text-sm font-bold tracking-widest text-cream uppercase">
              Indirizzo
            </h3>
            <p className="text-sm leading-relaxed text-cream/75">
              {shop.address}
              <br />
              Marche, Italia
            </p>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-xs font-bold tracking-widest text-gold uppercase hover:text-cream"
            >
              Apri in Google Maps
              <ArrowRight className="size-3.5" />
            </a>
          </RevealStaggerItem>
        </RevealStagger>
      </section>

      {/* Chi siamo */}
      <section className="bg-cream px-5 py-32 text-brown-950 sm:px-10 sm:py-48">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-16 lg:flex-row lg:gap-24">
          <Reveal className="w-full space-y-10 lg:w-1/2">
            <div className="space-y-6">
              <span className="eyebrow eyebrow-dark block">Dedizione e qualità</span>
              <h2 className="font-display text-4xl leading-[0.95] tracking-tighter sm:text-5xl md:text-7xl">
                Chi siamo
              </h2>
            </div>
            <p className="max-w-xl text-xl leading-relaxed font-light text-brown-900/75">
              {shop.description}
            </p>
            <ul className="space-y-4">
              {shop.highlights.map((h) => (
                <li key={h} className="flex items-start gap-4 text-brown-900/80">
                  <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-dark" />
                  {h}
                </li>
              ))}
            </ul>
            <div className="flex gap-12 pt-4">
              <div className="text-center">
                <p className="font-display text-4xl font-bold text-gold-deep italic">1946</p>
                <p className="text-[10px] font-bold tracking-widest uppercase opacity-70">Dal</p>
              </div>
              <div className="text-center">
                <p className="font-display text-4xl font-bold text-gold-deep italic">3</p>
                <p className="text-[10px] font-bold tracking-widest uppercase opacity-70">
                  Generazioni
                </p>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.15} className="w-full lg:w-1/2">
            <div className="relative">
              <div className="cinematic-shadow relative z-10 aspect-[4/5] overflow-hidden rounded-[32px]">
                <Image
                  src={content.storyImage}
                  alt={content.storyImageAlt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Prodotti */}
      {shopProducts.length > 0 && (
        <section className="bg-cream-dark px-5 py-32 sm:px-10 sm:py-48">
          <div className="mx-auto max-w-7xl">
            <Reveal className="mb-16 text-center sm:mb-24">
              <span className="eyebrow eyebrow-dark mb-6 block">Da questo negozio</span>
              <h2 className="font-display text-5xl tracking-tighter text-brown-950 sm:text-6xl">
                I tesori della dispensa
              </h2>
            </Reveal>
            <RevealStagger
              className={`grid grid-cols-1 gap-8 sm:grid-cols-2 ${
                shopProducts.length > 2 ? "lg:grid-cols-3" : "lg:mx-auto lg:max-w-4xl"
              }`}
            >
              {shopProducts.map((product) => (
                <RevealStaggerItem
                  key={product.slug}
                  className="group card-shadow-soft rounded-[32px] bg-white p-6 transition-all duration-700 hover:-translate-y-4"
                >
                  <div className="relative mb-6 aspect-square overflow-hidden rounded-2xl">
                    <Image
                      src={productImages[product.slug]}
                      alt={product.name}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                      sizes="(max-width: 640px) 100vw, 33vw"
                    />
                  </div>
                  <h4 className="font-display mb-2 text-2xl text-brown-950">{product.name}</h4>
                  <p className="mb-6 text-sm leading-relaxed text-brown-900/70">{product.description}</p>
                  <span className="inline-block rounded-full bg-brown-900/5 px-3 py-1 text-[10px] font-bold tracking-widest text-brown-800/85 uppercase">
                    In negozio · online a breve
                  </span>
                </RevealStaggerItem>
              ))}
            </RevealStagger>
          </div>
        </section>
      )}

      {/* Perché sceglierci */}
      <section className="bg-brown-950 px-5 py-24 sm:px-10 sm:py-32">
        <RevealStagger className="mx-auto grid max-w-7xl grid-cols-2 gap-12 text-center lg:grid-cols-4">
          {content.features.map((feature) => {
            const Icon = featureIcons[feature.icon];
            return (
              <RevealStaggerItem key={feature.title} className="space-y-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gold/10 text-gold">
                  <Icon className="size-7" />
                </div>
                <h5 className="font-display text-xl text-cream">{feature.title}</h5>
                <p className="text-xs tracking-widest text-cream/65 uppercase">{feature.caption}</p>
              </RevealStaggerItem>
            );
          })}
        </RevealStagger>
      </section>

      {/* Contatti / prenota */}
      <section className="bg-cream px-5 py-32 sm:px-10 sm:py-48">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <div className="cinematic-shadow relative h-[420px] overflow-hidden rounded-[40px] sm:h-[520px]">
              <Image
                src={shop.image}
                alt={shop.imageLabel}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-brown-950/50 to-transparent" />
              <div className="absolute bottom-8 left-8">
                <p className="font-display text-3xl text-white">{shop.name}</p>
                <p className="text-sm text-cream/70">{shop.address}</p>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.15} className="card-shadow-soft rounded-[40px] bg-white p-10 sm:p-16">
            <h3 className="font-display mb-6 text-3xl text-brown-950 sm:text-4xl">
              Vieni a trovarci per una degustazione
            </h3>
            <p className="mb-10 text-lg leading-relaxed text-brown-900/75">
              Il nostro banco è a tua disposizione per consigli, assaggi e ordini speciali.
              Chiamaci o prenota un tavolo per un&apos;esperienza guidata.
            </p>
            <div className="space-y-4">
              <Link
                href="/prenotazioni"
                data-magnetic
                className="inline-flex w-full items-center justify-center rounded-full bg-gold px-8 py-4 text-sm font-semibold text-brown-950 shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-all duration-500 hover:-translate-y-1 hover:bg-gold-dark"
              >
                Prenota un tavolo
              </Link>
              <a
                href={`tel:${shop.phone.replace(/\s/g, "")}`}
                className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-brown-900/20 px-8 py-4 text-sm font-semibold text-brown-950 transition-colors hover:bg-brown-950 hover:text-cream"
              >
                <Phone className="size-4" />
                {shop.phone}
              </a>
              <a
                href={`mailto:${shop.email}`}
                className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-brown-900/20 px-8 py-4 text-sm font-semibold break-all text-brown-950 transition-colors hover:bg-brown-950 hover:text-cream"
              >
                <Mail className="size-4" />
                Scrivici
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Cross-shop CTA */}
      {otherShop && (
        <section className="bg-brown-900 px-5 py-24 sm:px-10 sm:py-32">
          <Reveal className="mx-auto max-w-7xl">
            <Link
              href={`/negozi/${otherShop.slug}`}
              className="group cinematic-shadow relative block h-96 overflow-hidden rounded-[40px]"
            >
              <Image
                src={otherShop.image}
                alt={otherShop.name}
                fill
                className="object-cover transition-transform duration-[2s] group-hover:scale-105"
                sizes="100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-brown-950 via-brown-950/60 to-transparent" />
              <div className="relative flex h-full max-w-2xl flex-col justify-center space-y-6 p-8 sm:p-16">
                <span className="eyebrow">Scopri l&apos;altro negozio</span>
                <h3 className="font-display text-3xl text-white sm:text-5xl">
                  {otherShop.name}:
                  <br />
                  {otherShop.specialty}
                </h3>
                <p className="text-cream/75">{otherShop.tagline}</p>
                <span className="inline-flex w-fit items-center rounded-full bg-gold px-8 py-3.5 text-sm font-semibold text-brown-950 shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)]">
                  Visita il negozio
                </span>
              </div>
            </Link>
          </Reveal>
        </section>
      )}
    </div>
  );
}
