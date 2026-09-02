import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, categories } from "@/lib/db/schema";
import { slugify } from "@/lib/slug";
import { parseAllergens } from "@/lib/allergens";
import { setProductStock } from "@/lib/stock";
import { DEFAULT_VAT_BPS } from "@/lib/fiscal";

/**
 * Catalogue CSV import.
 *
 * Products was the only list in the admin with neither an export nor an import,
 * so a seasonal price update across 200 SKUs meant 200 form saves. The importer
 * reads exactly what the exporter writes, matching on `slug`, so the round trip
 * is: export → edit in a spreadsheet → import.
 *
 * Deliberately conservative:
 *  - only columns actually present in the file are touched, so a two-column
 *    "slug,prezzoEuros" sheet is a valid price update and leaves everything else
 *    alone;
 *  - a row whose slug is unknown is reported, not silently created, unless the
 *    caller opts into creation;
 *  - the whole file is validated before anything is written, so a typo on row 90
 *    doesn't leave rows 1–89 applied and the rest not.
 */

export type ImportIssue = { row: number; message: string };

export type ImportPlan = {
  updates: {
    id: string;
    slug: string;
    name: string;
    changes: Record<string, unknown>;
    /** On-hand before the import, so a `giacenza` cell can be ledgered as a move. */
    stockBefore: number | null;
  }[];
  creates: { slug: string; values: Record<string, unknown> }[];
  issues: ImportIssue[];
  /** Columns recognised in the header, in file order. */
  columns: string[];
};

/** Header name → product column, matching the export. */
const COLUMNS: Record<string, string> = {
  slug: "slug",
  nome: "name",
  sede: "shopSlug",
  categoria: "category",
  prezzoeuros: "priceCents",
  costoeuros: "costCents",
  ivapercento: "vatRateBps",
  unita: "unit",
  apeso: "soldByWeight",
  giacenza: "stock",
  sogliariordino: "reorderPoint",
  sku: "sku",
  fornitore: "supplier",
  allergeni: "allergens",
  acquistabile: "purchasable",
  attivo: "active",
  inevidenza: "featured",
  ordine: "sortOrder",
};

const BOOLEAN_COLS = new Set(["soldByWeight", "purchasable", "active", "featured"]);
/** Free text in the file, a canonical key list in the column. */
const ALLERGEN_COLS = new Set(["allergens"]);
const MONEY_COLS = new Set(["priceCents", "costCents"]);
const INT_COLS = new Set(["stock", "reorderPoint", "sortOrder"]);

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Minimal RFC-4180 line splitter: handles quoted fields and doubled quotes.
 * The exporter also prefixes formula-looking cells with `'`, which is stripped.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === "," || c === ";") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim().replace(/^'/, ""));
}

const isTrue = (v: string) => ["si", "sì", "yes", "true", "1", "x"].includes(v.trim().toLowerCase());
const isFalse = (v: string) => ["no", "false", "0", ""].includes(v.trim().toLowerCase());

/**
 * Parse and validate a CSV against the current catalogue, WITHOUT writing.
 * The caller shows the plan, then applies it.
 */
export async function planProductImport(
  csv: string,
  opts: { create?: boolean; defaultShopSlug?: string } = {},
): Promise<ImportPlan> {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  const issues: ImportIssue[] = [];
  if (lines.length < 2) {
    return { updates: [], creates: [], columns: [], issues: [{ row: 0, message: "Il file è vuoto." }] };
  }

  const header = splitCsvLine(lines[0]).map(norm);
  const mapped = header.map((h) => COLUMNS[h] ?? null);
  if (!mapped.includes("slug")) {
    return {
      updates: [],
      creates: [],
      columns: [],
      issues: [{ row: 1, message: "Manca la colonna «slug»: serve per riconoscere i prodotti." }],
    };
  }
  const columns = mapped.filter((c): c is string => c !== null);

  const existing = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      stock: products.stock,
      archivedAt: products.archivedAt,
    })
    .from(products);
  const bySlug = new Map(existing.map((p) => [p.slug, p]));

  const updates: ImportPlan["updates"] = [];
  const creates: ImportPlan["creates"] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const rowNo = i + 1;
    const cells = splitCsvLine(lines[i]);
    const values: Record<string, unknown> = {};
    let slug = "";
    let bad = false;

    for (let c = 0; c < mapped.length; c++) {
      const col = mapped[c];
      if (!col) continue;
      const raw = (cells[c] ?? "").trim();

      if (col === "slug") {
        slug = slugify(raw);
        continue;
      }
      // A blank cell means "leave as is" — not "set to empty". That is what
      // makes a two-column price sheet safe.
      if (raw === "") continue;

      if (ALLERGEN_COLS.has(col)) {
        // Resolved against the fourteen of Annex II exactly as the product form
        // does, so a sheet saying "Latte, glutine" and a form with those two
        // boxes ticked produce the same row. Anything outside the fourteen is
        // kept rather than dropped — losing an allergen from a food product to
        // tidy an import would be the worse failure by a distance.
        values[col] = parseAllergens(raw);
      } else if (BOOLEAN_COLS.has(col)) {
        if (!isTrue(raw) && !isFalse(raw)) {
          issues.push({ row: rowNo, message: `«${raw}» non è si/no nella colonna ${header[c]}.` });
          bad = true;
          continue;
        }
        values[col] = isTrue(raw);
      } else if (MONEY_COLS.has(col)) {
        const n = Number(raw.replace(",", "."));
        if (!Number.isFinite(n) || n < 0) {
          issues.push({ row: rowNo, message: `Importo non valido nella colonna ${header[c]}: «${raw}».` });
          bad = true;
          continue;
        }
        values[col] = Math.round(n * 100);
      } else if (col === "vatRateBps") {
        const n = Number(raw.replace(",", "."));
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          issues.push({ row: rowNo, message: `Aliquota IVA non valida: «${raw}».` });
          bad = true;
          continue;
        }
        values[col] = Math.round(n * 100);
      } else if (INT_COLS.has(col)) {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) {
          issues.push({ row: rowNo, message: `Numero non valido nella colonna ${header[c]}: «${raw}».` });
          bad = true;
          continue;
        }
        values[col] = n;
      } else {
        values[col] = raw;
      }
    }

    if (bad) continue;
    if (!slug) {
      issues.push({ row: rowNo, message: "Slug mancante." });
      continue;
    }
    if (seen.has(slug)) {
      issues.push({ row: rowNo, message: `Lo slug «${slug}» compare più di una volta nel file.` });
      continue;
    }
    seen.add(slug);

    const match = bySlug.get(slug);
    if (match) {
      if (Object.keys(values).length === 0) continue; // nothing to change
      // Archived is out of the catalogue by definition, and every storefront
      // query filters on `active` alone — so a sheet saying `attivo=si` for an
      // archived slug used to put it back on sale while the gestionale went on
      // calling it archived. The quick toggles and the product form both refuse
      // this already; the importer was the way round them.
      if (match.archivedAt) {
        const revived = (["active", "featured", "purchasable"] as const).filter((k) => values[k] === true);
        if (revived.length > 0) {
          issues.push({
            row: rowNo,
            message: `«${slug}» è archiviato: ripristinalo dalla scheda prima di riattivarlo da file.`,
          });
          continue;
        }
      }
      updates.push({ id: match.id, slug, name: match.name, changes: values, stockBefore: match.stock });
    } else if (opts.create) {
      const shopSlug = (values.shopSlug as string) || opts.defaultShopSlug;
      if (!shopSlug) {
        issues.push({ row: rowNo, message: `«${slug}» è nuovo ma non ha una sede.` });
        continue;
      }
      if (!values.name) {
        issues.push({ row: rowNo, message: `«${slug}» è nuovo ma non ha un nome.` });
        continue;
      }
      creates.push({ slug, values: { ...values, slug, shopSlug } });
    } else {
      issues.push({ row: rowNo, message: `Slug sconosciuto: «${slug}».` });
    }
  }

  return { updates, creates, issues, columns };
}

/**
 * Resolve the `categoria` column (a name, all the CSV knows) onto the taxonomy.
 *
 * Matched case-insensitively against the existing categories rather than
 * creating one: an import that could mint categories would re-introduce exactly
 * the silent forking the `categories` table was added to stop. A name that
 * matches nothing keeps its text and leaves `categoryId` null, which the
 * categories page counts and reports as "senza categoria".
 */
function withCategoryId(
  values: Record<string, unknown>,
  byName: Map<string, string>,
): Record<string, unknown> {
  if (!("category" in values)) return values;
  const name = String(values.category ?? "").trim();
  return { ...values, categoryId: name ? (byName.get(name.toLowerCase()) ?? null) : null };
}

/**
 * The VAT rate a *newly created* row gets when the file didn't say.
 *
 * `categories.defaultVatRateBps` is declared, not inferred — but the only thing
 * that honoured it was a client-side handler on the new-product form, so a
 * product minted by this importer under a 22 % category silently took the 10 %
 * column default. Under-declaring VAT is the one mistake this codebase has
 * already made once.
 */
function withDefaultVat(
  values: Record<string, unknown>,
  vatByName: Map<string, number>,
): Record<string, unknown> {
  if ("vatRateBps" in values) return values;
  const name = String(values.category ?? "").trim().toLowerCase();
  return { ...values, vatRateBps: (name ? vatByName.get(name) : undefined) ?? DEFAULT_VAT_BPS };
}

/**
 * Apply a validated plan. Returns what actually changed.
 *
 * `giacenza` is the one column that does **not** go in with the rest: a plain
 * UPDATE on `products.stock` moves on-hand while leaving no movement behind it,
 * so an import used to break the ledger's only promise — that the history sums
 * to the balance — and to skip the back-in-stock mail and the low-stock re-arm
 * with it. Quantities are collected here and pushed through `setProductStock`
 * once the transaction has committed, because that path sends email and email
 * has no business inside a write lock.
 */
export async function applyProductImport(
  plan: ImportPlan,
  byUserId?: string | null,
): Promise<{ updated: number; created: number }> {
  let updated = 0;
  let created = 0;

  const cats = await db
    .select({ id: categories.id, name: categories.name, defaultVatRateBps: categories.defaultVatRateBps })
    .from(categories)
    .where(eq(categories.kind, "product"));
  const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
  const vatByName = new Map(
    cats.flatMap((c) => (c.defaultVatRateBps == null ? [] : [[c.name.toLowerCase(), c.defaultVatRateBps] as const])),
  );

  const moves: { productId: string; from: number | null; to: number | null }[] = [];

  // One transaction so a half-applied import can't leave the catalogue in a
  // state the preview never showed the user.
  await db.transaction(async (tx) => {
    for (const u of plan.updates) {
      const { stock, ...rest } = withCategoryId(u.changes, byName);
      if (stock !== undefined) {
        moves.push({ productId: u.id, from: u.stockBefore, to: stock as number });
      }
      if (Object.keys(rest).length > 0) {
        await tx.update(products).set(rest).where(eq(products.id, u.id));
      }
      updated += 1;
    }
    for (const c of plan.creates) {
      const { stock, ...rest } = withDefaultVat(withCategoryId(c.values, byName), vatByName);
      // Opens at zero so the figure from the sheet is ledgered as an opening
      // movement rather than appearing with no history.
      const [row] = await tx
        .insert(products)
        .values({ ...rest, stock: stock == null ? null : 0 } as typeof products.$inferInsert)
        .returning({ id: products.id });
      if (row && stock != null) moves.push({ productId: row.id, from: 0, to: stock as number });
      created += 1;
    }
  });

  for (const m of moves) {
    await setProductStock({ ...m, reason: "Import catalogo", byUserId });
  }

  return { updated, created };
}
