"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { addPointsForPurchase, redeemRewardAtCounter } from "@/lib/loyalty";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm } from "@/lib/validation/admin";

/** In-shop purchase accrual: card non-empty, euros a positive number ≤ 100000,
 *  receipt number optional. */
const purchaseInput = z.object({
  card: z.string().trim().min(1, "Inserisci il numero tessera"),
  euros: z.coerce
    .number()
    .refine((v) => Number.isFinite(v) && v > 0, "Importo non valido")
    .refine((v) => v <= 100000, "Importo troppo elevato"),
  receipt: z
    .string()
    .trim()
    .max(40, "Numero scontrino troppo lungo")
    .optional()
    .transform((v) => v || undefined),
});

const counterRedeemInput = z.object({
  card: z.string().trim().min(1, "Inserisci il numero tessera"),
  rewardId: z.string().trim().min(1, "Scegli un premio"),
});

/** What the counter screen shows after a credit, once the form has been cleared. */
export type CounterCredit = { card: string; name: string; added: number; balance: number };

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
    const { card, euros, receipt } = parseForm(purchaseInput, fd);

    const res = await addPointsForPurchase(card, euros, user.id, receipt);
    if (!res.ok) throw new ActionError(res.error);

    // Points are money-equivalent and this is the one such action staff perform
    // unsupervised at the counter, so it goes in the audit trail — the loyalty
    // ledger alone records the credit but not who stood at the till.
    await logAudit({
      actor: user,
      action: "loyalty.accrue_card",
      entity: "user",
      entityId: res.userId,
      summary: `Punti in negozio: +${res.added} a ${res.name} per un acquisto di ${euros.toFixed(2)} € (tessera ${card.trim()}${
        receipt ? `, scontrino ${receipt}` : ""
      })`,
      meta: { card: card.trim(), euros, receipt: receipt ?? null, points: res.added, balance: res.balance },
    });

    revalidatePath("/admin/loyalty");
    revalidatePath(`/admin/loyalty/${res.userId}`);
    const credit: CounterCredit = { card: card.trim(), name: res.name, added: res.added, balance: res.balance };
    return ok(`+${res.added} punti a ${res.name} (saldo ${res.balance})`, credit);
  });
}

/**
 * Claim a reward for the customer at the counter and hand it over in one step.
 *
 * Staff-allowed for the same reason as the accrual: it is the customer's own
 * points being spent on a catalogue reward, with every check `redeemReward`
 * applies to the customer's own click — not an arbitrary debit.
 */
export async function redeemAtCounter(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireAdmin();
    const { card, rewardId } = parseForm(counterRedeemInput, fd);

    const res = await redeemRewardAtCounter(card, rewardId, user.id);
    if (!res.ok) throw new ActionError(res.error);

    await logAudit({
      actor: user,
      action: "loyalty.redeem_counter",
      entity: "redemption",
      entityId: res.redemptionId,
      summary: `Premio consegnato al banco: «${res.rewardName}» a ${res.name} (−${res.pointsSpent} punti, saldo ${res.balance}, tessera ${card})`,
      meta: { card, rewardId, pointsSpent: res.pointsSpent, balance: res.balance },
    });

    revalidatePath("/admin/loyalty");
    revalidatePath(`/admin/loyalty/${res.userId}`);
    // Stock, for a reward that tracks it, just went down by one.
    revalidatePath("/admin/rewards");
    return ok(`«${res.rewardName}» consegnato a ${res.name} (saldo ${res.balance})`);
  });
}
