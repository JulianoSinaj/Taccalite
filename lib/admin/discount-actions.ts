"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { discountCodes } from "@/lib/db/schema";
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
    await requireRole("admin");
    const id = (fd.get("id") ?? "").toString();
    const active = fd.get("active") === "true";
    await db.update(discountCodes).set({ active }).where(eq(discountCodes.id, id));
    revalidatePath("/admin/discounts");
    return ok(active ? "Codice attivato." : "Codice disattivato.");
  });
}

export async function deleteDiscount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = (fd.get("id") ?? "").toString();
    await db.delete(discountCodes).where(eq(discountCodes.id, id));
    await logAudit({ actor, action: "discount.delete", entity: "discount", entityId: id, summary: `Codice sconto eliminato (${id})` });
    revalidatePath("/admin/discounts");
    return ok("Codice eliminato.");
  });
}
