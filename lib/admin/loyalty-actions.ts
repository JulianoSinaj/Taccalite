"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { addPointsForPurchase } from "@/lib/loyalty";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm } from "@/lib/validation/admin";

/** In-shop purchase accrual: card non-empty, euros a positive number ≤ 100000. */
const purchaseInput = z.object({
  card: z.string().trim().min(1, "Inserisci il numero tessera"),
  euros: z.coerce
    .number()
    .refine((v) => Number.isFinite(v) && v > 0, "Importo non valido")
    .refine((v) => v <= 100000, "Importo troppo elevato"),
});

/**
 * Credit loyalty points for an in-shop purchase, identified by card number.
 *
 * Staff-allowed (`requireAdmin` covers admin OR staff): this is legitimate,
 * purchase-tied accrual, unlike arbitrary point adjustment (`adjustPoints`)
 * which stays admin-only. `addPointsForPurchase` only ever credits points.
 */
export async function addPointsByCard(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireAdmin();
    const { card, euros } = parseForm(purchaseInput, fd);

    const res = await addPointsForPurchase(card, euros, user.id);
    if (!res.ok) throw new ActionError(res.error);

    // Points are money-equivalent and this is the one such action staff perform
    // unsupervised at the counter, so it goes in the audit trail — the loyalty
    // ledger alone records the credit but not who stood at the till.
    await logAudit({
      actor: user,
      action: "loyalty.accrue_card",
      entity: "user",
      entityId: res.userId,
      summary: `Punti in negozio: +${res.added} a ${res.name} per un acquisto di ${euros.toFixed(2)} € (tessera ${card.trim()})`,
      meta: { card: card.trim(), euros, points: res.added, balance: res.balance },
    });

    revalidatePath("/admin/loyalty");
    return ok(`+${res.added} punti a ${res.name} (saldo ${res.balance})`);
  });
}
