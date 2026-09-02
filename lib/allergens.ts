/**
 * The fourteen allergens, as a controlled vocabulary.
 *
 * EU Reg. 1169/2011 Annex II names exactly fourteen substances that have to be
 * declared, and `products.allergens` has always carried that comment — but the
 * field was a free-text box split on commas, so what actually reached the
 * column was whatever somebody typed. "Latte", "latte", "lattosio" and a
 * mistyped "late" were four different allergens as far as the database was
 * concerned, nothing could answer "which products contain nuts", and a typo on
 * a food label is not a cosmetic defect.
 *
 * Deliberately isomorphic (no `server-only`, no DB): the product form is a
 * client component and has to offer exactly the vocabulary the action stores,
 * and the storefront has to render it back. One list, three readers.
 *
 * Unknown text is **kept, not dropped**. Existing rows were written before this
 * module existed, and a shop may genuinely need to declare something outside
 * Annex II; losing an allergen on a food page to tidy up a data model would be
 * the worse failure by a distance.
 */

export const EU_ALLERGENS = [
  { key: "glutine", label: "Glutine" },
  { key: "crostacei", label: "Crostacei" },
  { key: "uova", label: "Uova" },
  { key: "pesce", label: "Pesce" },
  { key: "arachidi", label: "Arachidi" },
  { key: "soia", label: "Soia" },
  { key: "latte", label: "Latte" },
  { key: "frutta-a-guscio", label: "Frutta a guscio" },
  { key: "sedano", label: "Sedano" },
  { key: "senape", label: "Senape" },
  { key: "sesamo", label: "Semi di sesamo" },
  { key: "solfiti", label: "Anidride solforosa e solfiti" },
  { key: "lupini", label: "Lupini" },
  { key: "molluschi", label: "Molluschi" },
] as const;

export type AllergenKey = (typeof EU_ALLERGENS)[number]["key"];

const LABELS = new Map<string, string>(EU_ALLERGENS.map((a) => [a.key, a.label]));

/**
 * Spellings that mean one of the fourteen.
 *
 * Not an attempt at natural language — just the forms the shop actually writes,
 * plus the label of each allergen so pasting the rendered text back in works.
 * Anything not listed here stays as its own value rather than being guessed at.
 */
const ALIASES = new Map<string, AllergenKey>([
  ["cereali", "glutine"],
  ["cereali-contenenti-glutine", "glutine"],
  ["frumento", "glutine"],
  ["grano", "glutine"],
  ["lattosio", "latte"],
  ["latticini", "latte"],
  ["derivati-del-latte", "latte"],
  ["uovo", "uova"],
  ["noci", "frutta-a-guscio"],
  ["mandorle", "frutta-a-guscio"],
  ["nocciole", "frutta-a-guscio"],
  ["pistacchi", "frutta-a-guscio"],
  ["semi-di-sesamo", "sesamo"],
  ["anidride-solforosa", "solfiti"],
  ["anidride-solforosa-e-solfiti", "solfiti"],
  ["solfiti-e-anidride-solforosa", "solfiti"],
  ["arachide", "arachidi"],
  ["mollusco", "molluschi"],
  ["crostaceo", "crostacei"],
  ["lupino", "lupini"],
]);

/** Lowercase, unaccented, hyphenated — the shape keys and aliases are written in. */
function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Resolve one written allergen to what should be stored.
 *
 * Returns a canonical key when the text names one of the fourteen (by key,
 * by label, or by a listed alias), and the normalised text otherwise.
 */
export function normaliseAllergen(raw: string): string {
  const key = normalise(raw);
  if (!key) return "";
  if (LABELS.has(key)) return key;
  const alias = ALIASES.get(key);
  if (alias) return alias;
  // A label typed or pasted in full, e.g. "Anidride solforosa e solfiti".
  const byLabel = EU_ALLERGENS.find((a) => normalise(a.label) === key);
  return byLabel ? byLabel.key : key;
}

/**
 * Parse the form's allergen field(s) into the list to store.
 *
 * Accepts the checkbox values and the free-text "altro" box together — the
 * action collapses both into one comma-separated string — so a shop can tick
 * the fourteen and still add something of its own. Order follows Annex II
 * first, then anything extra, so two products with the same allergens store
 * them identically and a diff of the audit log stays readable.
 */
export function parseAllergens(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[,\n]/)) {
    const key = normaliseAllergen(part);
    if (key) seen.add(key);
  }
  const known = EU_ALLERGENS.filter((a) => seen.has(a.key)).map((a) => a.key as string);
  const extra = [...seen].filter((k) => !LABELS.has(k)).sort();
  return [...known, ...extra];
}

/** How a stored allergen is written on the shelf and on the page. */
export function allergenLabel(stored: string): string {
  return LABELS.get(stored) ?? stored.replace(/-/g, " ");
}

/** Everything stored that isn't one of the fourteen, for the "altro" box. */
export function extraAllergens(stored: readonly string[]): string[] {
  return stored.filter((a) => !LABELS.has(a));
}
