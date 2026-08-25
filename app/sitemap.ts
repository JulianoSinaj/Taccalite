import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";
import {
  getShops,
  getBlogPosts,
  getPurchasableProducts,
  getProductCategories,
} from "@/lib/db/queries";

// Read shop/blog URLs from the DB at request time, not at build (empty build-time DB).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [shops, blogPosts, products, categories] = await Promise.all([
    getShops(),
    getBlogPosts(),
    getPurchasableProducts(),
    getProductCategories(),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/sedi"), lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: absoluteUrl("/la-nostra-storia"), lastModified: now, changeFrequency: "yearly", priority: 0.7 },
    { url: absoluteUrl("/contatti"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/porchetta"), lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: absoluteUrl("/negozio"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: absoluteUrl("/blog"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl("/prenotazioni"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl("/account"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/privacy"), lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/cookie"), lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/termini"), lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  const shopRoutes: MetadataRoute.Sitemap = shops.map((shop) => ({
    url: absoluteUrl(`/sedi/${shop.slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const blogRoutes: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: absoluteUrl(`/blog/${post.slug}`),
    lastModified: new Date(post.date),
    changeFrequency: "yearly",
    priority: 0.6,
  }));

  // Only categories that currently hold something on sale — `getProductCategories`
  // already filters to those, so an empty grouping never reaches the sitemap.
  const categoryRoutes: MetadataRoute.Sitemap = categories.map((c) => ({
    url: absoluteUrl(`/negozio/categoria/${c.slug}`),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.75,
  }));

  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: absoluteUrl(`/negozio/${p.slug}`),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...shopRoutes, ...categoryRoutes, ...productRoutes, ...blogRoutes];
}
