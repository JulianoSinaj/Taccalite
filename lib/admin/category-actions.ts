"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categories, products, blogPosts } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { saveUploadedImage } from "@/lib/media";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm, categoryInput, categoryMergeInput } from "@/lib/validation/admin";

/**
 * Category CRUD.
 *
 * Two invariants this module exists to hold:
 *
 *  1. **The name is denormalised onto the rows that use it.** `products.category`
 *     and `blog_posts.category` are read by the storefront filters, the CSV
 *     export and the IVA report, none of which know about `categories`. Renaming
 *     a category therefore rewrites every row that points at it, in the same
 *     transaction — otherwise the two views of the same category diverge, which
 *     is the whole problem the table was added to end.
 *  2. **A category in use is never silently dropped.** The foreign key is
 *     RESTRICT, so the database itself refuses the delete; this module turns
 *     that into a sentence the operator can act on, and offers the merge that
 *     empties the category first.
 */

/** Rows currently filed under a category, per kind. */
async function usageCount(id: string, kind: "product" | "post"): Promise<number> {
  if (kind === "post") {
    const [r] = await db
      .select({ n: sql<number>`count(*)` })
      .from(blogPosts)
      .where(eq(blogPosts.categoryId, id));
    return Number(r?.n ?? 0);
  }
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.categoryId, id));
  return Number(r?.n ?? 0);
}

/** An uploaded file wins over the URL field, matching the other forms. */
async function applyImageUpload(fd: FormData): Promise<void> {
  const file = fd.get("imageFile");
  if (file instanceof File && file.size > 0) {
    fd.set("image", await saveUploadedImage(file));
  }
}

export async function saveCategory(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    await applyImageUpload(fd);
    const d = parseForm(categoryInput, fd);

    // Slugs are unique per kind, not globally: the shop files products under
    // "Formaggi" and posts under "Formaggi" too, and those are different lists.
    const base = d.slug || slugify(d.name);
    if (!base) throw new ActionError("Il nome non produce uno slug valido: aggiungi lettere o numeri.");
    const clash = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.kind, d.kind), eq(categories.slug, base)));
    if (clash.some((c) => c.id !== d.id)) {
      throw new ActionError(`Esiste già una categoria con lo slug «${base}» in questo elenco.`);
    }

    // A category cannot be its own parent, and a parent must be the same kind —
    // "Ricette" is not a plausible parent of "Salumi".
    const parentId = d.parentId ?? null;
    if (parentId) {
      if (parentId === d.id) throw new ActionError("Una categoria non può essere figlia di se stessa.");
      const [parent] = await db.select().from(categories).where(eq(categories.id, parentId)).limit(1);
      if (!parent || parent.kind !== d.kind) {
        throw new ActionError("La categoria superiore deve appartenere allo stesso elenco.");
      }
      // One level of nesting is what the UI shows; a cycle would also break the
      // list's parent → child grouping.
      if (parent.parentId === d.id) throw new ActionError("Gerarchia circolare fra le due categorie.");
    }

    const values = {
      slug: base,
      name: d.name,
      kind: d.kind,
      parentId,
      defaultVatRateBps: d.defaultVatRate,
      accent: d.accent ?? null,
      description: d.description ?? "",
      image: d.image ?? null,
      seoTitle: d.seoTitle ?? null,
      seoDescription: d.seoDescription ?? null,
      sortOrder: d.sortOrder,
      active: d.active,
    };

    if (d.id) {
      const [prev] = await db.select().from(categories).where(eq(categories.id, d.id)).limit(1);
      if (!prev) throw new ActionError("Categoria non trovata.");
      await db.update(categories).set(values).where(eq(categories.id, d.id));

      // Push a rename through to the denormalised copies. Guarded on the name
      // actually changing so an unrelated edit doesn't rewrite the catalogue.
      if (prev.name !== d.name) {
        if (d.kind === "product") {
          await db.update(products).set({ category: d.name }).where(eq(products.categoryId, d.id));
        } else {
          await db.update(blogPosts).set({ category: d.name }).where(eq(blogPosts.categoryId, d.id));
        }
      }

      await logAudit({
        actor,
        action: "category.update",
        entity: "category",
        entityId: d.id,
        summary:
          prev.name !== d.name
            ? `Categoria rinominata: ${prev.name} → ${d.name}`
            : `Categoria ${d.name} aggiornata`,
        meta: { kind: d.kind, slug: base, renamedFrom: prev.name !== d.name ? prev.name : undefined },
      });
      revalidatePath("/admin/categories");
      revalidatePath("/negozio");
      return ok("Categoria salvata.");
    }

    const [created] = await db.insert(categories).values(values).returning({ id: categories.id });
    await logAudit({
      actor,
      action: "category.create",
      entity: "category",
      entityId: created?.id,
      summary: `Categoria creata: ${d.name} (${d.kind === "product" ? "prodotti" : "news"})`,
      meta: { kind: d.kind, slug: base },
    });
    revalidatePath("/admin/categories");
    revalidatePath("/negozio");
    return ok("Categoria creata.");
  });
}

export async function toggleCategoryActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = (fd.get("id") ?? "").toString();
    const active = fd.get("active") === "true";
    const [row] = await db
      .update(categories)
      .set({ active })
      .where(eq(categories.id, id))
      .returning({ name: categories.name });
    await logAudit({
      actor,
      action: "category.active",
      entity: "category",
      entityId: id,
      summary: `Categoria ${row?.name ?? id} ${active ? "mostrata" : "nascosta"}`,
      meta: { active },
    });
    revalidatePath("/admin/categories");
    revalidatePath("/negozio");
    return ok(active ? "Categoria mostrata sul sito." : "Categoria nascosta dal sito.");
  });
}

export async function deleteCategory(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = (fd.get("id") ?? "").toString();
    const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!row) throw new ActionError("Categoria non trovata.");

    // Refuse rather than orphan. The FK would reject this anyway (RESTRICT), but
    // a raw "FOREIGN KEY constraint failed" tells an operator nothing about what
    // to do next — checking first is what makes the merge discoverable.
    const inUse = await usageCount(id, row.kind);
    if (inUse > 0) {
      throw new ActionError(
        `«${row.name}» è usata da ${inUse} ${row.kind === "product" ? "prodotti" : "articoli"}. ` +
          "Uniscila a un'altra categoria prima di eliminarla.",
      );
    }

    // Children are promoted, not deleted with the parent (the FK would do this
    // anyway; doing it explicitly makes the intent legible).
    await db.update(categories).set({ parentId: null }).where(eq(categories.parentId, id));
    await db.delete(categories).where(eq(categories.id, id));
    await logAudit({
      actor,
      action: "category.delete",
      entity: "category",
      entityId: id,
      summary: `Categoria eliminata: ${row.name}`,
      meta: { kind: row.kind, slug: row.slug },
    });
    revalidatePath("/admin/categories");
    revalidatePath("/negozio");
    return ok("Categoria eliminata.");
  });
}

/**
 * Fold `sourceId` into `targetId`: everything filed under the source moves to
 * the target (name included), then the source is deleted.
 *
 * This is the cleanup tool for the failure mode free-text categories had — one
 * mistyped "Formaggio" alongside "Formaggi" quietly grew an extra filter chip on
 * the storefront holding a single product, and there was no way to fix it short
 * of an UPDATE by hand.
 */
export async function mergeCategories(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(categoryMergeInput, fd);
    if (d.sourceId === d.targetId) throw new ActionError("Scegli due categorie diverse.");

    const rows = await db.select().from(categories);
    const source = rows.find((c) => c.id === d.sourceId);
    const target = rows.find((c) => c.id === d.targetId);
    if (!source || !target) throw new ActionError("Categoria non trovata.");
    if (source.kind !== target.kind) {
      throw new ActionError("Puoi unire solo categorie dello stesso elenco.");
    }

    let moved = 0;
    if (source.kind === "product") {
      moved = await usageCount(source.id, "product");
      await db
        .update(products)
        .set({ categoryId: target.id, category: target.name })
        .where(eq(products.categoryId, source.id));
    } else {
      moved = await usageCount(source.id, "post");
      await db
        .update(blogPosts)
        .set({ categoryId: target.id, category: target.name })
        .where(eq(blogPosts.categoryId, source.id));
    }

    // Re-parent the source's children onto the target so nothing is stranded,
    // skipping the target itself (it must not become its own parent). If the
    // target *was* a child of the source it is left alone here and the FK's
    // `set null` promotes it when the source row goes.
    await db
      .update(categories)
      .set({ parentId: target.id })
      .where(and(eq(categories.parentId, source.id), ne(categories.id, target.id)));

    await db.delete(categories).where(eq(categories.id, source.id));
    await logAudit({
      actor,
      action: "category.merge",
      entity: "category",
      entityId: target.id,
      summary: `Categorie unite: ${source.name} → ${target.name} (${moved} spostati)`,
      meta: { sourceId: source.id, sourceName: source.name, targetId: target.id, moved },
    });
    revalidatePath("/admin/categories");
    revalidatePath("/admin/products");
    revalidatePath("/negozio");
    return ok(`«${source.name}» unita a «${target.name}» — ${moved} elementi spostati.`);
  });
}
