import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, productBatches, stockMovements } from "@/lib/db/schema";
import { getSetting } from "@/lib/db/queries";
import { isLowStock } from "@/lib/inventory";
import { notifyBackInStock } from "@/lib/stock-notify";
import { dateInRome } from "@/lib/time";
import { ActionError } from "@/lib/admin/action-state";

/** A transaction handle, for callers that compose a movement with their own writes. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The single way inventory moves.
 *
 * Every path that changes stock — a paid online order, a counter sale, a refund
 * restock, a manual adjustment, a stocktake — goes through here, for two
 * reasons that used to be violated in different places:
 *
 *  1. **The ledger records the delta actually applied.** Stock is floored at
 *     zero (a CHECK constraint, and negative on-hand is meaningless), so asking
 *     to remove 5 units from a product with 2 removes 2. Writing the *requested*
 *     −5 against the resulting `stockAfter: 0` made the movement history stop
 *     summing to the balance — the same defect the loyalty ledger had.
 *  2. **Read and write happen in one transaction.** `adjustStock` used to
 *     SELECT, compute in JS, then UPDATE, so running alongside an order's atomic
 *     decrement lost updates and stamped a wrong `stockAfter`. libSQL opens a
 *     transaction in write mode (BEGIN IMMEDIATE) by default, so the row is
 *     locked from the first read and nothing interleaves.
 */

/**
 * How many units of on-hand stock one order line represents.
 *
 * A product priced per kg has no meaningful unit count, and `products.stock` is
 * an integer, so a 0,350 kg sale cannot be expressed as a decrement. Rather than
 * invent a number, weight lines move no stock automatically — the operator
 * adjusts the shelf by hand.
 *
 * The rule has to be identical on the way out and the way back, and it was not:
 * the counter sale skipped weight lines while `restockOrderItems` handed back
 * the line's `quantity`, which is 1 for a weighed line. Cancelling a counter
 * sale of 0,350 kg therefore *created* a unit of stock and ledgered it as a real
 * movement. Both directions now ask this one function.
 */
export const stockUnitsForLine = (line: {
  quantity: number;
  weightKg?: number | null;
}): number => (line.weightKg != null ? 0 : line.quantity);

export type StockChange = {
  /** The delta actually applied (differs from the request only at the floor). */
  applied: number;
  /** On-hand after the change. */
  stockAfter: number;
  /** On-hand before the change. */
  stockBefore: number;
  /** True when the request was clamped by the zero floor. */
  clamped: boolean;
  /**
   * The ledger row this wrote, or null for a no-op.
   *
   * Returned so a caller that only learns *which lots* it drew on after the
   * fact — FEFO runs on the committed figure — can attach them to the movement
   * it belongs to. See `recordMovementLots`.
   */
  movementId: string | null;
};

/**
 * Apply a signed delta to one product's stock and ledger it.
 *
 * Returns null when the product doesn't exist or doesn't track stock — an
 * untracked product (`stock IS NULL`) is made-to-order and has no quantity to
 * move, which is not an error.
 */
export async function applyStockChange(opts: {
  productId: string;
  delta: number;
  reason: string;
  byUserId?: string | null;
  /** Set to write an absolute figure instead of a delta (a stocktake). */
  setTo?: number;
  /** The order this movement is on account of, when there is one. */
  orderId?: string | null;
}): Promise<StockChange | null> {
  const change = await db.transaction((tx) => applyStockChangeCore(tx, opts));
  if (change) await runRestockEffects(opts.productId, change);
  return change;
}

/**
 * The same movement, joined to a transaction the caller already opened.
 *
 * For a caller that has to change something else in the same breath — receiving
 * a lot writes a `product_batches` row *and* loads the units — where two
 * separate transactions can half-succeed and leave the lots claiming stock the
 * product does not have.
 *
 * The restock side-effects are **not** run here: they send email, which has no
 * business inside a write lock. The caller must invoke `runRestockEffects` once
 * its transaction has committed. That is the whole contract, and it is the only
 * reason this is separate from `applyStockChange` above.
 */
export function applyStockChangeIn(
  tx: Tx,
  opts: {
    productId: string;
    delta: number;
    reason: string;
    byUserId?: string | null;
    setTo?: number;
    orderId?: string | null;
  },
): Promise<StockChange | null> {
  return applyStockChangeCore(tx, opts);
}

/**
 * Attach the lots a movement drew on, after the fact.
 *
 * FEFO can only run once the applied quantity is known, which is after the
 * movement has been written — so the lots arrive a moment late rather than as
 * part of the same insert. Best-effort and never throws: lot bookkeeping must
 * not be able to fail a sale, which is the rule the whole batch layer follows.
 */
export async function recordMovementLots(
  movementId: string | null,
  lots: { lotCode: string; expiryDate: string | null; taken: number }[],
): Promise<void> {
  if (!movementId || lots.length === 0) return;
  try {
    await db.update(stockMovements).set({ lots }).where(eq(stockMovements.id, movementId));
  } catch (err) {
    console.error("[stock] could not attach lots to movement", movementId, err);
  }
}

/**
 * Move a product's on-hand to an absolute figure, ledgering the difference.
 *
 * The product editor and the CSV import both wrote `products.stock` with a
 * plain UPDATE, so the two most-used ways of changing a quantity moved the
 * balance without leaving a movement — and the history stopped summing to the
 * figure it exists to explain. `saveProduct` at least re-sent its own waitlist
 * mail by hand; the importer did not even do that. Both come here now, which
 * is what makes this module's first line ("the single way inventory moves")
 * true rather than aspirational.
 *
 * `null` is not a quantity but a mode: it means made-to-order, don't track.
 * Switching in or out of it is a bookkeeping change rather than a movement, so
 * the four transitions are handled explicitly:
 *
 *  - **number → number** — ledgered as the difference.
 *  - **null → number** — the product starts tracking; on-hand opens at zero so
 *    the opening figure is a real movement rather than a number that appeared.
 *  - **number → null** — the product stops tracking; the balance is written
 *    down to zero first (ledgered, so the history closes where it stopped)
 *    and only then set to null.
 *  - **null → null** — nothing.
 */
export async function setProductStock(opts: {
  productId: string;
  from: number | null;
  to: number | null;
  reason: string;
  byUserId?: string | null;
}): Promise<void> {
  const { productId, from, to, reason, byUserId } = opts;
  if (from === to) return;

  if (to == null) {
    // Made-to-order and open lots are contradictory: the lots would go on
    // claiming units the product no longer counts, and they would never appear
    // on the expiry report again because that only lists what is still on hand.
    // Refused rather than silently zeroed, for the same reason a category in
    // use is refused rather than orphaned — the information is the operator's
    // to spend, not this function's to discard.
    const open = await db
      .select({ lotCode: productBatches.lotCode, remaining: productBatches.remaining })
      .from(productBatches)
      .where(and(eq(productBatches.productId, productId), gt(productBatches.remaining, 0)));
    if (open.length > 0) {
      const units = open.reduce((n, b) => n + b.remaining, 0);
      throw new ActionError(
        `Ci sono ancora ${units} unità in ${open.length} ${open.length === 1 ? "lotto" : "lotti"}: ` +
          "scaricali o vendili prima di togliere la giacenza a questo prodotto.",
        "stock",
      );
    }
    if (from != null && from !== 0) {
      await applyStockChange({ productId, delta: 0, setTo: 0, reason, byUserId });
    }
    await db.update(products).set({ stock: null }).where(eq(products.id, productId));
    return;
  }

  // Opening the ledger at zero: `applyStockChangeCore` reads the row first and
  // returns null for an untracked product, so it has to be tracking before it
  // can be moved.
  if (from == null) {
    await db.update(products).set({ stock: 0 }).where(eq(products.id, productId));
  }
  await applyStockChange({ productId, delta: 0, setTo: to, reason, byUserId });
}

/**
 * What has to happen when stock goes **up**.
 *
 * Both of these used to live in `saveProduct` and `adjustStock` — two of the
 * five paths that raise stock. Receiving a supplier lot (the most natural
 * restock there is), correcting a lot upward, a cancellation putting goods back
 * and a CSV import all moved the number silently: the customers waiting for that
 * product were never told, and `lowStockNotifiedAt` stayed latched so the alert
 * could not fire again on the next dip.
 *
 * The rule belongs next to the write it depends on, not in whichever callers
 * happened to remember it. Runs after the transaction commits — it sends email,
 * which has no business inside a write lock — and never throws: inventory
 * bookkeeping must not fail because a notification did.
 */
export async function runRestockEffects(productId: string, change: StockChange): Promise<void> {
  if (change.applied <= 0) return;
  try {
    const [p] = await db
      .select({
        name: products.name,
        slug: products.slug,
        reorderPoint: products.reorderPoint,
        lowStockNotifiedAt: products.lowStockNotifiedAt,
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!p) return;

    // Back above the reorder point: re-arm the low-stock alert.
    if (p.lowStockNotifiedAt) {
      const threshold = await getSetting<number>("store.lowStockThreshold", 5);
      if (!isLowStock({ stock: change.stockAfter, reorderPoint: p.reorderPoint }, threshold)) {
        await db
          .update(products)
          .set({ lowStockNotifiedAt: null })
          .where(eq(products.id, productId));
      }
    }

    // Out of stock and now available again: tell whoever asked to be told.
    if (change.stockBefore <= 0 && change.stockAfter > 0) {
      await notifyBackInStock(productId, p.name, p.slug);
    }
  } catch (err) {
    console.error("[stock] restock side-effects failed for", productId, err);
  }
}

/** The atomic part: read, compute and write one product's stock in one lock. */
async function applyStockChangeCore(
  tx: Tx,
  opts: {
    productId: string;
    delta: number;
    reason: string;
    byUserId?: string | null;
    setTo?: number;
    orderId?: string | null;
  },
): Promise<StockChange | null> {
  const [row] = await tx
    .select({ stock: products.stock })
    .from(products)
    .where(eq(products.id, opts.productId));
  if (!row || row.stock == null) return null;

  const stockBefore = row.stock;
  const target = opts.setTo != null ? Math.max(0, Math.round(opts.setTo)) : stockBefore + opts.delta;
  const stockAfter = Math.max(0, target);
  const applied = stockAfter - stockBefore;

  // A no-op still returns cleanly, but writes no ledger row: a movement of
  // zero is noise, not history.
  if (applied === 0) {
    return { movementId: null, applied: 0, stockAfter, stockBefore, clamped: opts.setTo == null && opts.delta !== 0 };
  }

  await tx.update(products).set({ stock: stockAfter }).where(eq(products.id, opts.productId));
  const [movement] = await tx
    .insert(stockMovements)
    .values({
      productId: opts.productId,
      delta: applied,
      reason: opts.reason,
      stockAfter,
      createdByUserId: opts.byUserId ?? null,
      orderId: opts.orderId ?? null,
    })
    .returning({ id: stockMovements.id });

  return {
    movementId: movement?.id ?? null,
    applied,
    stockAfter,
    stockBefore,
    clamped: opts.setTo == null && applied !== opts.delta,
  };
}

/**
 * Consume units from a product's batches, earliest expiry first (FEFO).
 *
 * Batches account for how the flat on-hand figure is made up, so this runs
 * alongside `applyStockChange` rather than replacing it. Best-effort: a shop
 * that doesn't track batches for a product simply has none to consume, and a
 * sale must never fail because lot bookkeeping couldn't be completed.
 *
 * Returns the lots touched, so a picking list can name them.
 */
export async function consumeBatchesFefo(
  productId: string,
  quantity: number,
  today = dateInRome(),
): Promise<{ lotCode: string; expiryDate: string | null; taken: number }[]> {
  if (quantity <= 0) return [];
  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(productBatches)
        .where(eq(productBatches.productId, productId));
      const open = rows
        // An **expired** lot is not stock, it is waste awaiting a write-off, and
        // sorting by expiry ascending meant it was the very first thing a sale
        // was attributed to. Because `/admin/products/scadenze` only lists lots
        // with units left, an expired lot quietly drained to zero through
        // ordinary sales and vanished off the one report whose job is to say
        // "throw this away" — the report erasing exactly what it exists to
        // surface. Skipping them leaves the lot sitting there demanding a
        // decision. The sale itself is unaffected: `products.stock` is the
        // authority on whether there is anything to sell, and lots only explain
        // how that figure is made up.
        .filter((b) => b.remaining > 0 && !(b.expiryDate != null && b.expiryDate < today))
        // Earliest expiry first; lots with no expiry go last (they can wait).
        .sort((a, b) => {
          if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate);
          if (a.expiryDate) return -1;
          if (b.expiryDate) return 1;
          return (a.receivedAt?.getTime() ?? 0) - (b.receivedAt?.getTime() ?? 0);
        });

      let left = quantity;
      const taken: { lotCode: string; expiryDate: string | null; taken: number }[] = [];
      for (const batch of open) {
        if (left <= 0) break;
        const take = Math.min(batch.remaining, left);
        await tx
          .update(productBatches)
          .set({ remaining: batch.remaining - take })
          .where(eq(productBatches.id, batch.id));
        taken.push({ lotCode: batch.lotCode, expiryDate: batch.expiryDate, taken: take });
        left -= take;
      }
      return taken;
    });
  } catch {
    // Lot bookkeeping is advisory — never let it fail a sale.
    return [];
  }
}

/** Put units back into the most recently consumed lots (a refund or a cancel). */
export async function restoreBatches(productId: string, quantity: number): Promise<void> {
  if (quantity <= 0) return;
  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(productBatches)
        .where(eq(productBatches.productId, productId));
      // The mirror of FEFO consumption, so a return lands back in the lot it
      // most likely came out of. Consumption goes earliest expiry first and
      // undated lots *last*, so undoing it goes undated first and then latest
      // expiry down to earliest. Coalescing null to "" got the dated lots right
      // and the undated ones exactly backwards, putting them at the end of both
      // orders instead of at opposite ends.
      const batches = rows.sort((a, b) => {
        if (a.expiryDate == null && b.expiryDate == null) {
          return (b.receivedAt?.getTime() ?? 0) - (a.receivedAt?.getTime() ?? 0);
        }
        if (a.expiryDate == null) return -1;
        if (b.expiryDate == null) return 1;
        return b.expiryDate.localeCompare(a.expiryDate);
      });

      let left = quantity;
      for (const batch of batches) {
        if (left <= 0) break;
        const room = batch.quantity - batch.remaining;
        if (room <= 0) continue;
        const give = Math.min(room, left);
        await tx
          .update(productBatches)
          .set({ remaining: batch.remaining + give })
          .where(eq(productBatches.id, batch.id));
        left -= give;
      }
    });
  } catch {
    /* advisory */
  }
}
