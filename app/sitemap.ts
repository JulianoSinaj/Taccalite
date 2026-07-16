import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";
import { getShops, getBlogPosts } from "@/lib/db/queries";

// Read shop/blog URLs from the DB at request time, not at build (empty build-time DB).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [shops, blogPosts] = await Promise.all([getShops(), getBlogPosts()]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/negozi"), lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: absoluteUrl("/porchetta"), lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: absoluteUrl("/negozio"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: absoluteUrl("/blog"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl("/prenotazioni"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl("/account"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/privacy"), lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/cookie"), lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  const shopRoutes: MetadataRoute.Sitemap = shops.map((shop) => ({
    url: absoluteUrl(`/negozi/${shop.slug}`),
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

  return [...staticRoutes, ...shopRoutes, ...blogRoutes];
}
