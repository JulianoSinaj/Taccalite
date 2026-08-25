import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * Resolved per request, exactly like `app/sitemap.ts`.
 *
 * Without this Next prerenders robots.txt at build time and freezes
 * `absoluteUrl()` into the output. That is wrong for every deploy whose domain
 * isn't known at build: `.dockerignore` excludes `.env`, so the image is built
 * with no `NEXT_PUBLIC_SITE_URL` at all and ships a robots.txt hardcoded to the
 * production fallback — pointing crawlers at a sitemap on some other host, with
 * no way to correct it short of a rebuild. The sitemap it advertises was already
 * dynamic, so the two disagreed.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/account", "/api/", "/checkout"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
