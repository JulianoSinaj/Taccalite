/**
 * Category → colour.
 *
 * The storefront's one non-brown colour decision, and it is an editorial one:
 * a hue on this site always answers "what kind of thing is this?", never
 * "look here". Salumi are the red of a cut salame, formaggi the yellow of
 * saffron, cantina the near-black of wine in a glass — the shop's own pantry
 * rather than a picked palette.
 *
 * The values live in `app/globals.css` as `--acc-*` so a plate, an eyebrow and
 * a filter chip all pull from one place; this module only decides *which* one,
 * and hands back a `var(...)` reference the caller assigns to `--acc`.
 */

const ACCENTS = {
  salumi: "var(--acc-salumi)",
  carni: "var(--acc-carni)",
  formaggi: "var(--acc-formaggi)",
  gastronomia: "var(--acc-gastronomia)",
  cantina: "var(--acc-cantina)",
  regalo: "var(--acc-regalo)",
  casa: "var(--acc-casa)",
} as const;

/** Lowercase, unaccented, trimmed — the DB stores "Specialità della casa". */
function normalise(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * The accent for a product category, as a CSS `var()` to assign to `--acc`.
 *
 * Matching is by keyword rather than equality: categories are free text the shop
 * types in the gestionale, so "Formaggi freschi" and "Formaggi" have to land on
 * the same colour, and anything genuinely new falls back to the house gold
 * instead of rendering uncoloured.
 */
export function categoryAccent(category: string): string {
  const key = normalise(category);
  if (!key) return ACCENTS.casa;

  // The counter.
  if (key.includes("salum")) return ACCENTS.salumi;
  if (key.includes("carn") || key.includes("macell")) return ACCENTS.carni;
  if (key.includes("formagg") || key.includes("caseari")) return ACCENTS.formaggi;
  if (key.includes("gastronom") || key.includes("cucina")) return ACCENTS.gastronomia;
  if (key.includes("cantina") || key.includes("vin")) return ACCENTS.cantina;
  if (key.includes("regal") || key.includes("cest")) return ACCENTS.regalo;

  // The diary, which files its posts under a different vocabulary entirely.
  // Without these every story fell through to the house gold, and a page of
  // twelve posts came out one colour — the very thing the accents exist to fix.
  if (key.includes("ricett")) return ACCENTS.gastronomia;
  if (key.includes("bottega") || key.includes("negozi")) return ACCENTS.carni;
  if (key.includes("stori") || key.includes("tradizion")) return ACCENTS.cantina;
  if (key.includes("avvis") || key.includes("orari")) return ACCENTS.salumi;
  if (key.includes("prodott") || key.includes("arriv") || key.includes("novit"))
    return ACCENTS.regalo;

  return ACCENTS.casa;
}

/**
 * Which of the three engravings a plate uses.
 *
 * Keyed off the slug so it is stable across renders and across the grid → detail
 * navigation (the plate must not change pattern mid-morph), and spread enough
 * that neighbouring tiles rarely repeat.
 */
export function plateEngraving(seed: string): "plate-hatch" | "plate-rings" | "plate-rules" {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return (["plate-hatch", "plate-rings", "plate-rules"] as const)[hash % 3];
}
