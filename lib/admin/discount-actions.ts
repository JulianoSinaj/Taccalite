"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { discountCodes, discountRedemptions } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm, discountInput } from "@/lib/validation/admin";

/** Create or update a discount code. Admin-only (coupons move money). */
export async function saveDiscount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(discountInput, fd);

    // Convert the raw `value` into its stored integer form per type.
    const storedValue =
      d.type === "percent"
        ? Math.min(100, Math.round(d.value))
        : d.type === "fixed"
          ? Math.round(d.value * 100) // euros → cents
          : 0;

    const values = {
      code: d.code,
      type: d.type,
      value: storedValue,
      minSubtotalCents: d.minSubtotalEuros,
      maxRedemptions: d.maxRedemptions,
      maxPerCustomer: d.maxPerCustomer,
      firstOrderOnly: d.firstOrderOnly,
      shopSlug: d.shopSlug ?? null,
      startsAt: d.startsAt ? new Date(`${d.startsAt}T00:00:00`) : null,
      endsAt: d.endsAt ? new Date(`${d.endsAt}T23:59:59`) : null,
      active: d.active,
    };

    if (d.endsAt && d.startsAt && values.endsAt! < values.startsAt!) {
      throw new ActionError("La data di fine non può precedere quella di inizio.");
    }

    if (d.id) {
      await db.update(discountCodes).set(values).where(eq(discountCodes.id, d.id));
    } else {
      try {
        await db.insert(discountCodes).values(values);
      } catch {
        throw new ActionError("Esiste già un codice con questo nome.");
      }
    }
    await logAudit({
      actor,
      action: d.id ? "discount.update" : "discount.create",
      entity: "discount",
      entityId: d.id ?? d.code,
      summary: `Codice sconto ${d.code} (${d.type})`,
      meta: { type: d.type, value: storedValue },
    });
    revalidatePath("/admin/discounts");
    return ok(d.id ? "Codice salvato." : "Codice creato.");
  });
}

export async function toggleDiscountActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = (fd.get("id") ?? "").toString();
    const active = fd.get("active") === "true";
    const [row] = await db
      .update(discountCodes)
      .set({ active })
      .where(eq(discountCodes.id, id))
      .returning({ code: discountCodes.code });
    // Re-arming a coupon is as money-affecting as creating one, which is
    // already logged.
    await logAudit({
      actor,
      action: "discount.active",
      entity: "discount",
      entityId: id,
      summary: `Codice sconto ${row?.code ?? id} ${active ? "attivato" : "disattivato"}`,
      meta: { active },
    });
    revalidatePath("/admin/discounts");
    return ok(active ? "Codice attivato." : "Codice disattivato.");
  });
}

/**
 * Delete a discount code.
 *
 * `discount_redemptions` snapshots the code as text rather than pointing at
 * this row, so the money history survives the delete — but the page that reads
 * it is this code's own detail page, so deleting a code that has been used
 * hides its ledger with no way back to it. A used code is history; deactivating
 * takes it out of circulation and keeps the trail.
 */
export async function deleteDiscount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = (fd.get("id") ?? "").toString();
    // Read first: this used to delete blind, so a stale id reported success and
    // logged a deletion that never happened.
    const [row] = await db
      .select({ code: discountCodes.code })
      .from(discountCodes)
      .where(eq(discountCodes.id, id))
      .limit(1);
    if (!row) throw new ActionError("Codice non trovato.");

    const [{ used }] = await db
      .select({ used: sql<number>`count(*)` })
      .from(discountRedemptions)
      .where(eq(discountRedemptions.discountCode, row.code));
    if (Number(used) > 0) {
      throw new ActionError(
        `Il codice ${row.code} è stato usato ${used} volte: eliminarlo nasconderebbe lo storico dei suoi utilizzi. Disattivalo invece.`,
      );
    }

    await db.delete(discountCodes).where(eq(discountCodes.id, id));
    await logAudit({
      actor,
      action: "discount.delete",
      entity: "discount",
      entityId: id,
      summary: `Codice sconto eliminato: ${row.code}`,
    });
    revalidatePath("/admin/discounts");
    return ok("Codice eliminato.");
  });
}
