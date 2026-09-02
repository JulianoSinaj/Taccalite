"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { productBatches, products } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { requireShopScope } from "@/lib/admin/scope";
import { applyStockChangeIn, runRestockEffects } from "@/lib/stock";
import { notifyBackInStock, pendingStockNotificationCount } from "@/lib/stock-notify";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm } from "@/lib/validation/admin";

/**
 * Lot (lotto) and expiry (scadenza) tracking.
 *
 * Fresh salumi and formaggi carry a supplier lot code and a use-by date that
 * have to be traceable — which batch went out, and what is about to expire.
 * Nothing in the platform recorded either, so a recall or a stock rotation meant
 * going through paper delivery notes.
 *
 * Batches sit alongside `products.stock` rather than replacing it: the flat
 * on-hand figure stays the single number the shop and the storefront read, and
 * lots account for how it is made up. Receiving a lot therefore also loads the
 * stock, through the same ledger every other movement uses.
 *
 * Every action here resolves the lot's product and calls `requireShopScope` on
 * it. This module was written after `lib/admin/scope.ts` and missed all three of
 * its enforcement points, so a scoped operator could open the expiry report,
 * find another location's lot and write it off — a cross-location inventory
 * *write*, not merely a read.
 */

/** The product a lot belongs to, refusing it if it is another location's. */
async function mustFindScopedProduct(productId: string) {
  const [product] = await db
    .select({ name: products.name, stock: products.stock, shopSlug: products.shopSlug })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) throw new ActionError("Prodotto non trovato.");
  await requireShopScope(product.shopSlug);
  return product;
}

/**
 * The same, plus the requirement that the product actually counts units.
 *
 * A stock movement returns null for a product with `stock IS NULL` — that is
 * correct (made-to-order has no quantity to move) but it is *silent*, and only
 * `receiveBatch` ever asked the question. So writing off or correcting a lot on
 * a product that had since been switched to made-to-order emptied the lot,
 * moved no stock, and reported success: the lot records and the on-hand figure
 * parted company with nothing to say they had.
 */
async function mustTrackStock(productId: string) {
  const product = await mustFindScopedProduct(productId);
  if (product.stock == null) {
    throw new ActionError(
      `"${product.name}" non traccia le scorte: imposta una giacenza nella scheda prima di gestirne i lotti.`,
    );
  }
  return product;
}

const batchInput = z.object({
  productId: z.string().trim().min(1),
  lotCode: z.string().trim().max(80).optional().transform((v) => v ?? ""),
  expiryDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v == null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data di scadenza non valida"),
  quantity: z.coerce.number().int().min(1, "Indica quante unità sono arrivate"),
  supplier: z.string().trim().max(200).optional().transform((v) => (v ? v : null)),
  unitCostEuros: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v != null && v !== "" ? Math.round(Number(String(v).replace(",", ".")) * 100) : null))
    .refine((v) => v == null || (Number.isFinite(v) && v >= 0), "Costo non valido"),
  note: z.string().trim().max(300).optional().transform((v) => (v ? v : null)),
});

/** Record an incoming lot and load its units into stock. */
export async function receiveBatch(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(batchInput, fd);

    const product = await mustTrackStock(d.productId);

    // The lot row and the units it brings in are one event, and they used to be
    // two transactions: a failure between them left a lot claiming stock the
    // product had never been credited with. Receiving stock is a movement like
    // any other, so it still goes through the one ledger — joined to this
    // transaction rather than opening its own.
    const change = await db.transaction(async (tx) => {
      await tx.insert(productBatches).values({
        productId: d.productId,
        lotCode: d.lotCode,
        expiryDate: d.expiryDate,
        quantity: d.quantity,
        remaining: d.quantity,
        supplier: d.supplier,
        unitCostCents: d.unitCostEuros,
        receivedAt: new Date(),
        note: d.note,
        createdByUserId: actor.id,
      });
      return applyStockChangeIn(tx, {
        productId: d.productId,
        delta: d.quantity,
        reason: `Carico lotto ${d.lotCode || "—"}${d.expiryDate ? ` (scad. ${d.expiryDate})` : ""}`,
        byUserId: actor.id,
      });
    });
    // Outside the transaction: this sends the back-in-stock mail, and email has
    // no business inside a write lock.
    if (change) await runRestockEffects(d.productId, change);

    await logAudit({
      actor,
      action: "batch.receive",
      entity: "batch",
      entityId: d.productId,
      summary: `Lotto ${d.lotCode || "senza codice"} di ${product.name}: +${d.quantity}${
        d.expiryDate ? `, scadenza ${d.expiryDate}` : ""
      }`,
      meta: {
        quantity: d.quantity,
        expiryDate: d.expiryDate,
        unitCostCents: d.unitCostEuros,
        stockAfter: change?.stockAfter,
      },
    });

    revalidatePath(`/admin/products/${d.productId}`);
    revalidatePath("/admin/products");
    // A received lot with a near expiry belongs on the expiry report straight
    // away; this path was the one that didn't refresh it.
    revalidatePath("/admin/products/scadenze");
    return ok(`Lotto registrato: +${d.quantity} unità.`);
  });
}

/**
 * Write off what's left of a lot — expired, damaged, or sold outside the system.
 *
 * The units leave both the lot and the on-hand figure, ledgered with a reason,
 * so a discarded batch is visible in the movement history instead of appearing
 * as unexplained shrinkage at the next stocktake.
 */
export async function writeOffBatch(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = String(fd.get("id") ?? "").trim();
    const reason = String(fd.get("reason") ?? "").trim() || "Lotto scartato";

    const [batch] = await db.select().from(productBatches).where(eq(productBatches.id, id)).limit(1);
    if (!batch) throw new ActionError("Lotto non trovato.");
    const product = await mustTrackStock(batch.productId);
    if (batch.remaining <= 0) return ok("Questo lotto è già esaurito.");

    const removed = batch.remaining;
    // Emptying the lot and removing its units are one event. The compare-and-set
    // on `remaining` is what stops two operators writing the same lot off twice,
    // each removing the units the other had already removed.
    const change = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(productBatches)
        .set({ remaining: 0 })
        .where(and(eq(productBatches.id, id), sql`${productBatches.remaining} = ${removed}`))
        .returning({ id: productBatches.id });
      if (!claimed) return "raced" as const;
      return applyStockChangeIn(tx, {
        productId: batch.productId,
        delta: -removed,
        reason: `${reason} — lotto ${batch.lotCode || "—"}`,
        byUserId: actor.id,
      });
    });
    if (change === "raced") {
      throw new ActionError(
        "Il lotto è stato modificato da qualcun altro nel frattempo. Ricarica la pagina e riprova.",
      );
    }

    await logAudit({
      actor,
      action: "batch.write_off",
      entity: "batch",
      entityId: batch.productId,
      summary: `Lotto ${batch.lotCode || "senza codice"} di ${product.name}: scaricate ${removed} unità (${reason})`,
      meta: { removed, lotCode: batch.lotCode, expiryDate: batch.expiryDate },
    });

    revalidatePath(`/admin/products/${batch.productId}`);
    revalidatePath("/admin/products/scadenze");
    return ok(`${removed} unità scaricate dal lotto.`);
  });
}

/** Correct a lot's remaining count after a physical check, without a write-off. */
export async function correctBatchRemaining(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = String(fd.get("id") ?? "").trim();
    const remaining = Number(fd.get("remaining"));
    if (!Number.isInteger(remaining) || remaining < 0) {
      throw new ActionError("Quantità residua non valida.");
    }

    const [batch] = await db.select().from(productBatches).where(eq(productBatches.id, id)).limit(1);
    if (!batch) throw new ActionError("Lotto non trovato.");
    await mustTrackStock(batch.productId);
    if (remaining > batch.quantity) {
      throw new ActionError(`Il lotto ne conteneva ${batch.quantity}: non può restarne di più.`);
    }
    if (remaining === batch.remaining) return ok("Nessuna modifica.");

    const delta = remaining - batch.remaining;
    // The guard is what stops two operators correcting the same lot from both
    // applying their delta. Its *result* was being ignored, so the loser of the
    // race left the lot untouched and still moved the on-hand figure — the one
    // outcome this whole module exists to prevent. It now also shares a
    // transaction with the movement, so the pair cannot half-land either.
    const outcome = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(productBatches)
        .set({ remaining })
        .where(and(eq(productBatches.id, id), sql`${productBatches.remaining} = ${batch.remaining}`))
        .returning({ id: productBatches.id });
      if (!updated) return "raced" as const;
      return applyStockChangeIn(tx, {
        productId: batch.productId,
        delta,
        reason: `Rettifica lotto ${batch.lotCode || "—"}`,
        byUserId: actor.id,
      });
    });
    if (outcome === "raced") {
      throw new ActionError(
        "Il lotto è stato modificato da qualcun altro nel frattempo. Ricarica la pagina e riprova.",
      );
    }
    if (outcome) await runRestockEffects(batch.productId, outcome);

    await logAudit({
      actor,
      action: "batch.correct",
      entity: "batch",
      entityId: batch.productId,
      summary: `Lotto ${batch.lotCode || "senza codice"}: residuo ${batch.remaining} → ${remaining}`,
      meta: { from: batch.remaining, to: remaining },
    });

    revalidatePath(`/admin/products/${batch.productId}`);
    revalidatePath("/admin/products/scadenze");
    return ok("Lotto aggiornato.");
  });
}

/**
 * Email everyone waiting for a product, on demand.
 *
 * The automatic notice fires on the transition from "out of stock" to "available"
 * — which is the right trigger, and misses the case where the product was never
 * recorded as reaching zero, or where the waitlist accumulated while stock sat at
 * one unit nobody could buy. The product page counted these people and offered
 * nothing to do about them; this is the button under that number.
 */
export async function notifyStockWaitlist(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const productId = String(fd.get("productId") ?? "").trim();
    const product = await mustFindScopedProduct(productId);

    const [row] = await db
      .select({ slug: products.slug, stock: products.stock })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!row) throw new ActionError("Prodotto non trovato.");
    if (row.stock != null && row.stock <= 0) {
      throw new ActionError(
        "Il prodotto risulta esaurito: avvisare adesso manderebbe i clienti su una pagina senza disponibilità.",
      );
    }

    const waiting = await pendingStockNotificationCount(productId);
    if (waiting === 0) return ok("Nessuno è in attesa di questo prodotto.");

    await notifyBackInStock(productId, product.name, row.slug);

    await logAudit({
      actor,
      action: "stock.notify_waitlist",
      entity: "product",
      entityId: productId,
      summary: `Avviso di riassortimento inviato a ${waiting} ${
        waiting === 1 ? "cliente" : "clienti"
      } per ${product.name}`,
      meta: { waiting },
    });

    revalidatePath(`/admin/products/${productId}`);
    return ok(`Avviso inviato a ${waiting} ${waiting === 1 ? "cliente" : "clienti"}.`);
  });
}
