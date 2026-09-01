import JsonLd from "@/components/JsonLd";
import Hero from "@/components/site/home/Hero";
import ChiSiamo from "@/components/site/home/ChiSiamo";
import DueBotteghe from "@/components/site/home/DueBotteghe";
import ProdottiMigliori from "@/components/site/home/ProdottiMigliori";
import Porchetta from "@/components/site/home/Porchetta";
import Servizi from "@/components/site/home/Servizi";
import Marche, { DEFAULT_BRANDS } from "@/components/site/home/Marche";
import OggiAlBanco from "@/components/site/home/OggiAlBanco";
import Diario, { type DiarioPost } from "@/components/site/home/Diario";
import InstagramFeed from "@/components/InstagramFeed";
import type { ProductTileData } from "@/components/site/ProductTile";
import { organizationSchema, shopSchema } from "@/lib/seo";
import { shopIsOpenNow } from "@/lib/hours";
import { getInstagramFeedForSite } from "@/lib/instagram";
import { siteConfig } from "@/lib/site";
import {
  getShops,
  getFeaturedProducts,
  getPurchasableProducts,
  getBlogPosts,
  getSetting,
} from "@/lib/db/queries";
import { siteLines, siteRecords } from "@/lib/site-content";
import type { Servizio } from "@/components/site/home/Servizi";
import type { Ingrediente } from "@/components/site/home/Porchetta";

export const dynamic = "force-dynamic";

/** "martedì 19 agosto" — for the daily counter strip. */
function todayLabel() {
  return new Date().toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Comma-separated setting → trimmed, non-empty entries. */
function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * The four products the homepage leads with.
 *
 * Only things a visitor can actually buy: a tile with no price has nothing to
 * offer on a page whose job is to get an order started. Featured products come
 * first (the shop chose them), topped up from the rest of the catalogue, and
 * within that the ones with a photograph lead — half the catalogue has none, and
 * a row that opens with four fallbacks reads as an empty shop.
 */
function pickProducts(
  featured: Awaited<ReturnType<typeof getFeaturedProducts>>,
  purchasable: Awaited<ReturnType<typeof getPurchasableProducts>>
): ProductTileData[] {
  const seen = new Set<string>();
  const ordered = [...featured, ...purchasable].filter((p) => {
    if (seen.has(p.slug)) return false;
    seen.add(p.slug);
    return p.purchasable && p.priceCents != null;
  });

  return ordered
    .sort((a, b) => Number(Boolean(b.image)) - Number(Boolean(a.image)))
    .slice(0, 4)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      image: p.image,
      imageLabel: p.imageLabel,
      priceCents: p.priceCents,
      unit: p.unit,
      stock: p.stock,
      purchasable: p.purchasable,
      origin: p.origin,
    }));
}

export default async function Home() {
  const [shops, featured, purchasable, posts, brandsSetting, todaySetting, instagram] =
    await Promise.all([
      getShops(),
      getFeaturedProducts(),
      getPurchasableProducts(),
      getBlogPosts(),
      getSetting<string>("home.brands", DEFAULT_BRANDS),
      getSetting<string>("home.today", ""),
      getInstagramFeedForSite(),
    ]);

  const products = pickProducts(featured, purchasable);

  const diario: DiarioPost[] = posts.slice(0, 3).map((post) => ({
    slug: post.slug,
    title: post.title,
    date: post.date,
    category: post.category,
    excerpt: post.excerpt,
    image: post.image,
    dateLabel: dateLabel(post.date),
  }));

  const brands = splitList(brandsSetting);
  const today = splitList(todaySetting);

  // Editorial copy that used to be arrays in these components; each falls back
  // to exactly the text it had, so an untouched install renders unchanged.
  const [facts, servizi, ricetta] = await Promise.all([
    siteLines("home.hero.facts"),
    siteRecords("home.servizi"),
    siteRecords("home.porchetta.ricetta"),
  ]);

  // The hero's live badge speaks for the shop as a whole: open if either
  // bottega is serving right now.
  const openStates = shops.map((shop) => shopIsOpenNow(shop));
  const known = openStates.filter((s) => s !== null);
  const openNow = known.length > 0 ? known.some((s) => s!.open) : null;

  return (
    <>
      <JsonLd schema={[organizationSchema(), ...shops.map(shopSchema)]} />
      <Hero openNow={openNow} facts={facts} />
      <OggiAlBanco items={today} dateLabel={todayLabel()} />
      <ChiSiamo />
      <Servizi servizi={servizi as Servizio[]} />
      <DueBotteghe shops={shops} />
      <ProdottiMigliori products={products} />
      <Porchetta ricetta={ricetta as Ingrediente[]} />
      <Marche brands={brands} />
      <Diario posts={diario} />
      <InstagramFeed
        posts={instagram.posts}
        profile={instagram.profile}
        handle={siteConfig.social.instagramHandle}
        url={siteConfig.social.instagram}
      />
    </>
  );
}
