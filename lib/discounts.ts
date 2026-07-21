import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { discountCodes } from "@/lib/db/schema";

export type AppliedDiscount = {
  id: string;
  code: string;
  /** Amount taken off the subtotal, in cents (0 for a free-shipping code). */
  discountCents: number;
  /** True when the code waives shipping. */
  freeShipping: boolean;
};

/** Normalise a user-entered code to the stored form (uppercase, trimmed). */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Validate a discount code against an order subtotal and return the concrete
 * amount it takes off (and whether it waives shipping). Returns null when the
 * code is unknown, inactive, out of its validity window, over its redemption
 * cap, or the subtotal is below its minimum. Never throws — the caller treats a
 * null result as "no discount applied".
 *
 * The subtotal is VAT-inclusive (gross), matching how catalogue prices are
 * stored; the discount therefore reduces the gross the customer pays.
 */
export async function validateDiscount(
  rawCode: string | undefined | null,
  subtotalCents: number,
  now: Date = new Date(),
): Promise<AppliedDiscount | null> {
  if (!rawCode) return null;
  const code = normalizeCode(rawCode);
  if (!code) return null;

  const [row] = await db
    .select()
    .from(discountCodes)
    .where(and(eq(discountCodes.code, code), eq(discountCodes.active, true)))
    .limit(1);
  if (!row) return null;

  if (row.startsAt && now < row.startsAt) return null;
  if (row.endsAt && now > row.endsAt) return null;
  if (row.maxRedemptions != null && row.timesUsed >= row.maxRedemptions) return null;
  if (subtotalCents < row.minSubtotalCents) return null;

  let discountCents = 0;
  let freeShipping = false;
  if (row.type === "percent") {
    discountCents = Math.round((subtotalCents * row.value) / 100);
  } else if (row.type === "fixed") {
    discountCents = Math.min(row.value, subtotalCents);
  } else {
    freeShipping = true;
  }
  // Never discount more than the subtotal.
  discountCents = Math.max(0, Math.min(discountCents, subtotalCents));

  return { id: row.id, code, discountCents, freeShipping };
}

/** Atomically record a redemption (increment the usage counter). Best-effort. */
export async function recordDiscountUse(id: string): Promise<void> {
  try {
    await db
      .update(discountCodes)
      .set({ timesUsed: sql`${discountCodes.timesUsed} + 1` })
      .where(eq(discountCodes.id, id));
  } catch {
    /* usage bookkeeping is non-fatal */
  }
}
