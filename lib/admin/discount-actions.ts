"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { discountCodes, discountRedemptions } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm, discountInput } from "@/lib/validation/admin";

const LIST = "/admin/discounts";

/**
 * A code and how much history it carries. `discount_redemptions` snapshots the
 * code as text rather than pointing at the row, and `timesUsed` may also count
 * uses recorded before the ledger existed — so either one makes a code history,
 * and history is what the rename and delete guards below protect.
 */
async function loadUsage(id: string): Promise<{ code: string; used: number } | null> {
  const [row] = await db
    .select({ code: discountCodes.code, timesUsed: discountCodes.timesUsed })
    .from(discountCodes)
    .where(eq(discountCodes.id, id))
    .limit(1);
  if (!row) return null;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(discountRedemptions)
    .where(eq(discountRedemptions.discountCode, row.code));
  return { code: row.code, used: Math.max(row.timesUsed, Number(n)) };
}

const isDuplicateCode = (err: unknown) =>
  err instanceof Error && /UNIQUE constraint failed:\s*discount_codes\.code/i.test(err.message);

/** Create or update a discount code. Admin-only (coupons move money). */
export async function saveDiscount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(discountInput, fd);

    // The stored integer form per type: a whole percent, cents, or nothing.
    // Range and sign are enforced by the schema, so nothing is clamped here.
    const storedValue = d.type === "percent" ? d.value : d.type === "fixed" ? Math.round(d.value * 100) : 0;

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

    if (d.id) {
      const current = await loadUsage(d.id);
      if (!current) throw new ActionError("Codice non trovato.");
      // The ledger is keyed on the code text: renaming a used code would make
      // its history unreachable while the counter kept saying it was used.
      if (current.code !== d.code && current.used > 0) {
        throw new ActionError(
          `Il codice ${current.code} è già stato usato ${current.used} volte e il suo nome non si può cambiare: lo storico degli utilizzi è legato al nome. Crea un nuovo codice e disattiva questo.`,
        );
      }
    }

    try {
      if (d.id) {
        await db.update(discountCodes).set(values).where(eq(discountCodes.id, d.id));
      } else {
        await db.insert(discountCodes).values(values);
      }
    } catch (err) {
      // Same answer whether the clash comes from a create or a rename — the
      // update used to surface the raw constraint error.
      if (isDuplicateCode(err)) throw new ActionError(`Esiste già un codice ${d.code}.`);
      throw err;
    }

    await logAudit({
      actor,
      action: d.id ? "discount.update" : "discount.create",
      entity: "discount",
      entityId: d.id ?? d.code,
      summary: `Codice sconto ${d.code} (${d.type})`,
      meta: { type: d.type, value: storedValue },
    });
    revalidatePath(LIST);
    if (d.id) revalidatePath(`${LIST}/${d.id}`);
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
    if (!row) throw new ActionError("Codice non trovato.");
    // Re-arming a coupon is as money-affecting as creating one, which is
    // already logged.
    await logAudit({
      actor,
      action: "discount.active",
      entity: "discount",
      entityId: id,
      summary: `Codice sconto ${row.code} ${active ? "attivato" : "disattivato"}`,
      meta: { active },
    });
    revalidatePath(LIST);
    revalidatePath(`${LIST}/${id}`);
    return ok(active ? "Codice attivato." : "Codice disattivato.");
  });
}

/**
 * Delete a discount code that has never been used.
 *
 * A used code is history: its ledger is read from its own detail page, so
 * deleting the code would hide the money trail with no way back to it.
 * Deactivating takes it out of circulation and keeps the trail. The list hides
 * the button for used codes; this is the guard behind it.
 */
export async function deleteDiscount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = (fd.get("id") ?? "").toString();
    // Read first: a stale id used to report success and log a deletion that
    // never happened.
    const current = await loadUsage(id);
    if (!current) throw new ActionError("Codice non trovato.");
    if (current.used > 0) {
      throw new ActionError(
        `Il codice ${current.code} è stato usato ${current.used} volte: eliminarlo nasconderebbe lo storico dei suoi utilizzi. Disattivalo invece.`,
      );
    }

    await db.delete(discountCodes).where(eq(discountCodes.id, id));
    await logAudit({
      actor,
      action: "discount.delete",
      entity: "discount",
      entityId: id,
      summary: `Codice sconto eliminato: ${current.code}`,
    });
    revalidatePath(LIST);
    return ok("Codice eliminato.");
  });
}
