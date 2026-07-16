/**
 * Central site configuration. Values that differ per environment come from env
 * (see lib/env.ts); everything else is a stable brand constant.
 */
import { env } from "./env";

export const siteConfig = {
  name: "Norcineria Taccalite",
  shortName: "Taccalite",
  legalName: "Norcineria Taccalite",
  founded: 1946,
  tagline: "Norcineria artigianale ad Ancona dal 1946",
  description:
    "Norcineria Taccalite: formaggi, salumi, carni selezionate e la nostra porchetta artigianale. Due negozi nel cuore di Ancona.",
  locale: "it_IT",
  lang: "it",
  url: env.siteUrl,
  email: "norcineriataccalitepaolo@gmail.com",
  address: {
    locality: "Ancona",
    region: "Marche",
    country: "IT",
  },
  social: {
    instagram: "https://www.instagram.com/norcineriataccalite.centro",
    facebook: "https://www.facebook.com/p/Norcineria-Taccalite-100054657690138/",
  },
} as const;

/** Absolute URL helper (for canonical/OG/JSON-LD). */
export function absoluteUrl(path = "/"): string {
  const base = siteConfig.url.replace(/\/$/, "");
  return path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}
