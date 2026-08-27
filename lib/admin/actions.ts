"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resolveSlug } from "@/lib/slug";
import { isLowStock } from "@/lib/inventory";
import { applyStockChange } from "@/lib/stock";
import {
  products,
  categories,
  blogPosts,
  shops,
  rewards,
  redemptions,
  newsletterSubscribers,
  settings,
  stockMovements,
  orderItems,
  users,
} from "@/lib/db/schema";
import { requireAdmin, requireRole } from "@/lib/auth/session";
import { getSetting } from "@/lib/db/queries";
import { addPoints } from "@/lib/loyalty";
import { sendMail } from "@/lib/mail/mailer";
import { redemptionStatusEmail } from "@/lib/mail/templates";
import { smtpConfigured } from "@/lib/env";
import { saveUploadedImage } from "@/lib/media";
import { logAudit } from "@/lib/audit";
import { parseStructuredHours } from "@/lib/hours";
import { planProductImport, applyProductImport } from "@/lib/admin/product-import";
import { notifyBackInStock } from "@/lib/stock-notify";
import { subscribeNewsletter } from "@/lib/newsletter";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import {
  parseForm,
  productInput,
  blogInput,
  shopInput,
  rewardInput,
  redemptionStatusInput,
  pointsInput,
  settingInput,
  stockAdjustInput,
} from "@/lib/validation/admin";
import { requireShopScope } from "@/lib/admin/scope";
import { adminShopReferences } from "@/lib/admin/queries";

// Parse "Label | Value" lines into hours; blank-separated lines into a list.
function parseHours(raw?: string) {
  return (raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...rest] = line.split("|");
      return { label: label.trim(), value: rest.join("|").trim() };
    });
}
function parseLines(raw?: string) {
  return (raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * If the form carried an uploaded image file (`imageFile`), store it on the
 * persisted volume and overwrite the `image` field with its served path. Call
 * AFTER the auth check. A blank/absent file leaves the pasted `image` URL as-is.
 */
async function applyImageUpload(fd: FormData): Promise<void> {
  const file = fd.get("imageFile");
  if (file instanceof File && file.size > 0) {
    try {
      fd.set("image", await saveUploadedImage(file));
    } catch (e) {
      throw new ActionError(e instanceof Error ? e.message : "Caricamento immagine non riuscito.");
    }
  }
}

// NB: reservation actions live in `lib/admin/reservation-actions.ts`.

/** €12.34 for a cents value, or "—". Used in audit summaries. */
const eur = (c: number | null | undefined) => (c == null ? "—" : `${(c / 100).toFixed(2)} €`);

/**
 * Describe what actually changed between two records, for an audit summary.
 *
 * Only the fields listed are compared, so an audit line reads as the decisions
 * an operator made ("prezzo 8,50 € → 9,00 €") rather than a diff of every
 * column. Returns [] when nothing tracked changed.
 */
type AuditField = { key: string; label: string; format?: (v: unknown) => string };

function describeChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  fields: readonly AuditField[],
): string[] {
  if (!before) return [];
  const show = (f: AuditField, v: unknown) =>
    f.format ? f.format(v) : v === null || v === undefined || v === "" ? "—" : String(v);
  const out: string[] = [];
  for (const f of fields) {
    // A field the caller doesn't set (not part of this form) can't have changed.
    if (!(f.key in after)) continue;
    const a = before[f.key];
    const b = after[f.key];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    out.push(`${f.label} ${show(f, a)} → ${show(f, b)}`);
  }
  return out;
}

/** The product fields worth a line in the audit log. */
const PRODUCT_AUDITED = [
  { key: "name", label: "nome" },
  { key: "priceCents", label: "prezzo", format: (v: unknown) => eur(v as number | null) },
  { key: "costCents", label: "costo", format: (v: unknown) => eur(v as number | null) },
  { key: "vatRateBps", label: "IVA", format: (v: unknown) => `${(v as number) / 100}%` },
  { key: "stock", label: "giacenza" },
  { key: "reorderPoint", label: "soglia riordino" },
  { key: "sku", label: "SKU" },
  { key: "supplier", label: "fornitore" },
  { key: "purchasable", label: "in vendita online" },
  { key: "active", label: "attivo" },
  { key: "shopSlug", label: "sede" },
] as const;

// ── Products ─────────────────────────────────────────────────────────────────
/**
 * Resolve the posted category into the pair every consumer needs: the FK, and
 * the denormalised name that the storefront filters, the CSV export and the IVA
 * report still read.
 *
 * `categoryId` (from the picker) wins. `name` is the CSV importer's path — it
 * only knows the text in the file — and is matched case-insensitively against
 * the existing categories rather than inventing one, so an import cannot
 * silently re-fork the taxonomy the way free text used to.
 */
async function resolveCategory(
  kind: "product" | "post",
  categoryId: string | undefined,
  name: string | undefined,
): Promise<{ categoryId: string | null; category: string }> {
  if (categoryId) {
    const [row] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
    if (row && row.kind === kind) return { categoryId: row.id, category: row.name };
  }
  const wanted = (name ?? "").trim();
  if (!wanted) return { categoryId: null, category: "" };
  const rows = await db.select().from(categories).where(eq(categories.kind, kind));
  const match = rows.find((c) => c.name.toLowerCase() === wanted.toLowerCase());
  // No match: keep the text so nothing is lost, and leave the FK null. Those
  // rows are counted as "senza categoria" on /admin/categories.
  return match ? { categoryId: match.id, category: match.name } : { categoryId: null, category: wanted };
}

export async function saveProduct(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    await applyImageUpload(fd);
    const d = parseForm(productInput, fd);
    // Restocking above the low-stock threshold via the editor clears the alert
    // stamp so a future dip can alert again.
    const threshold = await getSetting<number>("store.lowStockThreshold", 5);
    // Restocking above the product's own reorder point (or the shop default)
    // clears the alert stamp so a future dip can alert again.
    const clearLowStock =
      d.stock != null && !isLowStock({ stock: d.stock, reorderPoint: d.reorderPoint }, threshold);
    const cat = await resolveCategory("product", d.categoryId, d.category);
    const values = {
      // A readable slug from the product name, so catalogue URLs are
      // /negozio/salame-di-cinta rather than a random id.
      slug: await resolveSlug({
        table: products,
        slugColumn: products.slug,
        idColumn: products.id,
        explicit: d.slug,
        fallbackText: d.name,
        excludeId: d.id,
      }),
      name: d.name,
      shopSlug: d.shopSlug,
      category: cat.category,
      categoryId: cat.categoryId,
      description: d.description ?? "",
      imageLabel: d.imageLabel ?? "",
      image: d.image ?? "",
      priceCents: d.priceEuros,
      // Something sold by weight is priced per kg unless told otherwise.
      unit: d.unit ?? (d.soldByWeight ? "kg" : null),
      vatRateBps: d.vatRate,
      soldByWeight: d.soldByWeight,
      // Allergens accepted as a comma/newline separated list, stored as an array.
      allergens: (d.allergens ?? "")
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      origin: d.origin ?? null,
      ingredients: d.ingredients ?? null,
      purchasable: d.purchasable,
      stock: d.stock,
      reorderPoint: d.reorderPoint,
      costCents: d.costEuros,
      sku: d.sku ?? null,
      supplier: d.supplier ?? null,
      seoTitle: d.seoTitle ?? null,
      seoDescription: d.seoDescription ?? null,
      ...(clearLowStock ? { lowStockNotifiedAt: null } : {}),
      featured: d.featured,
      active: d.active,
      sortOrder: d.sortOrder,
    };
    let productId = d.id;
    if (d.id) {
      // Detect an out-of-stock → available transition to trigger back-in-stock mail.
      const [prev] = await db.select().from(products).where(eq(products.id, d.id)).limit(1);
      // Both ends of the move: an operator confined to one location may neither
      // edit another shop's product nor reassign one of their own away.
      await requireShopScope(prev?.shopSlug);
      await requireShopScope(d.shopSlug);
      // Archived means out of the catalogue, whatever the form's toggles say:
      // the flags come back only through "Ripristina", never as a side effect
      // of saving an edit.
      if (prev?.archivedAt) Object.assign(values, { active: false, purchasable: false, featured: false });
      await db.update(products).set(values).where(eq(products.id, d.id));
      if (prev && (prev.stock ?? 0) <= 0 && d.stock != null && d.stock > 0) {
        await notifyBackInStock(d.id, prev.name, prev.slug);
      }
      // Price, cost and VAT changes are exactly what an audit trail exists for:
      // without this a margin or a shelf price could move with no record of who
      // moved it. Silent when nothing tracked changed, so saving an unedited
      // form doesn't pollute the log.
      const changes = describeChanges(prev, values, [...PRODUCT_AUDITED]);
      if (changes.length > 0) {
        await logAudit({
          actor,
          action: "product.update",
          entity: "product",
          entityId: d.id,
          summary: `Prodotto ${values.name}: ${changes.join(", ")}`,
          meta: { priceCents: values.priceCents, costCents: values.costCents, stock: values.stock },
        });
      }
    } else {
      const [created] = await db.insert(products).values(values).returning({ id: products.id });
      productId = created?.id;
      await logAudit({
        actor,
        action: "product.create",
        entity: "product",
        entityId: productId,
        summary: `Prodotto creato: ${values.name} — ${eur(values.priceCents)}`,
        meta: { priceCents: values.priceCents, vatRateBps: values.vatRateBps, stock: values.stock },
      });
    }
    revalidatePath("/admin/products");
    revalidatePath("/negozio");
    return ok(d.id ? "Prodotto salvato." : "Prodotto creato.");
  });
}

/**
 * The product a row-level action targets, checked against the viewer's scope.
 *
 * The list is confined to the operator's location; the toggles under it were
 * not, so another sede's product was one hidden `id` away from being switched
 * off, featured, archived or deleted. `saveProduct` and `adjustStock` already
 * refuse — this brings the quick actions in line.
 */
async function productForAction(fd: FormData) {
  const id = (fd.get("id") ?? "").toString();
  const [row] = await db
    .select({
      id: products.id,
      name: products.name,
      shopSlug: products.shopSlug,
      archivedAt: products.archivedAt,
    })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!row) throw new ActionError("Prodotto non trovato.");
  await requireShopScope(row.shopSlug);
  return row;
}

/** Quick list-row toggle: activate/deactivate a product. */
export async function toggleProductActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const row = await productForAction(fd);
    const active = fd.get("active") === "true";
    // Archived is out of the catalogue by definition. Activating one produced a
    // row that read "attivo" and appeared nowhere.
    if (active && row.archivedAt) {
      throw new ActionError(`"${row.name}" è archiviato: ripristinalo prima di attivarlo.`);
    }
    await db.update(products).set({ active }).where(eq(products.id, row.id));
    await logAudit({
      actor,
      action: "product.active",
      entity: "product",
      entityId: row.id,
      summary: `Prodotto ${row.name} ${active ? "attivato" : "disattivato"}`,
      meta: { active },
    });
    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${row.id}`);
    revalidatePath("/negozio");
    return ok(active ? "Prodotto attivato." : "Prodotto disattivato.");
  });
}

/** Quick list-row toggle: feature/unfeature a product. */
export async function toggleProductFeatured(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const row = await productForAction(fd);
    const featured = fd.get("featured") === "true";
    if (featured && row.archivedAt) {
      throw new ActionError(`"${row.name}" è archiviato: ripristinalo prima di metterlo in evidenza.`);
    }
    await db.update(products).set({ featured }).where(eq(products.id, row.id));
    await logAudit({
      actor,
      action: "product.featured",
      entity: "product",
      entityId: row.id,
      summary: `Prodotto ${row.name} ${featured ? "messo in evidenza" : "rimosso dalle evidenze"}`,
      meta: { featured },
    });
    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${row.id}`);
    revalidatePath("/negozio");
    return ok(featured ? "Prodotto messo in evidenza." : "Prodotto rimosso dalle evidenze.");
  });
}

const BULK_PRODUCT_OPS = ["attiva", "disattiva", "evidenza", "no-evidenza", "archivia", "ripristina"] as const;

/**
 * One gesture over a selection of catalogue rows.
 *
 * Runs the single-row action per id, so scope, the archived guard and the
 * audit line are exactly what a click on that row would have produced; a
 * refused row is reported and skipped rather than failing the batch.
 */
export async function bulkUpdateProducts(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const ids = fd.getAll("ids").map(String).filter(Boolean);
    const op = String(fd.get("status") ?? "");
    if (ids.length === 0) throw new ActionError("Seleziona almeno un prodotto.");
    if (!BULK_PRODUCT_OPS.includes(op as (typeof BULK_PRODUCT_OPS)[number])) {
      throw new ActionError("Questa operazione non è disponibile in blocco.");
    }

    let changed = 0;
    const failures: string[] = [];
    for (const id of ids) {
      const single = new FormData();
      single.set("id", id);
      let res: ActionState;
      switch (op) {
        case "attiva":
        case "disattiva":
          single.set("active", op === "attiva" ? "true" : "false");
          res = await toggleProductActive({ status: "idle" }, single);
          break;
        case "evidenza":
        case "no-evidenza":
          single.set("featured", op === "evidenza" ? "true" : "false");
          res = await toggleProductFeatured({ status: "idle" }, single);
          break;
        default:
          single.set("restore", op === "ripristina" ? "true" : "false");
          res = await archiveProduct({ status: "idle" }, single);
      }
      if (res.status === "error") failures.push(res.message ?? id);
      else changed += 1;
    }

    revalidatePath("/admin/products");
    revalidatePath("/negozio");
    if (failures.length > 0) {
      return ok(
        `${changed} prodotti aggiornati, ${failures.length} saltati (${failures[0]}${
          failures.length > 1 ? " …" : ""
        }).`,
      );
    }
    return ok(`${changed} prodotti aggiornati.`);
  });
}

/**
 * Copy a product into a new, switched-off row and open it for editing.
 *
 * A variant (the same salame in a different cut) shares almost every field
 * with its sibling; retyping twenty of them was the alternative. The copy is
 * inactive, not purchasable, not featured and tracks no stock — nothing on the
 * storefront changes until somebody finishes it and turns it on.
 */
export async function duplicateProduct(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let newId: string | undefined;
  const res = await runAction(async () => {
    const actor = await requireAdmin();
    const target = await productForAction(fd);
    const [src] = await db.select().from(products).where(eq(products.id, target.id)).limit(1);
    if (!src) throw new ActionError("Prodotto non trovato.");
    // Everything but identity and lifecycle stamps.
    const { id: _id, createdAt: _createdAt, lowStockNotifiedAt: _n, archivedAt: _a, ...copy } = src;
    void _id; void _createdAt; void _n; void _a;
    const name = `${src.name} (copia)`;
    const [created] = await db
      .insert(products)
      .values({
        ...copy,
        name,
        slug: await resolveSlug({
          table: products,
          slugColumn: products.slug,
          idColumn: products.id,
          fallbackText: name,
        }),
        active: false,
        purchasable: false,
        featured: false,
        stock: null,
      })
      .returning({ id: products.id });
    newId = created?.id;
    await logAudit({
      actor,
      action: "product.create",
      entity: "product",
      entityId: newId,
      summary: `Prodotto creato: ${name} — copia di ${src.name}`,
      meta: { copiedFrom: src.id, priceCents: src.priceCents, vatRateBps: src.vatRateBps },
    });
    revalidatePath("/admin/products");
    return ok("Copia creata.");
  });
  // Outside `runAction`: a redirect is thrown, and the wrapper would report it
  // as an unexpected error.
  if (res.status === "success" && newId) redirect(`/admin/products/${newId}`);
  return res;
}

/**
 * Archive a product: it leaves the catalogue and every picker but keeps its id,
 * its movement ledger and its order lines.
 *
 * This is the default because deleting cascades `stock_movements` away
 * (schema.ts), destroying the quantity history a stock ledger exists to keep.
 * Hard deletion stays available for a product that was never sold — see
 * `deleteProduct`.
 */
export async function archiveProduct(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const row = await productForAction(fd);
    const restore = fd.get("restore") === "true";
    if (restore && !row.archivedAt) return ok(`"${row.name}" non è archiviato.`);
    if (!restore && row.archivedAt) return ok(`"${row.name}" è già archiviato.`);

    await db
      .update(products)
      .set(
        restore
          ? // Back in the catalogue, and active in the gestionale so it does
            // not reappear as a greyed-out row nobody asked for. The storefront
            // flags stay off: restoring never silently puts something on sale.
            { archivedAt: null, active: true }
          : // An archived product must not stay purchasable on the storefront.
            { archivedAt: new Date(), active: false, purchasable: false, featured: false },
      )
      .where(eq(products.id, row.id));

    await logAudit({
      actor,
      action: restore ? "product.restore" : "product.archive",
      entity: "product",
      entityId: row.id,
      summary: `Prodotto ${row.name} ${restore ? "ripristinato dall'archivio" : "archiviato"}`,
    });
    revalidatePath("/admin/products");
    // Also reachable from the product's own page, which has to re-read the
    // archive stamp it renders the button from.
    revalidatePath(`/admin/products/${row.id}`);
    revalidatePath("/negozio");
    return ok(
      restore
        ? "Prodotto ripristinato e attivo. Vendita online ed evidenza restano spente: riattivale dalla scheda se servono."
        : "Prodotto archiviato.",
    );
  });
}

/**
 * Permanently delete a product. Refuses once the product has been sold or has a
 * movement history — that data would be cascaded away with it, and archiving is
 * the right answer for anything that ever existed commercially.
 */
export async function deleteProduct(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const row = await productForAction(fd);
    const id = row.id;

    const [{ sold }] = await db
      .select({ sold: sql<number>`count(*)` })
      .from(orderItems)
      .where(eq(orderItems.productId, id));
    const [{ moves }] = await db
      .select({ moves: sql<number>`count(*)` })
      .from(stockMovements)
      .where(eq(stockMovements.productId, id));

    if (sold > 0 || moves > 0) {
      throw new ActionError(
        `"${row.name}" ha uno storico (${sold} righe d'ordine, ${moves} movimenti di magazzino): archivialo invece di eliminarlo, così lo storico resta consultabile.`,
      );
    }

    await db.delete(products).where(eq(products.id, id));
    await logAudit({
      actor,
      action: "product.delete",
      entity: "product",
      entityId: id,
      summary: `Prodotto eliminato: ${row.name} (mai venduto)`,
    });
    revalidatePath("/admin/products");
    return ok("Prodotto eliminato.");
  });
}

/**
 * Adjust a product's stock by a signed delta and record a movement in the ledger.
 * Staff-permitted (in-shop inventory management). The product must already track
 * stock (stock not null). Restocking above the low-stock threshold clears the
 * alert stamp so a future dip can re-alert (the reset the order flow deferred).
 */
export async function adjustStock(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(stockAdjustInput, fd);

    const [product] = await db.select().from(products).where(eq(products.id, d.productId)).limit(1);
    if (!product) throw new ActionError("Prodotto non trovato.");
    await requireShopScope(product.shopSlug);
    if (product.stock == null) {
      throw new ActionError("Questo prodotto non traccia le scorte. Imposta prima una giacenza dalla scheda.");
    }

    // A stocktake writes the counted figure; an adjustment applies a delta.
    // Both go through the one atomic helper, so neither can lose an update to a
    // concurrent order finalize the way the old read-compute-write did.
    const stocktake = d.mode === "conteggio";
    const change = await applyStockChange({
      productId: d.productId,
      delta: stocktake ? 0 : d.delta,
      setTo: stocktake ? d.delta : undefined,
      reason: d.reason || (stocktake ? "Conteggio inventario" : ""),
      byUserId: actor.id,
    });
    if (!change) throw new ActionError("Prodotto non trovato o senza giacenza.");
    if (change.applied === 0) {
      return ok(
        stocktake
          ? `La giacenza era già ${change.stockAfter}: nessuna rettifica registrata.`
          : "Nessuna variazione da applicare.",
      );
    }

    // The low-stock reset and the back-in-stock mail used to be written out
    // here. They now live in `applyStockChange`, so every path that raises stock
    // does them — receiving a lot, correcting one, a cancellation restocking,
    // a CSV import — instead of only the two that remembered.

    await logAudit({
      actor,
      action: stocktake ? "stock.stocktake" : "stock.adjust",
      entity: "product",
      entityId: d.productId,
      summary: stocktake
        ? `Conteggio inventario ${product.name}: ${change.stockBefore} → ${change.stockAfter} (${
            change.applied > 0 ? "+" : ""
          }${change.applied})${d.reason ? ` — ${d.reason}` : ""}`
        : `Giacenza ${product.name}: ${change.applied > 0 ? "+" : ""}${change.applied} → ${change.stockAfter}${
            d.reason ? ` (${d.reason})` : ""
          }`,
      meta: { delta: change.applied, requested: d.delta, stockAfter: change.stockAfter },
    });

    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${d.productId}`);
    revalidatePath("/negozio");
    return ok(
      change.clamped
        ? `Giacenza aggiornata: ${change.stockAfter} (applicati ${change.applied} — non può scendere sotto zero).`
        : `Giacenza aggiornata: ${change.stockAfter}.`,
    );
  });
}

/**
 * Import a catalogue CSV. Validates the whole file first, then applies it in one
 * transaction — a typo on row 90 must not leave rows 1–89 half-applied.
 */
export async function importProducts(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ActionError("Scegli un file CSV.");
    if (file.size > 2_000_000) throw new ActionError("File troppo grande (max 2 MB).");

    const plan = await planProductImport(await file.text(), {
      create: fd.get("crea") === "true",
      defaultShopSlug: String(fd.get("shopSlug") ?? "") || undefined,
    });

    // Refuse a partially-valid file rather than applying the good half: the
    // operator can fix the sheet and re-run, which is what they'd want.
    if (plan.issues.length > 0) {
      const first = plan.issues.slice(0, 3).map((i) => `riga ${i.row}: ${i.message}`);
      throw new ActionError(
        `${plan.issues.length} problemi nel file, nulla è stato importato. ${first.join(" · ")}${
          plan.issues.length > 3 ? " …" : ""
        }`,
      );
    }
    if (plan.updates.length === 0 && plan.creates.length === 0) {
      return ok("Nessuna modifica da importare: il file corrisponde già al catalogo.");
    }

    const { updated, created } = await applyProductImport(plan);

    await logAudit({
      actor,
      action: "product.import",
      entity: "product",
      summary: `Import catalogo: ${updated} prodotti aggiornati, ${created} creati (colonne: ${plan.columns.join(", ")})`,
      meta: {
        updated,
        created,
        columns: plan.columns,
        // Enough to reconstruct what a bad import did, without the whole file.
        slugs: [...plan.updates.map((u) => u.slug), ...plan.creates.map((c) => c.slug)].slice(0, 50),
      },
    });

    revalidatePath("/admin/products");
    revalidatePath("/negozio");
    return ok(`Import completato: ${updated} aggiornati, ${created} creati.`);
  });
}

/** First paragraph of a post, trimmed to a listing-friendly length. */
function excerptFrom(paragraphs: string[], max = 200): string {
  const first = paragraphs[0] ?? "";
  if (first.length <= max) return first;
  // Cut at the last word boundary before the limit so we don't split a word.
  const cut = first.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// ── Blog ─────────────────────────────────────────────────────────────────────
export async function saveBlogPost(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    await applyImageUpload(fd);
    const d = parseForm(blogInput, fd);
    const content = (d.content ?? "")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const cat = await resolveCategory("post", d.categoryId, d.category);
    const values = {
      slug: await resolveSlug({
        table: blogPosts,
        slugColumn: blogPosts.slug,
        idColumn: blogPosts.id,
        explicit: d.slug,
        fallbackText: d.title,
        excludeId: d.id,
      }),
      title: d.title,
      date: d.date || new Date().toISOString().slice(0, 10),
      category: cat.category,
      categoryId: cat.categoryId,
      // A blank excerpt is derived from the opening paragraph, so a post always
      // has something to show in listings and link previews.
      excerpt: d.excerpt ?? excerptFrom(content),
      content,
      imageLabel: d.imageLabel ?? "",
      image: d.image ?? null,
      seoTitle: d.seoTitle ?? null,
      seoDescription: d.seoDescription ?? null,
      published: d.published,
      sortOrder: d.sortOrder,
    };
    let postId = d.id;
    if (d.id) {
      await db.update(blogPosts).set(values).where(eq(blogPosts.id, d.id));
    } else {
      const [created] = await db.insert(blogPosts).values(values).returning({ id: blogPosts.id });
      postId = created?.id;
    }
    // Publishing puts text on the public site, so the who and when is worth
    // recording even though the content itself is versionless.
    await logAudit({
      actor,
      action: d.id ? "blog.update" : "blog.create",
      entity: "blog_post",
      entityId: postId,
      summary: `Articolo ${d.id ? "aggiornato" : "creato"}: "${values.title}" (${
        values.published ? `pubblicato ${values.date}` : "bozza"
      })`,
      meta: { slug: values.slug, published: values.published, date: values.date },
    });
    revalidatePath("/admin/blog");
    revalidatePath("/blog");
    return ok(d.id ? "Articolo salvato." : "Articolo creato.");
  });
}

/** Quick list-row toggle: publish/hide a blog post. */
export async function toggleBlogPublished(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = (fd.get("id") ?? "").toString();
    const published = fd.get("published") === "true";
    const [row] = await db
      .update(blogPosts)
      .set({ published })
      .where(eq(blogPosts.id, id))
      .returning({ title: blogPosts.title });
    await logAudit({
      actor,
      action: "blog.publish",
      entity: "blog_post",
      entityId: id,
      summary: `Articolo "${row?.title ?? id}" ${published ? "pubblicato" : "nascosto"}`,
      meta: { published },
    });
    revalidatePath("/admin/blog");
    revalidatePath("/blog");
    return ok(published ? "Articolo pubblicato." : "Articolo nascosto.");
  });
}

export async function deleteBlogPost(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = (fd.get("id") ?? "").toString();
    await db.delete(blogPosts).where(eq(blogPosts.id, id));
    await logAudit({ actor, action: "blog.delete", entity: "blog_post", entityId: id, summary: `Articolo eliminato (${id})` });
    revalidatePath("/admin/blog");
    return ok("Articolo eliminato.");
  });
}

// ── Shops (create/delete are admin-only) ─────────────────────────────────────
export async function saveShop(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin(); // staff+ may edit; creating a NEW shop additionally requires admin (below)
    await applyImageUpload(fd);
    const d = parseForm(shopInput, fd);
    const values = {
      name: d.name,
      specialty: d.specialty ?? "",
      tagline: d.tagline ?? "",
      description: d.description ?? "",
      address: d.address ?? "",
      hours: parseHours(d.hours),
      hoursConfirmed: d.hoursConfirmed,
      phone: d.phone ?? "",
      email: d.email ?? "",
      highlights: parseLines(d.highlights),
      image: d.image ?? "",
      imageLabel: d.imageLabel ?? "",
      hoursStructured: parseStructuredHours(d.hoursStructured),
      reservationsEnabled: d.reservationsEnabled,
      storeEnabled: d.storeEnabled,
      porchettaEnabled: d.porchettaEnabled,
      porchettaCapacityKg: d.porchettaCapacityKg,
      seatsCapacity: d.seatsCapacity,
      sortOrder: d.sortOrder,
    };
    let shopId = d.id;
    if (d.id) {
      // A shop's address, phone and hours are the public face of the business
      // and staff (not only admins) can edit them, so record what moved.
      const [prev] = await db.select().from(shops).where(eq(shops.id, d.id)).limit(1);
      if (!prev) throw new ActionError("Sede non trovata.");
      // A shop row *is* a location, so the scope applies to its own slug: a
      // counter person at one sede was able to rewrite the other's address,
      // opening hours, porchetta capacity and service toggles.
      await requireShopScope(prev.slug);
      await db.update(shops).set(values).where(eq(shops.id, d.id));
      const changes = describeChanges(prev, values, [
        { key: "name", label: "nome" },
        { key: "address", label: "indirizzo" },
        { key: "phone", label: "telefono" },
        { key: "email", label: "email" },
        { key: "hours", label: "orari", format: () => "(modificati)" },
        { key: "hoursConfirmed", label: "orari confermati" },
        { key: "reservationsEnabled", label: "prenotazioni" },
        { key: "storeEnabled", label: "store" },
        { key: "porchettaEnabled", label: "porchetta" },
        { key: "porchettaCapacityKg", label: "capacità porchetta (kg)" },
        { key: "seatsCapacity", label: "coperti per fascia" },
      ]);
      if (changes.length > 0) {
        await logAudit({
          actor,
          action: "shop.update",
          entity: "shop",
          entityId: d.id,
          summary: `Sede ${values.name}: ${changes.join(", ")}`,
        });
      }
    } else {
      await requireRole("admin");
      if (!d.slug) throw new ActionError("Slug obbligatorio per una nuova sede");
      const [created] = await db
        .insert(shops)
        .values({ ...values, slug: d.slug })
        .returning({ id: shops.id });
      shopId = created?.id;
      await logAudit({
        actor,
        action: "shop.create",
        entity: "shop",
        entityId: shopId,
        summary: `Sede creata: ${values.name} (/${d.slug})`,
      });
    }
    revalidateShopPages(d.id ? undefined : d.slug);
    return ok(d.id ? "Sede salvata." : "Sede creata.");
  });
}

/**
 * Every public page that renders a sede's data. The public route is `/sedi`
 * (not `/negozi`, which is the admin label) and the detail page is per slug.
 */
function revalidateShopPages(slug?: string) {
  revalidatePath("/admin/shops");
  revalidatePath("/sedi");
  if (slug) revalidatePath(`/sedi/${slug}`);
  revalidatePath("/contatti");
  revalidatePath("/prenotazioni");
}

export async function deleteShop(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = (fd.get("id") ?? "").toString();
    const [row] = await db
      .select({ name: shops.name, slug: shops.slug })
      .from(shops)
      .where(eq(shops.id, id))
      .limit(1);
    if (!row) throw new ActionError("Sede non trovata.");

    // Say exactly what still points at the sede. The FOREIGN KEY error below
    // only knows *that* something does, and the old message listed three of the
    // four tables — a staff account assigned to the sede blocked the delete
    // with a sentence that sent the operator looking for orders.
    const refs = await adminShopReferences(row.slug);
    const blocking = [
      refs.products > 0 && `${refs.products} ${refs.products === 1 ? "prodotto" : "prodotti"}`,
      refs.orders > 0 && `${refs.orders} ${refs.orders === 1 ? "ordine" : "ordini"}`,
      refs.reservations > 0 &&
        `${refs.reservations} ${refs.reservations === 1 ? "prenotazione" : "prenotazioni"}`,
      refs.users > 0 && `${refs.users} ${refs.users === 1 ? "utente assegnato" : "utenti assegnati"}`,
    ].filter((x): x is string => typeof x === "string");
    if (blocking.length > 0) {
      throw new ActionError(
        `Impossibile eliminare: la sede ha ancora ${blocking.join(", ")}. Riassegnali o eliminali prima.`,
      );
    }

    try {
      await db.delete(shops).where(eq(shops.id, id));
    } catch (err) {
      // Only a FOREIGN KEY failure means "still referenced" (a row created
      // between the count above and the delete). Reporting every error as one
      // sent an operator hunting for orders that don't exist.
      const message = err instanceof Error ? err.message : "";
      if (/FOREIGN KEY constraint failed/i.test(message)) {
        throw new ActionError(
          "Impossibile eliminare: la sede ha ancora dati collegati. Ricarica la pagina e riprova.",
        );
      }
      console.error("[actions] deleteShop failed:", err);
      throw new ActionError("Eliminazione non riuscita. Riprova.");
    }
    await logAudit({
      actor,
      action: "shop.delete",
      entity: "shop",
      entityId: id,
      summary: `Sede eliminata: ${row.name}`,
    });
    revalidateShopPages(row.slug);
    return ok("Sede eliminata.");
  });
}

// ── Rewards ──────────────────────────────────────────────────────────────────
export async function saveReward(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    await applyImageUpload(fd);
    const d = parseForm(rewardInput, fd);
    const values = {
      slug: await resolveSlug({
        table: rewards,
        slugColumn: rewards.slug,
        idColumn: rewards.id,
        explicit: d.slug,
        fallbackText: d.name,
        excludeId: d.id,
      }),
      name: d.name,
      description: d.description ?? "",
      points: d.points,
      image: d.image ?? null,
      stock: d.stock,
      maxPerCustomer: d.maxPerCustomer,
      availableFrom: d.availableFrom,
      availableUntil: d.availableUntil,
      active: d.active,
      sortOrder: d.sortOrder,
    };
    let rewardId = d.id;
    if (d.id) {
      const [prev] = await db.select().from(rewards).where(eq(rewards.id, d.id)).limit(1);
      await db.update(rewards).set(values).where(eq(rewards.id, d.id));
      const changes = describeChanges(prev, values, [
        { key: "name", label: "nome" },
        { key: "points", label: "punti" },
        { key: "stock", label: "disponibilità" },
        { key: "maxPerCustomer", label: "limite per cliente" },
        { key: "active", label: "attivo" },
      ]);
      if (changes.length > 0) {
        await logAudit({
          actor,
          action: "reward.update",
          entity: "reward",
          entityId: d.id,
          // Points are the price of a reward — a change is money-equivalent.
          summary: `Premio ${values.name}: ${changes.join(", ")}`,
          meta: { points: values.points, stock: values.stock },
        });
      }
    } else {
      const [created] = await db.insert(rewards).values(values).returning({ id: rewards.id });
      rewardId = created?.id;
      await logAudit({
        actor,
        action: "reward.create",
        entity: "reward",
        entityId: rewardId,
        summary: `Premio creato: ${values.name} — ${values.points} punti`,
        meta: { points: values.points, stock: values.stock },
      });
    }
    revalidatePath("/admin/rewards");
    return ok(d.id ? "Premio salvato." : "Premio creato.");
  });
}

/** Quick list-row toggle: activate/deactivate a reward. */
export async function toggleRewardActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = (fd.get("id") ?? "").toString();
    const active = fd.get("active") === "true";
    const [row] = await db
      .update(rewards)
      .set({ active })
      .where(eq(rewards.id, id))
      .returning({ name: rewards.name });
    await logAudit({
      actor,
      action: "reward.active",
      entity: "reward",
      entityId: id,
      summary: `Premio ${row?.name ?? id} ${active ? "attivato" : "disattivato"}`,
      meta: { active },
    });
    revalidatePath("/admin/rewards");
    return ok(active ? "Premio attivato." : "Premio disattivato.");
  });
}

/**
 * Delete a reward from the catalogue.
 *
 * `redemptions.rewardId` is deliberately not a foreign key and `rewardName` is
 * a snapshot, so past redemptions survive this — which is right, they are the
 * customer's history. What must not survive it is an *outstanding* one: a
 * customer has already paid points for something they haven't collected, and
 * deleting the record is how the shop forgets to hand it over. Deactivating
 * takes it off the catalogue without that.
 */
export async function deleteReward(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = (fd.get("id") ?? "").toString();
    // Read first: this used to delete blind, so a stale id reported success and
    // wrote an audit line for a deletion that never happened.
    const [row] = await db.select({ name: rewards.name }).from(rewards).where(eq(rewards.id, id)).limit(1);
    if (!row) throw new ActionError("Premio non trovato.");

    const [{ pending }] = await db
      .select({ pending: sql<number>`count(*)` })
      .from(redemptions)
      .where(and(eq(redemptions.rewardId, id), eq(redemptions.status, "pending")));
    if (Number(pending) > 0) {
      throw new ActionError(
        `Ci sono ${pending} riscatti ancora da consegnare per "${row.name}". Consegnali o annullali (i punti tornano al cliente), oppure disattiva il premio invece di eliminarlo.`,
      );
    }

    await db.delete(rewards).where(eq(rewards.id, id));
    await logAudit({
      actor,
      action: "reward.delete",
      entity: "reward",
      entityId: id,
      summary: `Premio eliminato: ${row.name}`,
    });
    revalidatePath("/admin/rewards");
    return ok("Premio eliminato.");
  });
}

// ── Loyalty ──────────────────────────────────────────────────────────────────
export async function adjustPoints(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    // Points are money-equivalent — restrict manual adjustment to full admins.
    const admin = await requireRole("admin");
    const d = parseForm(pointsInput, fd);
    // `applied` differs from the requested delta only when a debit was clamped at
    // zero — log what actually happened so the audit matches the ledger + balance.
    const { applied } = await addPoints(d.userId, d.delta, d.reason, admin.id);
    await logAudit({
      actor: admin,
      action: "loyalty.adjust",
      entity: "user",
      entityId: d.userId,
      summary: `Rettifica punti ${applied > 0 ? "+" : ""}${applied}${applied !== d.delta ? ` (richiesti ${d.delta})` : ""}${d.reason ? ` — ${d.reason}` : ""}`,
      meta: { delta: d.delta, applied, reason: d.reason },
    });
    revalidatePath("/admin/loyalty");
    return ok(
      applied === d.delta
        ? "Punti aggiornati."
        : `Punti aggiornati (applicati ${applied} — saldo non può scendere sotto zero).`,
    );
  });
}

export async function updateRedemptionStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(redemptionStatusInput, fd);
    const [redemption] = await db.select().from(redemptions).where(eq(redemptions.id, d.id)).limit(1);
    if (!redemption) throw new ActionError("Riscatto non trovato.");
    if (redemption.status === d.status) return ok("Nessuna modifica.");

    // Annullato is terminal. Cancelling handed the points back (and the unit to
    // stock); re-opening would have to take them again, and a customer who has
    // meanwhile spent them would end up with the reward *and* the refund. If
    // they still want it, they redeem it again from their account.
    if (redemption.status === "cancelled") {
      throw new ActionError(
        "Un riscatto annullato non si può riaprire: i punti sono già tornati al cliente, che può riscattare di nuovo il premio.",
      );
    }

    // Cancelling a redemption returns the spent points to the customer — exactly
    // once (guarded by the from-status), with its own ledger entry via addPoints.
    if (d.status === "cancelled") {
      await addPoints(
        redemption.userId,
        redemption.pointsSpent,
        `Riscatto annullato: ${redemption.rewardName}`,
        actor.id,
      );
      // …and the physical unit goes back on the shelf, for a reward that
      // tracks stock. Guarded the same way, so it can only happen once.
      if (redemption.rewardId) {
        await db
          .update(rewards)
          .set({ stock: sql`${rewards.stock} + 1` })
          .where(and(eq(rewards.id, redemption.rewardId), isNotNull(rewards.stock)));
      }
    }

    await db
      .update(redemptions)
      .set({ status: d.status, fulfilledAt: d.status === "fulfilled" ? new Date() : null })
      .where(eq(redemptions.id, d.id));

    // Tell the customer. Both transitions are things that happened *to* them:
    // a cancellation silently returned their points, which reads as the loyalty
    // scheme malfunctioning rather than as the shop running out of a prize.
    if (d.status === "fulfilled" || d.status === "cancelled") {
      const [customer] = await db
        .select({ email: users.email, name: users.name, username: users.username })
        .from(users)
        .where(eq(users.id, redemption.userId))
        .limit(1);
      if (customer?.email) {
        await sendMail({
          to: customer.email,
          ...redemptionStatusEmail(
            customer.name || customer.username,
            redemption.rewardName,
            d.status,
            redemption.pointsSpent,
          ),
        }).catch(() => {});
      }
    }

    await logAudit({
      actor,
      action: "redemption.status",
      entity: "redemption",
      entityId: redemption.id,
      summary: `Riscatto "${redemption.rewardName}": ${redemption.status} → ${d.status}${
        d.status === "cancelled" ? ` (+${redemption.pointsSpent} punti restituiti)` : ""
      }`,
      meta: { from: redemption.status, to: d.status, pointsSpent: redemption.pointsSpent },
    });

    revalidatePath("/admin/loyalty");
    // Also actionable from the customer's own page, which shows the same row
    // (and, on a cancellation, the points balance that just moved).
    revalidatePath(`/admin/loyalty/${redemption.userId}`);
    return ok("Riscatto aggiornato.");
  });
}

// ── Newsletter ───────────────────────────────────────────────────────────────
export async function removeSubscriber(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = (fd.get("id") ?? "").toString();
    const [row] = await db
      .update(newsletterSubscribers)
      .set({ status: "unsubscribed", unsubscribedAt: new Date() })
      .where(eq(newsletterSubscribers.id, id))
      .returning({ email: newsletterSubscribers.email });
    // Removing someone from a marketing list on their behalf is a consent
    // decision, so it belongs in the trail.
    await logAudit({
      actor,
      action: "newsletter.unsubscribe",
      entity: "campaign",
      entityId: id,
      summary: `Iscritto rimosso dalla newsletter: ${row?.email ?? id}`,
    });
    revalidatePath("/admin/newsletter");
    return ok("Iscritto rimosso.");
  });
}

/**
 * Add someone to the list from the back office.
 *
 * The list was write-only in the wrong direction: subscribers could be removed
 * here but never added, so an address written on the pad at the counter had no
 * way in at all short of asking the customer to go and fill in the website form.
 *
 * The default is still double opt-in — the same `subscribeNewsletter` the
 * footer form calls, so the confirmation email and the token are identical.
 * `consensoRaccolto` skips it, and is for the case where consent already exists
 * on paper; it is a deliberate, separately-worded, audited choice rather than a
 * convenience, because the audit trail is the shop's evidence that it had it.
 */
export async function addSubscriber(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const email = (fd.get("email") ?? "").toString().trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ActionError("Inserisci un indirizzo email valido.");
    }
    const alreadyConsented = fd.get("consensoRaccolto") === "true";
    const source = (fd.get("source") ?? "").toString().trim().slice(0, 60) || "banco";

    const [existing] = await db
      .select({ status: newsletterSubscribers.status })
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.email, email))
      .limit(1);
    if (existing?.status === "confirmed") {
      return ok(`${email} è già iscritto e confermato.`);
    }

    const res = await subscribeNewsletter(email, source);
    if (!res.ok) throw new ActionError(res.error);

    if (alreadyConsented) {
      await db
        .update(newsletterSubscribers)
        .set({ status: "confirmed", confirmedAt: new Date() })
        .where(eq(newsletterSubscribers.email, email));
    }

    await logAudit({
      actor,
      action: alreadyConsented ? "newsletter.add_consented" : "newsletter.add",
      entity: "campaign",
      entityId: email,
      summary: alreadyConsented
        ? `Iscritto aggiunto e confermato a mano (consenso raccolto): ${email}`
        : `Invito alla newsletter inviato a ${email}`,
      meta: { email, source, consentRecordedOffline: alreadyConsented },
    });

    revalidatePath("/admin/newsletter");
    return ok(
      alreadyConsented
        ? `${email} aggiunto e confermato.`
        : `Email di conferma inviata a ${email}. Comparirà fra i confermati quando avrà cliccato.`,
    );
  });
}

/**
 * Re-send the confirmation link to someone stuck on `pending`.
 *
 * A subscriber who never clicked was a permanent dead end: excluded from every
 * campaign, with no control on the row to do anything about it. This mints a
 * fresh token via the same path the public form uses, so the old link stops
 * working — which is right, an unclicked invite is not a credential to keep
 * alive for ever.
 */
export async function resendSubscriberConfirmation(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = (fd.get("id") ?? "").toString();
    const [row] = await db
      .select()
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.id, id))
      .limit(1);
    if (!row) throw new ActionError("Iscritto non trovato.");
    if (row.status === "confirmed") return ok("Questo indirizzo è già confermato.");
    if (row.status === "unsubscribed") {
      throw new ActionError(
        "Questo indirizzo si è cancellato: non possiamo riscrivergli senza un nuovo consenso.",
      );
    }

    const res = await subscribeNewsletter(row.email, row.source ?? "footer");
    if (!res.ok) throw new ActionError(res.error);

    await logAudit({
      actor,
      action: "newsletter.resend_confirmation",
      entity: "campaign",
      entityId: id,
      summary: `Conferma newsletter reinviata a ${row.email}`,
    });

    revalidatePath("/admin/newsletter");
    return ok(`Email di conferma reinviata a ${row.email}.`);
  });
}

/**
 * Mark a pending subscriber confirmed because consent exists off-line.
 *
 * The counterpart to the flag on `addSubscriber`, for the row that is already
 * in the list. Same reasoning: it is the audit line, not the button, that makes
 * this defensible, so it is written even though the row change is trivial.
 */
export async function confirmSubscriber(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = (fd.get("id") ?? "").toString();
    const [row] = await db
      .select()
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.id, id))
      .limit(1);
    if (!row) throw new ActionError("Iscritto non trovato.");
    if (row.status === "confirmed") return ok("Già confermato.");
    if (row.status === "unsubscribed") {
      throw new ActionError("Questo indirizzo si è cancellato: serve un nuovo consenso esplicito.");
    }

    await db
      .update(newsletterSubscribers)
      .set({ status: "confirmed", confirmedAt: new Date() })
      .where(eq(newsletterSubscribers.id, id));

    await logAudit({
      actor,
      action: "newsletter.confirm_manual",
      entity: "campaign",
      entityId: id,
      summary: `Iscrizione confermata a mano (consenso raccolto fuori dal sito): ${row.email}`,
      meta: { email: row.email, previousStatus: row.status },
    });

    revalidatePath("/admin/newsletter");
    return ok(`${row.email} confermato.`);
  });
}

// NB: broadcasts now go through `lib/admin/campaign-actions.ts` — every send is
// recorded as a campaign first, so it can be drafted, scheduled and reviewed.

// ── Email test ───────────────────────────────────────────────────────────────
export async function sendTestEmail(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const to = (fd.get("to") ?? "").toString().trim();
    if (!to) throw new ActionError("Inserisci un indirizzo email");

    // This is the one tool an operator has for answering "does SMTP work?", so
    // it has to answer honestly. It used to `.catch(() => {})` the send and
    // report success either way, telling you to go and read the outbox — which
    // meant a wrong password looked exactly like a delivered message. The
    // result is now surfaced, with the provider's own error text: "535
    // authentication failed" is the whole diagnosis, and hiding it costs an
    // afternoon.
    if (!smtpConfigured) {
      throw new ActionError(
        "SMTP non configurato: il messaggio resterebbe in coda nell'outbox. Imposta SMTP_HOST e le variabili collegate.",
      );
    }

    const result = await sendMail({
      to,
      subject: "Email di prova — Norcineria Taccalite",
      html: "<p>Questa è un'email di prova dalla piattaforma Taccalite. Se la ricevi, l'invio funziona.</p>",
      text: "Questa è un'email di prova dalla piattaforma Taccalite. Se la ricevi, l'invio funziona.",
    });

    await logAudit({
      actor,
      action: "mail.test",
      entity: "email",
      entityId: "smtp",
      summary: `Email di prova a ${to}: ${result.delivered ? "consegnata" : `fallita (${result.error ?? "errore sconosciuto"})`}`,
      meta: { to, delivered: result.delivered, error: result.error ?? null },
    });

    revalidatePath("/admin/outbox");
    revalidatePath("/admin/settings");

    if (!result.delivered) {
      throw new ActionError(`Invio fallito: ${result.error ?? "errore sconosciuto"}`);
    }
    return ok(`Email di prova consegnata a ${to}.`);
  });
}

// ── Settings (admin-only) ────────────────────────────────────────────────────
export async function saveSetting(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(settingInput, fd);
    let value: unknown = d.value;
    // Text settings are stored verbatim; everything else round-trips through JSON
    // so getSetting<number>/<boolean> keep working.
    if (d.valueType !== "text") {
      try {
        value = JSON.parse(d.value);
      } catch {
        /* keep as string */
      }
    }
    await db
      .insert(settings)
      .values({ key: d.key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
    await logAudit({
      actor,
      action: "setting.save",
      entity: "setting",
      entityId: d.key,
      summary: `Impostazione ${d.key} = ${d.value}`,
      meta: { key: d.key, value },
    });
    revalidatePath("/admin/settings");
    return ok("Impostazione salvata.");
  });
}
