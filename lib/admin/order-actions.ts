"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { type ActionState, runAction, ok } from "@/lib/admin/action-state";
import { parseForm, orderStatusInput } from "@/lib/validation/admin";

export async function updateOrderStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const d = parseForm(orderStatusInput, fd);
    await db
      .update(orders)
      .set({
        status: d.status,
        // Payment status is editable alongside fulfilment status when provided.
        ...(d.paymentStatus ? { paymentStatus: d.paymentStatus } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, d.id));
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${d.id}`);
    return ok("Ordine aggiornato.");
  });
}
