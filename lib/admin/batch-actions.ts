"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { productBatches, products } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { applyStockChange } from "@/lib/stock";
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
 */

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

    const [product] = await db
      .select({ name: products.name, stock: products.stock })
      .from(products)
      .where(eq(products.id, d.productId))
      .limit(1);
    if (!product) throw new ActionError("Prodotto non trovato.");
    if (product.stock == null) {
      throw new ActionError(
        "Questo prodotto non traccia le scorte: imposta una giacenza nella scheda prima di registrare un lotto.",
      );
    }

    await db.insert(productBatches).values({
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

    // Receiving stock is a stock movement like any other, so it goes through the
    // one ledger rather than writing the products row directly.
    const change = await applyStockChange({
      productId: d.productId,
      delta: d.quantity,
      reason: `Carico lotto ${d.lotCode || "—"}${d.expiryDate ? ` (scad. ${d.expiryDate})` : ""}`,
      byUserId: actor.id,
    });

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
    if (batch.remaining <= 0) return ok("Questo lotto è già esaurito.");

    const [product] = await db
      .select({ name: products.name })
      .from(products)
      .where(eq(products.id, batch.productId))
      .limit(1);

    const removed = batch.remaining;
    await db.update(productBatches).set({ remaining: 0 }).where(eq(productBatches.id, id));
    await applyStockChange({
      productId: batch.productId,
      delta: -removed,
      reason: `${reason} — lotto ${batch.lotCode || "—"}`,
      byUserId: actor.id,
    });

    await logAudit({
      actor,
      action: "batch.write_off",
      entity: "batch",
      entityId: batch.productId,
      summary: `Lotto ${batch.lotCode || "senza codice"} di ${product?.name ?? batch.productId}: scaricate ${removed} unità (${reason})`,
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
    if (remaining > batch.quantity) {
      throw new ActionError(`Il lotto ne conteneva ${batch.quantity}: non può restarne di più.`);
    }
    if (remaining === batch.remaining) return ok("Nessuna modifica.");

    const delta = remaining - batch.remaining;
    // The guard is what stops two operators correcting the same lot from both
    // applying their delta. Its *result* was being ignored, so the loser of the
    // race left the lot untouched and still moved the on-hand figure — the one
    // outcome this whole module exists to prevent. Nothing has changed yet at
    // this point, so bailing out is clean.
    const [updated] = await db
      .update(productBatches)
      .set({ remaining })
      .where(and(eq(productBatches.id, id), sql`${productBatches.remaining} = ${batch.remaining}`))
      .returning({ id: productBatches.id });
    if (!updated) {
      throw new ActionError(
        "Il lotto è stato modificato da qualcun altro nel frattempo. Ricarica la pagina e riprova.",
      );
    }
    await applyStockChange({
      productId: batch.productId,
      delta,
      reason: `Rettifica lotto ${batch.lotCode || "—"}`,
      byUserId: actor.id,
    });

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
