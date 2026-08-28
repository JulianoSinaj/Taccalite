"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categories, products, blogPosts } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import {
  parseForm,
  categoryInput,
  categoryMergeInput,
  categoryMoveInput,
  categoryReorderInput,
} from "@/lib/validation/admin";

/**
 * Category CRUD.
 *
 * Three invariants this module exists to hold:
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
 *  3. **One level of nesting.** The list renders parent → children and nothing
 *     deeper; a category that already groups others cannot itself be filed
 *     under another one, and a parent must be a top-level row of the same kind.
 */

type Kind = "product" | "post";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const noun = (kind: Kind) => (kind === "product" ? "prodotti" : "articoli");

/** Paths that render categories: the admin list, the shop rail, the news list. */
function revalidateCategoryViews(kind: Kind) {
  revalidatePath("/admin/categories");
  if (kind === "product") {
    revalidatePath("/admin/products");
    revalidatePath("/negozio");
  } else {
    revalidatePath("/admin/blog");
    revalidatePath("/blog");
  }
}

/** Rows currently filed under a category, per kind. */
async function usageCount(id: string, kind: Kind, cx: Tx | typeof db = db): Promise<number> {
  const [r] =
    kind === "post"
      ? await cx.select({ n: sql<number>`count(*)` }).from(blogPosts).where(eq(blogPosts.categoryId, id))
      : await cx.select({ n: sql<number>`count(*)` }).from(products).where(eq(products.categoryId, id));
  return Number(r?.n ?? 0);
}

/** Categories filed directly under this one. */
async function childCount(id: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(categories)
    .where(eq(categories.parentId, id));
  return Number(r?.n ?? 0);
}

export async function saveCategory(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(categoryInput, fd);
    const isProduct = d.kind === "product";

    // Slugs are unique per kind, not globally: the shop files products under
    // "Formaggi" and posts under "Formaggi" too, and those are different lists.
    const base = d.slug || slugify(d.name);
    if (!base)
      throw new ActionError(
        "Il nome non produce uno slug valido: aggiungi lettere o numeri.",
        "slug",
      );
    const clash = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.kind, d.kind), eq(categories.slug, base)));
    if (clash.some((c) => c.id !== d.id)) {
      throw new ActionError(
        `Esiste già una categoria con lo slug «${base}» in questo elenco.`,
        "slug",
      );
    }

    // Hierarchy is a product-catalogue affordance; news categories are flat.
    const parentId = isProduct ? (d.parentId ?? null) : null;
    if (parentId) {
      if (parentId === d.id) throw new ActionError("Una categoria non può essere figlia di se stessa.");
      const [parent] = await db.select().from(categories).where(eq(categories.id, parentId)).limit(1);
      if (!parent || parent.kind !== d.kind) {
        throw new ActionError("La categoria superiore deve appartenere allo stesso elenco.");
      }
      // One level only: the parent must be top level, and this row must not
      // already be a parent — either would make a third level the list can't
      // draw (and, in the worst case, a cycle).
      if (parent.parentId) {
        throw new ActionError(
          `«${parent.name}» è già una sottocategoria: scegli una categoria di primo livello.`,
          "parentId",
        );
      }
      if (d.id && (await childCount(d.id)) > 0) {
        throw new ActionError(
          "Questa categoria raggruppa già altre categorie e deve restare al primo livello.",
          "parentId",
        );
      }
    }

    // Fields the storefront reads only for product categories are blanked for
    // news ones, so a row cannot carry a colour or SEO text nothing displays.
    const values = {
      slug: base,
      name: d.name,
      kind: d.kind,
      parentId,
      defaultVatRateBps: isProduct ? d.defaultVatRate : null,
      accent: isProduct ? (d.accent ?? null) : null,
      description: isProduct ? (d.description ?? "") : "",
      seoTitle: isProduct ? (d.seoTitle ?? null) : null,
      seoDescription: isProduct ? (d.seoDescription ?? null) : null,
      sortOrder: d.sortOrder,
      active: d.active,
    };

    if (d.id) {
      const id = d.id;
      const [prev] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
      if (!prev) throw new ActionError("Categoria non trovata.");
      const renamed = prev.name !== d.name;

      // The rename and its denormalised copies land together or not at all.
      await db.transaction(async (tx) => {
        await tx.update(categories).set(values).where(eq(categories.id, id));
        if (!renamed) return;
        if (isProduct) {
          await tx.update(products).set({ category: d.name }).where(eq(products.categoryId, id));
        } else {
          await tx.update(blogPosts).set({ category: d.name }).where(eq(blogPosts.categoryId, id));
        }
      });

      await logAudit({
        actor,
        action: "category.update",
        entity: "category",
        entityId: id,
        summary: renamed ? `Categoria rinominata: ${prev.name} → ${d.name}` : `Categoria ${d.name} aggiornata`,
        meta: { kind: d.kind, slug: base, renamedFrom: renamed ? prev.name : undefined },
      });
      revalidateCategoryViews(d.kind);
      return ok("Categoria salvata.");
    }

    const [created] = await db.insert(categories).values(values).returning({ id: categories.id });
    await logAudit({
      actor,
      action: "category.create",
      entity: "category",
      entityId: created?.id,
      summary: `Categoria creata: ${d.name} (${isProduct ? "prodotti" : "news"})`,
      meta: { kind: d.kind, slug: base },
    });
    revalidateCategoryViews(d.kind);
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
      .returning({ name: categories.name, kind: categories.kind });
    if (!row) throw new ActionError("Categoria non trovata.");
    await logAudit({
      actor,
      action: "category.active",
      entity: "category",
      entityId: id,
      summary: `Categoria ${row.name} ${active ? "mostrata" : "nascosta"}`,
      meta: { active },
    });
    revalidateCategoryViews(row.kind);
    return ok(active ? "Categoria mostrata sul sito." : "Categoria nascosta dal sito.");
  });
}

/**
 * Nudge a category one step up or down among its siblings (same kind, same
 * parent). Sibling `sortOrder`s are renumbered 0, 10, 20… on every move, so a
 * list where everything was left at 0 still moves as expected the first time.
 */
export async function moveCategory(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(categoryMoveInput, fd);
    const [row] = await db.select().from(categories).where(eq(categories.id, d.id)).limit(1);
    if (!row) throw new ActionError("Categoria non trovata.");

    // Same order the list and the pickers use, so "up" means what the screen shows.
    const siblings = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.kind, row.kind),
          row.parentId ? eq(categories.parentId, row.parentId) : isNull(categories.parentId),
        ),
      )
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    const ids = siblings.map((s) => s.id);
    const from = ids.indexOf(d.id);
    const to = d.direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= ids.length) {
      throw new ActionError(d.direction === "up" ? "È già la prima." : "È già l'ultima.");
    }
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];

    await db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(categories).set({ sortOrder: i * 10 }).where(eq(categories.id, id));
      }
    });
    await logAudit({
      actor,
      action: "category.move",
      entity: "category",
      entityId: d.id,
      summary: `Categoria ${row.name} spostata ${d.direction === "up" ? "su" : "giù"}`,
      meta: { direction: d.direction, position: to },
    });
    revalidateCategoryViews(row.kind);
    return ok("Ordine aggiornato.");
  });
}

/**
 * Drop a whole sibling group (same kind, same parent) in its new order — the
 * batch counterpart to `moveCategory`, called directly (not via a `<form>`)
 * from the drag-and-drop list. One transaction renumbers everyone 0, 10, 20…
 * instead of one round trip per step, which is what dragging a row from the
 * bottom to the top of a long list would otherwise cost.
 */
export async function reorderCategories(
  kind: Kind,
  parentId: string | null,
  ids: string[],
): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = categoryReorderInput.parse({ kind, parentId, ids });
    if (d.ids.length < 2) return ok("Ordine aggiornato.");

    // Trust the dropped order only if it names exactly the current sibling set —
    // a stale client (a row created, deleted or reparented elsewhere mid-drag)
    // must not silently renumber the wrong rows.
    const siblings = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.kind, d.kind),
          d.parentId ? eq(categories.parentId, d.parentId) : isNull(categories.parentId),
        ),
      );
    const siblingIds = new Set(siblings.map((s) => s.id));
    if (d.ids.length !== siblingIds.size || d.ids.some((id) => !siblingIds.has(id))) {
      throw new ActionError("L'elenco è cambiato: ricarica la pagina e riprova.");
    }

    await db.transaction(async (tx) => {
      for (const [i, id] of d.ids.entries()) {
        await tx.update(categories).set({ sortOrder: i * 10 }).where(eq(categories.id, id));
      }
    });
    await logAudit({
      actor,
      action: "category.reorder",
      entity: "category",
      entityId: d.parentId ?? "root",
      summary: `Ordine categorie aggiornato trascinando (${d.ids.length})`,
      meta: { kind: d.kind, parentId: d.parentId, ids: d.ids },
    });
    revalidateCategoryViews(d.kind);
    return ok("Ordine aggiornato.");
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
        `«${row.name}» è usata da ${inUse} ${noun(row.kind)}. Uniscila a un'altra categoria prima di eliminarla.`,
      );
    }

    // Children are promoted, not deleted with the parent (the FK would do this
    // anyway; doing it explicitly makes the intent legible).
    const promoted = await childCount(id);
    await db.transaction(async (tx) => {
      await tx.update(categories).set({ parentId: null }).where(eq(categories.parentId, id));
      await tx.delete(categories).where(eq(categories.id, id));
    });
    await logAudit({
      actor,
      action: "category.delete",
      entity: "category",
      entityId: id,
      summary: `Categoria eliminata: ${row.name}${promoted ? ` (${promoted} sottocategorie promosse)` : ""}`,
      meta: { kind: row.kind, slug: row.slug, promoted },
    });
    revalidateCategoryViews(row.kind);
    return ok(
      promoted
        ? `Categoria eliminata. ${promoted} ${promoted === 1 ? "sottocategoria è passata" : "sottocategorie sono passate"} al primo livello.`
        : "Categoria eliminata.",
    );
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

    // Move, re-parent and delete as one unit: a failure halfway would leave
    // half the products under a category that no longer exists in the list.
    const moved = await db.transaction(async (tx) => {
      const n = await usageCount(source.id, source.kind, tx);
      if (source.kind === "product") {
        await tx
          .update(products)
          .set({ categoryId: target.id, category: target.name })
          .where(eq(products.categoryId, source.id));
      } else {
        await tx
          .update(blogPosts)
          .set({ categoryId: target.id, category: target.name })
          .where(eq(blogPosts.categoryId, source.id));
      }

      // Re-parent the source's children onto the target so nothing is stranded,
      // skipping the target itself (it must not become its own parent). If the
      // target is itself a child, its new children would sit three deep, so
      // they are promoted to top level instead.
      await tx
        .update(categories)
        .set({ parentId: target.parentId ? null : target.id })
        .where(and(eq(categories.parentId, source.id), ne(categories.id, target.id)));

      await tx.delete(categories).where(eq(categories.id, source.id));
      return n;
    });

    await logAudit({
      actor,
      action: "category.merge",
      entity: "category",
      entityId: target.id,
      summary: `Categorie unite: ${source.name} → ${target.name} (${moved} spostati)`,
      meta: { sourceId: source.id, sourceName: source.name, targetId: target.id, moved },
    });
    revalidateCategoryViews(source.kind);
    return ok(`«${source.name}» unita a «${target.name}» — ${moved} ${noun(source.kind)} spostati.`);
  });
}
